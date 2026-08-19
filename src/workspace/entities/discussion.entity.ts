import {
	Column,
	CreateDateColumn,
	Entity,
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
import { Application } from './application.entity';
import { Indicator } from './indicator.entity';
import { DiscussionMessage } from './discussion_message.entity';
import { DiscussionReadState } from './discussion_read_state.entity';
import { Tag } from './tag.entity';

@Entity('discussions')
export class Discussion {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

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

	@ManyToMany(() => Application, (application) => application.discussions)
	@JoinTable({
		name: 'discussion_applications',
		joinColumn: { name: 'discussion_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'application_id', referencedColumnName: 'id' },
	})
	applications!: Application[];

	@ManyToMany(() => Indicator, (indicator) => indicator.discussions)
	@JoinTable({
		name: 'discussion_indicators',
		joinColumn: { name: 'discussion_id', referencedColumnName: 'id' },
		inverseJoinColumn: { name: 'indicator_id', referencedColumnName: 'id' },
	})
	indicators!: Indicator[];

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
