import {
	BeforeInsert,
	BeforeUpdate,
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';
import { InvitationStatus } from '../enums/invitation-status.enum';

@Entity('organization_invitations')
export class OrganizationInvitation {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => Organization, (organization) => organization.invitations, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;

	@Column('text')
	email: string;

	@Column({
		type: 'enum',
		enum: OrganizationRole,
		enumName: 'organization_role_enum',
	})
	role: OrganizationRole;

	@Column('text', { unique: true })
	token: string;

	@Column({
		type: 'enum',
		enum: InvitationStatus,
		enumName: 'invitation_status_enum',
		default: InvitationStatus.PENDING,
	})
	status: InvitationStatus;

	@Column({ name: 'expires_at', type: 'timestamptz' })
	expiresAt: Date;

	@Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
	acceptedAt: Date | null;

	@ManyToOne(() => User, (user) => user.createdOrganizationInvitations, {
		nullable: false,
		onDelete: 'RESTRICT',
	})
	@JoinColumn({ name: 'created_by' })
	createdBy: User;

	@CreateDateColumn({ name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt: Date;

	@BeforeInsert()
	@BeforeUpdate()
	normalizeEmail() {
		if (this.email) {
			this.email = this.email.trim().toLowerCase();
		}
	}
}
