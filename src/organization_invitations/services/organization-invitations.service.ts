import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { MembershipsService } from '../../memberships/services/memberships.service';
import { Organization } from '../../organizations/entities/organization.entity';
import { CreateOrganizationInvitationDto } from '../dto/create-organization-invitation.dto';
import { OrganizationInvitation } from '../entities/organization-invitation.entity';
import { InvitationStatus } from '../enums/invitation-status.enum';

@Injectable()
export class OrganizationInvitationsService {
	constructor(
		@InjectRepository(OrganizationInvitation)
		private readonly invitationRepository: Repository<OrganizationInvitation>,
		@InjectRepository(Membership)
		private readonly membershipRepository: Repository<Membership>,
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

	async createInvitation(
		organizationId: string,
		dto: CreateOrganizationInvitationDto,
		user: User,
	): Promise<OrganizationInvitation> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanInvite(requesterMembership);

		if (dto.role === OrganizationRole.OWNER) {
			throw new BadRequestException('Invitations cannot grant OWNER role');
		}

		const invitation = this.invitationRepository.create({
			organization: { id: organizationId },
			email: dto.email,
			role: dto.role,
			token: this.generateToken(),
			status: InvitationStatus.PENDING,
			expiresAt: this.buildExpirationDate(),
			createdBy: { id: user.id },
		});

		return this.invitationRepository.save(invitation);
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

			if (invitation.email !== user.email.trim().toLowerCase()) {
				throw new ForbiddenException('Invitation email does not match current user');
			}

			const existingMembership = await membershipRepository.findOne({
				where: {
					user: { id: user.id },
					organization: { id: invitation.organization.id },
				},
			});

			if (existingMembership) {
				throw new BadRequestException('User already belongs to this organization');
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
