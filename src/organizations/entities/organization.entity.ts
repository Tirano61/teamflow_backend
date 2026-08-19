import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { OrganizationInvitation } from '../../organization_invitations/entities/organization-invitation.entity';

@Entity('organizations')
export class Organization {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column('varchar', { length: 120 })
	name: string;

	@Column('varchar', { length: 160, unique: true })
	slug: string;

	@ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'created_by' })
	createdBy: User;

	@OneToMany(() => Membership, (membership) => membership.organization)
	memberships: Membership[];

	@OneToMany(() => OrganizationInvitation, (invitation) => invitation.organization)
	invitations: OrganizationInvitation[];

	@CreateDateColumn({ name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt: Date;
}
