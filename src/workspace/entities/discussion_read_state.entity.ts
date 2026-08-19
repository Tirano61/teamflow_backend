import {
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	Unique,
	UpdateDateColumn,
	Column,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Discussion } from './discussion.entity';

@Entity('discussion_read_states')
@Unique('uq_discussion_read_states_discussion_user', ['discussion', 'user'])
export class DiscussionReadState {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => Discussion, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'discussion_id' })
	discussion!: Discussion;

	@ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user!: User;

	@Column({ name: 'last_read_at', type: 'timestamptz' })
	lastReadAt!: Date;

	@CreateDateColumn({ name: 'created_at' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt!: Date;
}
