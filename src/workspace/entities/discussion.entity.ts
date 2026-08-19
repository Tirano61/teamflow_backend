import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	JoinTable,
	ManyToMany,
	ManyToOne,
	OneToMany,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { DiscussionStatus } from '../enums/discussion-status.enum';
import { DiscussionType } from '../enums/discussion-type.enum';
import { WorkModule } from './work-module.entity';
import { Component } from './component.entity';
import { DiscussionMessage } from './discussion_message.entity';
import { DiscussionReadState } from './discussion_read_state.entity';
import { Tag } from './tag.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('discussions')
@Index('idx_discussions_organization_id', ['organizationId'])
export class Discussion {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ name: 'organization_id', type: 'uuid' })
	organizationId!: string;

	@ManyToOne(() => Organization, (organization) => organization.discussions, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'organization_id' })
	organization!: Organization;

	@Column({
		type: 'enum',
		enum: DiscussionType,
		enumName: 'discussion_type_enum',
	})
	type!: DiscussionType;

	@Column({ length: 150 })
	title!: string;

	@Column({
		type: 'enum',
		enum: DiscussionStatus,
		enumName: 'discussion_status_enum',
		default: DiscussionStatus.NEW,
	})
	status!: DiscussionStatus;

	@ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'created_by' })
	createdBy!: User;

	@ManyToMany(() => User)
	@JoinTable({
		name: 'discussion_assignments',
		joinColumn: { name: 'discussion_id', referencedColumnName: 'id' },
		inverseJoinColumn: {
			name: 'developer_user_id',
			referencedColumnName: 'id',
		},
	})
	assignedDevelopers!: User[];

	@CreateDateColumn({ name: 'created_at' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt!: Date;

	@ManyToMany(() => WorkModule, (workModule) => workModule.discussions)
	@JoinTable({
		name: 'discussion_work_modules',
		joinColumn: { name: 'discussion_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'work_module_id', referencedColumnName: 'id' },
	})
	workModules!: WorkModule[];

	@ManyToMany(() => Component, (component) => component.discussions)
	@JoinTable({
		name: 'discussion_components',
		joinColumn: { name: 'discussion_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'component_id', referencedColumnName: 'id' },
	})
	components!: Component[];

	@ManyToMany(() => Tag, (tag) => tag.discussions)
	@JoinTable({
		name: 'discussion_tags',
		joinColumn: { name: 'discussion_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
	})
	tags!: Tag[];

	@OneToMany(() => DiscussionMessage, (message) => message.discussion)
	messages!: DiscussionMessage[];

	@OneToMany(() => DiscussionReadState, (readState) => readState.discussion)
	readStates!: DiscussionReadState[];

	// Propiedad calculada para la API; no se persiste en base de datos.
	isUnread?: boolean;
}
