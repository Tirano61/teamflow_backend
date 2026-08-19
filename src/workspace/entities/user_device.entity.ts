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
import { DevicePlatform } from '../enums/device-platform.enum';

@Entity('user_devices')
export class UserDevice {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => User, (user) => user.userDevices, {
		nullable: false,
		onDelete: 'CASCADE',
	})
	@JoinColumn({ name: 'user_id' })
	user!: User;

	@Column('text', { name: 'fcm_token', unique: true })
	fcmToken!: string;

	@Column({
		type: 'enum',
		enum: DevicePlatform,
		enumName: 'device_platform_enum',
		default: DevicePlatform.ANDROID,
	})
	platform!: DevicePlatform;

	@Column({ name: 'last_seen_at', type: 'timestamptz' })
	lastSeenAt!: Date;

	@CreateDateColumn({ name: 'created_at' })
	createdAt!: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt!: Date;
}
