import {
	Injectable,
	InternalServerErrorException,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { UserDevice } from '../entities/user_device.entity';
import { UpsertUserDeviceDto } from '../dto/upsert-user-device.dto';

@Injectable()
export class UserDeviceService {
	constructor(
		@InjectRepository(UserDevice)
		private readonly userDeviceRepository: Repository<UserDevice>,
	) { }

	private normalizeToken(token: string): string {
		return token.trim();
	}

	private async getByToken(token: string): Promise<UserDevice | null> {
		return this.userDeviceRepository.findOne({
			where: { fcmToken: token },
			relations: ['user'],
		});
	}

	private isUniqueViolation(error: unknown): boolean {
		return (
			error instanceof QueryFailedError &&
			(error as QueryFailedError & { code?: string }).code === '23505'
		);
	}

	async upsertUserDevice(dto: UpsertUserDeviceDto, user: User): Promise<UserDevice> {
		const normalizedToken = this.normalizeToken(dto.token);
		const now = new Date();

		let device = await this.getByToken(normalizedToken);

		if (!device) {
			try {
				device = this.userDeviceRepository.create({
					user: { id: user.id } as User,
					fcmToken: normalizedToken,
					platform: dto.platform,
					lastSeenAt: now,
				});

				return await this.userDeviceRepository.save(device);
			} catch (error) {
				if (!this.isUniqueViolation(error)) throw error;
				device = await this.getByToken(normalizedToken);
				if (!device) {
					throw new InternalServerErrorException(
						'Unable to register device token',
					);
				}
			}
		}

		device.user = { id: user.id } as User;
		device.platform = dto.platform;
		device.lastSeenAt = now;
		return this.userDeviceRepository.save(device);
	}

	async removeUserDeviceByToken(token: string, user: User): Promise<void> {
		const normalizedToken = this.normalizeToken(token);
		const device = await this.userDeviceRepository.findOne({
			where: {
				fcmToken: normalizedToken,
				user: { id: user.id },
			},
		});

		if (!device) {
			throw new NotFoundException('Device token not found for current user');
		}

		await this.userDeviceRepository.remove(device);
	}

	async findByUserId(userId: string): Promise<UserDevice[]> {
		return this.userDeviceRepository.find({
			where: { user: { id: userId } },
			order: { updatedAt: 'DESC' },
		});
	}

	async findByUserIds(userIds: string[]): Promise<UserDevice[]> {
		if (!userIds.length) return [];

		return this.userDeviceRepository
			.createQueryBuilder('device')
			.leftJoinAndSelect('device.user', 'user')
			.where('user.id IN (:...userIds)', { userIds })
			.orderBy('device.updated_at', 'DESC')
			.getMany();
	}

	async removeByTokenList(tokens: string[]): Promise<number> {
		if (!tokens.length) return 0;

		const deleteResult = await this.userDeviceRepository
			.createQueryBuilder()
			.delete()
			.from(UserDevice)
			.where('fcm_token IN (:...tokens)', { tokens })
			.execute();

		return deleteResult.affected ?? 0;
	}
}
