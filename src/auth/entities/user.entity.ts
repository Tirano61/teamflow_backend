import { UserDevice } from 'src/workspace/entities/user_device.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { OrganizationInvitation } from '../../organization_invitations/entities/organization-invitation.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import {
	BeforeInsert,
	BeforeUpdate,
	Column,
	Entity,
	OneToMany,
	PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('text', { unique: true })
	email: string;

	@Column('text', {
		select: false,
	})
	password: string;

	@Column('text')
	fullName: string;

	@Column('bool', {
		default: true,
	})
	isActive: boolean;

	@Column('text', {
		array: true,
		default: ['user'],
	})
	roles: string[];

	@OneToMany(() => UserDevice, (device) => device.user)
	userDevices: UserDevice[];

	@OneToMany(() => Membership, (membership) => membership.user)
	memberships: Membership[];

	@OneToMany(() => Organization, (organization) => organization.createdBy)
	createdOrganizations: Organization[];

	@OneToMany(
		() => OrganizationInvitation,
		(invitation) => invitation.createdBy,
	)
	createdOrganizationInvitations: OrganizationInvitation[];

	@Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
	created_at: Date;

	@Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
	updated_at: Date;

	@BeforeInsert()
	checkFieldsBeforeInsert() {
		this.email = this.email.toLocaleLowerCase().trim();
	}

	@BeforeUpdate()
	checkFieldsBeforeUpdate() {
		this.checkFieldsBeforeInsert();
	}
}
