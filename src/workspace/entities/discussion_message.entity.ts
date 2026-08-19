import {
	Column,
	CreateDateColumn,
	Entity,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { DiscussionMessageType } from '../enums/discussion-message-type.enum';
import { Discussion } from './discussion.entity';

@Entity('discussion_messages')
export class DiscussionMessage {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => Discussion, (discussion) => discussion.messages, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'discussion_id' })
	discussion!: Discussion;

	@ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'author_id' })
	author!: User;

	@Column({
		type: 'enum',
		enum: DiscussionMessageType,
		enumName: 'discussion_message_type_enum',
		default: DiscussionMessageType.TEXT,
	})
	type!: DiscussionMessageType;

	@Column('text', { nullable: true })
	content!: string | null;

	@Column('text', { name: 'file_url', nullable: true })
	fileUrl!: string | null;

	@Column('varchar', { name: 'file_name', length: 255, nullable: true })
	fileName!: string | null;

	@Column('varchar', { name: 'mime_type', length: 255, nullable: true })
	mimeType!: string | null;

	@Column('integer', { name: 'file_size', nullable: true })
	fileSize!: number | null;

	@Column('varchar', {
		name: 'cloudinary_public_id',
		length: 255,
		nullable: true,
	})
	cloudinaryPublicId!: string | null;

	@CreateDateColumn({ name: 'created_at' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt!: Date;
}
