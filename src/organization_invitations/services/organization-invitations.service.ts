import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, IsNull, MoreThan, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { MembershipsService } from '../../memberships/services/memberships.service';
import { Organization } from '../../organizations/entities/organization.entity';
import { PendingInvitationResponse } from '../../me/dto/user-context.response';
import { CreateOrganizationInvitationDto } from '../dto/create-organization-invitation.dto';
import { OrganizationInvitationResponse } from '../dto/organization-invitation.response';
import { OrganizationInvitation } from '../entities/organization-invitation.entity';
import { InvitationStatus } from '../enums/invitation-status.enum';

@Injectable()
export class OrganizationInvitationsService {
	constructor(
		@InjectRepository(OrganizationInvitation)
		private readonly invitationRepository: Repository<OrganizationInvitation>,
		@InjectRepository(Membership)
		private readonly membershipRepository: Repository<Membership>,
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly membershipsService: MembershipsService,
		private readonly dataSource: DataSource,
	) {}

	private generateToken(): string {
		return randomBytes(32).toString('hex');
	}

	private buildExpirationDate(): Date {
		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + 7);
		return expiresAt;
	}

	/**
	 * Marca como EXPIRED las invitaciones PENDING vencidas del usuario.
	 * Contempla invitaciones nuevas (invited_user_id) e invitaciones antiguas solo con email.
	 */
	private async expireOutdatedInvitationsForUser(
		userId: string,
		email: string,
	): Promise<void> {
		await this.invitationRepository
			.createQueryBuilder()
			.update(OrganizationInvitation)
			.set({ status: InvitationStatus.EXPIRED })
			.where('status = :pending', { pending: InvitationStatus.PENDING })
			.andWhere('expires_at <= :now', { now: new Date() })
			.andWhere(
				'(invited_user_id = :userId OR (invited_user_id IS NULL AND email = :email))',
				{ userId, email },
			)
			.execute();
	}

	async listPendingInvitationsForUser(user: User): Promise<PendingInvitationResponse[]> {
		const normalizedEmail = user.email.trim().toLowerCase();
		const now = new Date();

		await this.expireOutdatedInvitationsForUser(user.id, normalizedEmail);

		const invitations = await this.invitationRepository
			.createQueryBuilder('invitation')
			.innerJoinAndSelect('invitation.organization', 'organization')
			.where('invitation.status = :pending', { pending: InvitationStatus.PENDING })
			.andWhere('invitation.expiresAt > :now', { now })
			.andWhere(
				'(invitation.invitedUserId = :userId OR (invitation.invitedUserId IS NULL AND invitation.email = :email))',
				{ userId: user.id, email: normalizedEmail },
			)
			.orderBy('invitation.createdAt', 'DESC')
			.getMany();

		return invitations.map((invitation) => ({
			invitationId: invitation.id,
			organizationId: invitation.organization.id,
			organizationName: invitation.organization.name,
			organizationSlug: invitation.organization.slug,
			role: invitation.role,
			expiresAt: invitation.expiresAt,
			token: invitation.token,
		}));
	}

	async createInvitation(
		organizationId: string,
		dto: CreateOrganizationInvitationDto,
		user: User,
	): Promise<OrganizationInvitationResponse> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanInvite(requesterMembership);

		if (dto.role === OrganizationRole.OWNER) {
			throw new BadRequestException('Invitations cannot grant OWNER role');
		}

		const invitedUser = await this.userRepository.findOne({
			where: { id: dto.userId },
		});

		if (!invitedUser) {
			throw new NotFoundException('Invited user not found');
		}

		if (invitedUser.id === user.id) {
			throw new BadRequestException('You cannot invite yourself');
		}

		const existingMembership = await this.membershipRepository.findOne({
			where: {
				user: { id: invitedUser.id },
				organization: { id: organizationId },
				status: MembershipStatus.ACTIVE,
			},
		});

		if (existingMembership) {
			throw new ConflictException('User already belongs to this organization');
		}

		const normalizedEmail = invitedUser.email.trim().toLowerCase();
		await this.expireOutdatedInvitationsForUser(invitedUser.id, normalizedEmail);

		const existingPendingInvitation = await this.invitationRepository.findOne({
			where: [
				{
					organization: { id: organizationId },
					status: InvitationStatus.PENDING,
					expiresAt: MoreThan(new Date()),
					invitedUserId: invitedUser.id,
				},
				{
					organization: { id: organizationId },
					status: InvitationStatus.PENDING,
					expiresAt: MoreThan(new Date()),
					invitedUserId: IsNull(),
					email: normalizedEmail,
				},
			],
		});

		if (existingPendingInvitation) {
			throw new ConflictException(
				'There is already a pending invitation for this user in this organization',
			);
		}

		const invitation = this.invitationRepository.create({
			organization: { id: organizationId } as Organization,
			invitedUserId: invitedUser.id,
			email: normalizedEmail,
			role: dto.role,
			token: this.generateToken(),
			status: InvitationStatus.PENDING,
			expiresAt: this.buildExpirationDate(),
			createdBy: { id: user.id } as User,
		});

		const savedInvitation = await this.invitationRepository.save(invitation);

		return {
			id: savedInvitation.id,
			organizationId,
			invitedUser: {
				id: invitedUser.id,
				email: invitedUser.email,
				fullName: invitedUser.fullName,
			},
			email: savedInvitation.email,
			role: savedInvitation.role,
			status: savedInvitation.status,
			token: savedInvitation.token,
			expiresAt: savedInvitation.expiresAt,
			acceptedAt: savedInvitation.acceptedAt,
			createdAt: savedInvitation.createdAt,
		};
	}

	async acceptInvitation(token: string, user: User): Promise<Membership> {
		return this.dataSource.transaction(async (manager) => {
			const invitationRepository = manager.getRepository(OrganizationInvitation);
			const membershipRepository = manager.getRepository(Membership);

			const invitation = await invitationRepository.findOne({
				where: { token },
				relations: ['organization'],
			});

			if (!invitation) {
				throw new NotFoundException('Invitation not found');
			}

			if (invitation.status !== InvitationStatus.PENDING) {
				throw new BadRequestException('Invitation is not pending');
			}

			if (invitation.expiresAt <= new Date()) {
				throw new BadRequestException('Invitation has expired');
			}

			if (invitation.invitedUserId) {
				/// Flujo interno actual: la invitacion pertenece a un usuario concreto.
				if (invitation.invitedUserId !== user.id) {
					throw new ForbiddenException('Invitation does not belong to current user');
				}
			} else {
				/// Compatibilidad: invitaciones antiguas creadas solo con email.
				if (invitation.email !== user.email.trim().toLowerCase()) {
					throw new ForbiddenException('Invitation email does not match current user');
				}
				invitation.invitedUserId = user.id;
			}

			const existingMembership = await membershipRepository.findOne({
				where: {
					user: { id: user.id },
					organization: { id: invitation.organization.id },
				},
			});

			if (existingMembership) {
				throw new ConflictException('User already belongs to this organization');
			}

			const membership = membershipRepository.create({
				user: { id: user.id } as User,
				organization: { id: invitation.organization.id } as Organization,
				role: invitation.role,
				status: MembershipStatus.ACTIVE,
				joinedAt: new Date(),
			});

			invitation.status = InvitationStatus.ACCEPTED;
			invitation.acceptedAt = new Date();

			await invitationRepository.save(invitation);
			return membershipRepository.save(membership);
		});
	}
}
