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
import { WorkModule } from '../../workspace/entities/work-module.entity';
import { Component } from '../../workspace/entities/component.entity';
import { Tag } from '../../workspace/entities/tag.entity';
import { Discussion } from '../../workspace/entities/discussion.entity';

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

	@OneToMany(() => WorkModule, (workModule) => workModule.organization)
	workModules: WorkModule[];

	@OneToMany(() => Component, (component) => component.organization)
	components: Component[];

	@OneToMany(() => Tag, (tag) => tag.organization)
	tags: Tag[];

	@OneToMany(() => Discussion, (discussion) => discussion.organization)
	discussions: Discussion[];

	@CreateDateColumn({ name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt: Date;
}
