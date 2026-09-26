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
import {
	OrganizationInvitationResponse,
	OrganizationInvitationSummaryResponse,
} from '../dto/organization-invitation.response';
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
	 * Regla unica de expiracion: PENDING con `expires_at` vencido pasa a EXPIRED.
	 * Los callers acotan el alcance (por usuario o por organization).
	 */
	private buildExpireOutdatedInvitationsQuery() {
		return this.invitationRepository
			.createQueryBuilder()
			.update(OrganizationInvitation)
			.set({ status: InvitationStatus.EXPIRED })
			.where('status = :pending', { pending: InvitationStatus.PENDING })
			.andWhere('expires_at <= :now', { now: new Date() });
	}

	/**
	 * Marca como EXPIRED las invitaciones PENDING vencidas del usuario.
	 * Contempla invitaciones nuevas (invited_user_id) e invitaciones antiguas solo con email.
	 */
	private async expireOutdatedInvitationsForUser(
		userId: string,
		email: string,
	): Promise<void> {
		await this.buildExpireOutdatedInvitationsQuery()
			.andWhere(
				'(invited_user_id = :userId OR (invited_user_id IS NULL AND email = :email))',
				{ userId, email },
			)
			.execute();
	}

	/**
	 * Marca como EXPIRED las invitaciones PENDING vencidas de una organization.
	 * Se ejecuta antes de listar/cancelar para que el estado devuelto sea el real.
	 */
	private async expireOutdatedInvitationsForOrganization(organizationId: string): Promise<void> {
		await this.buildExpireOutdatedInvitationsQuery()
			.andWhere('organization_id = :organizationId', { organizationId })
			.execute();
	}

	private toInvitationSummary(
		invitation: OrganizationInvitation,
	): OrganizationInvitationSummaryResponse {
		return {
			invitationId: invitation.id,
			invitedUser: invitation.invitedUser
				? {
						id: invitation.invitedUser.id,
						email: invitation.invitedUser.email,
						fullName: invitation.invitedUser.fullName,
					}
				: null,
			email: invitation.email,
			role: invitation.role,
			status: invitation.status,
			expiresAt: invitation.expiresAt,
			acceptedAt: invitation.acceptedAt,
			createdAt: invitation.createdAt,
		};
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

		/// Se busca cualquier Membership del invitado en la organization, sin filtrar por status,
		/// para distinguir los tres casos:
		/// - ACTIVE: ya pertenece -> 409.
		/// - SUSPENDED: sigue perteneciendo; una invitacion no sustituye la reactivacion
		///   administrativa (`POST .../members/:membershipId/reactivate`) -> 409.
		/// - LEFT: abandono voluntariamente y puede recibir una nueva invitacion. Al aceptarla se
		///   reutiliza esa misma Membership (LEFT -> ACTIVE) con el role de la nueva invitacion.
		const existingMembership = await this.membershipRepository.findOne({
			where: {
				user: { id: invitedUser.id },
				organization: { id: organizationId },
			},
		});

		if (existingMembership && existingMembership.status !== MembershipStatus.LEFT) {
			throw new ConflictException(
				existingMembership.status === MembershipStatus.SUSPENDED
					? 'User has a suspended membership in this organization; reactivate it instead of inviting again'
					: 'User already belongs to this organization',
			);
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

	/**
	 * Vista administrativa: invitaciones de una organization, mas recientes primero.
	 * Tenant-safe: siempre se filtra por `organizationId` del path.
	 */
	async listInvitationsForOrganization(
		organizationId: string,
		user: User,
	): Promise<OrganizationInvitationSummaryResponse[]> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanManageInvitations(requesterMembership);

		await this.expireOutdatedInvitationsForOrganization(organizationId);

		const invitations = await this.invitationRepository.find({
			where: { organization: { id: organizationId } },
			relations: ['invitedUser'],
			order: { createdAt: 'DESC' },
		});

		return invitations.map((invitation) => this.toInvitationSummary(invitation));
	}

	/**
	 * Cancela una invitacion PENDING de la organization indicada.
	 * No borra el registro ni toca Memberships.
	 */
	async cancelInvitation(
		organizationId: string,
		invitationId: string,
		user: User,
	): Promise<OrganizationInvitationSummaryResponse> {
		const requesterMembership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.membershipsService.assertCanManageInvitations(requesterMembership);

		await this.expireOutdatedInvitationsForOrganization(organizationId);

		/// Nunca se busca solo por `invitationId`: la organization del path es parte del filtro (anti-IDOR).
		const invitation = await this.invitationRepository.findOne({
			where: {
				id: invitationId,
				organization: { id: organizationId },
			},
			relations: ['invitedUser'],
		});

		if (!invitation) {
			throw new NotFoundException('Invitation not found in this organization');
		}

		if (invitation.status !== InvitationStatus.PENDING) {
			throw new ConflictException(
				`Invitation cannot be cancelled because its status is ${invitation.status}`,
			);
		}

		/// Update condicional: evita cancelar una invitacion aceptada en paralelo.
		const updateResult = await this.invitationRepository.update(
			{ id: invitation.id, status: InvitationStatus.PENDING },
			{ status: InvitationStatus.CANCELLED },
		);

		if (updateResult.affected === 0) {
			throw new ConflictException('Invitation is no longer pending and cannot be cancelled');
		}

		invitation.status = InvitationStatus.CANCELLED;
		return this.toInvitationSummary(invitation);
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

			/// Cualquier Membership previa del usuario en la organization, sin filtrar por status:
			/// nunca se crea una segunda Membership para el mismo par (user, organization).
			const existingMembership = await membershipRepository.findOne({
				where: {
					user: { id: user.id },
					organization: { id: invitation.organization.id },
				},
			});

			/// ACTIVE o SUSPENDED: sigue perteneciendo -> 409 y la invitacion queda PENDING.
			/// Un SUSPENDED no reingresa aceptando invitaciones: eso es reactivacion administrativa.
			if (existingMembership && existingMembership.status !== MembershipStatus.LEFT) {
				throw new ConflictException('User already belongs to this organization');
			}

			invitation.status = InvitationStatus.ACCEPTED;
			invitation.acceptedAt = new Date();

			if (existingMembership) {
				/// Reingreso: se reutiliza la Membership LEFT (mismo id) con el role de la nueva
				/// invitacion; el role anterior no se conserva. `joinedAt` no se toca: sigue
				/// representando la primera incorporacion, igual que en suspend/reactivate.
				/// Update condicional por status LEFT dentro de la misma transaccion: dos
				/// aceptaciones concurrentes no producen una doble transicion, y si falla no queda
				/// invitation ACCEPTED con Membership LEFT ni Membership ACTIVE con invitation PENDING.
				const updateResult = await membershipRepository.update(
					{ id: existingMembership.id, status: MembershipStatus.LEFT },
					{ role: invitation.role, status: MembershipStatus.ACTIVE },
				);

				if (updateResult.affected === 0) {
					throw new ConflictException(
						'Membership was modified concurrently, retry the operation',
					);
				}

				await invitationRepository.save(invitation);

				/// Misma forma de respuesta que el alta: la Membership con `user` y `organization`
				/// reducidos a su id (no se expone la entidad User completa).
				const rejoinedMembership = await membershipRepository.findOneOrFail({
					where: { id: existingMembership.id },
				});
				rejoinedMembership.user = { id: user.id } as User;
				rejoinedMembership.organization = { id: invitation.organization.id } as Organization;
				return rejoinedMembership;
			}

			const membership = membershipRepository.create({
				user: { id: user.id } as User,
				organization: { id: invitation.organization.id } as Organization,
				role: invitation.role,
				status: MembershipStatus.ACTIVE,
				joinedAt: new Date(),
			});

			await invitationRepository.save(invitation);
			return membershipRepository.save(membership);
		});
	}
}
