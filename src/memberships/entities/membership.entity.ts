import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { MembershipStatus } from '../enums/membership-status.enum';
import { OrganizationRole } from '../enums/organization-role.enum';

@Entity('memberships')
@Unique('uq_memberships_user_organization', ['user', 'organization'])
export class Membership {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ManyToOne(() => User, (user) => user.memberships, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'user_id' })
	user: User;

	@ManyToOne(() => Organization, (organization) => organization.memberships, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;

	@Column({
		type: 'enum',
		enum: OrganizationRole,
		enumName: 'organization_role_enum',
	})
	role: OrganizationRole;

	@Column({
		type: 'enum',
		enum: MembershipStatus,
		enumName: 'membership_status_enum',
		default: MembershipStatus.ACTIVE,
	})
	status: MembershipStatus;

	@Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
	joinedAt: Date;

	@CreateDateColumn({ name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt: Date;
}
