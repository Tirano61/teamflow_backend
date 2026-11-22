import {
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { MembershipStatus } from '../../memberships/enums/membership-status.enum';
import { UserDevice } from '../entities/user_device.entity';
import { UpsertUserDeviceDto } from '../dto/upsert-user-device.dto';
import { DevicePlatform } from '../enums/device-platform.enum';

/** Dispositivo al que se envia un push, con el usuario por cuenta del cual se envia. */
export interface PushRecipientDevice {
	userId: string;
	token: string;
}

interface UpsertedDeviceRow {
	id: string;
	user_id: string;
	fcm_token: string;
	platform: DevicePlatform;
	last_seen_at: Date;
	created_at: Date;
	updated_at: Date;
	previous_user_id: string | null;
}

@Injectable()
export class UserDeviceService {
	private readonly logger = new Logger(UserDeviceService.name);
	private readonly staleAfterDays: number | null;

	constructor(
		@InjectRepository(UserDevice)
		private readonly userDeviceRepository: Repository<UserDevice>,
		configService: ConfigService,
	) {
		this.staleAfterDays = this.parseStaleAfterDays(
			configService.get<string>('FCM_DEVICE_STALE_AFTER_DAYS'),
		);
	}

	/**
	 * `FCM_DEVICE_STALE_AFTER_DAYS` (opcional): si se define con un entero positivo, los envios
	 * automaticos omiten los dispositivos cuyo `last_seen_at` es mas antiguo que esa cantidad de
	 * dias. No borra registros. Sin definir (o invalido) no se filtra por antiguedad.
	 */
	private parseStaleAfterDays(raw: string | undefined): number | null {
		const value = raw?.trim();
		if (!value) return null;

		const days = Number(value);
		if (!Number.isInteger(days) || days <= 0) {
			this.logger.warn(
				'FCM_DEVICE_STALE_AFTER_DAYS must be a positive integer; stale device filtering is disabled.',
			);
			return null;
		}
		return days;
	}

	private normalizeToken(token: string): string {
		return token.trim();
	}

	/**
	 * Registra el token para el usuario autenticado en una sola sentencia atomica. Si el token ya
	 * existia (mismo dispositivo con otra cuenta, o registro repetido), la fila se reasigna a este
	 * usuario y se actualizan `platform` y `last_seen_at`. Dos registros concurrentes del mismo token
	 * no pueden duplicarlo: el ultimo en confirmar queda como dueno.
	 */
	async upsertUserDevice(dto: UpsertUserDeviceDto, user: User): Promise<UserDevice> {
		const normalizedToken = this.normalizeToken(dto.token);

		const rows: UpsertedDeviceRow[] = await this.userDeviceRepository.query(
			`
				WITH previous AS (
					SELECT user_id FROM public.user_devices WHERE fcm_token = $1
				)
				INSERT INTO public.user_devices (user_id, fcm_token, platform, last_seen_at)
				VALUES ($2, $1, $3, now())
				ON CONFLICT (fcm_token) DO UPDATE SET
					user_id = EXCLUDED.user_id,
					platform = EXCLUDED.platform,
					last_seen_at = EXCLUDED.last_seen_at,
					updated_at = now()
				RETURNING
					id, user_id, fcm_token, platform, last_seen_at, created_at, updated_at,
					(SELECT user_id FROM previous) AS previous_user_id
			`,
			[normalizedToken, user.id, dto.platform],
		);

		const row = rows[0];
		if (!row) {
			throw new InternalServerErrorException('Unable to register device token');
		}

		if (row.previous_user_id && row.previous_user_id !== user.id) {
			this.logger.log(
				`Device token reassigned deviceId=${row.id} fromUserId=${row.previous_user_id} toUserId=${user.id}`,
			);
		}

		// Misma forma de respuesta que antes: el registro con `user` reducido a `{ id }`.
		return {
			id: row.id,
			user: { id: row.user_id } as User,
			fcmToken: row.fcm_token,
			platform: row.platform,
			lastSeenAt: row.last_seen_at,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		};
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

	async findPushDevicesByUserId(userId: string): Promise<PushRecipientDevice[]> {
		const devices = await this.userDeviceRepository.find({
			where: { user: { id: userId } },
			order: { updatedAt: 'DESC' },
		});

		return devices.map((device) => ({ userId, token: device.fcmToken }));
	}

	/**
	 * Destinatarios de un evento de `organizationId`, en una sola consulta: dispositivos de usuarios
	 * activos (`users.isActive`) con Membership `ACTIVE` en esa organization, excluyendo al actor.
	 * La Membership se evalua en el momento del envio, asi que una suspension o salida previa ya
	 * excluye al usuario. `fcm_token` es unico y la Membership es unica por (user, organization),
	 * por lo que no hay filas duplicadas.
	 */
	async findPushRecipientsForOrganization(
		organizationId: string,
		excludedUserId: string,
	): Promise<PushRecipientDevice[]> {
		const query = this.userDeviceRepository
			.createQueryBuilder('device')
			.innerJoin('device.user', 'user')
			.innerJoin(
				'user.memberships',
				'membership',
				'membership.organization_id = :organizationId AND membership.status = :activeStatus',
				{ organizationId, activeStatus: MembershipStatus.ACTIVE },
			)
			.select('device.fcm_token', 'token')
			.addSelect('user.id', 'userId')
			.where('user.isActive = true')
			.andWhere('user.id <> :excludedUserId', { excludedUserId });

		if (this.staleAfterDays !== null) {
			query.andWhere('device.last_seen_at >= now() - make_interval(days => :staleAfterDays)', {
				staleAfterDays: this.staleAfterDays,
			});
		}

		return query.getRawMany<PushRecipientDevice>();
	}

	/**
	 * Elimina registros que Firebase rechazo de forma definitiva. Cada token se borra solo si sigue
	 * perteneciendo al usuario para el que se envio: si en el medio se reasigno a otra cuenta, el
	 * registro nuevo no se toca.
	 */
	async removeRejectedDevices(devices: PushRecipientDevice[]): Promise<number> {
		if (!devices.length) return 0;

		const result: [unknown[], number] = await this.userDeviceRepository.query(
			`
				DELETE FROM public.user_devices AS device
				USING unnest($1::text[], $2::uuid[]) AS rejected(token, user_id)
				WHERE device.fcm_token = rejected.token AND device.user_id = rejected.user_id
			`,
			[devices.map((device) => device.token), devices.map((device) => device.userId)],
		);

		return result[1] ?? 0;
	}
}
