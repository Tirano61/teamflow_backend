import {
	BadRequestException,
	ConflictException,
	HttpException,
	HttpStatus,
	Injectable,
	InternalServerErrorException,
	Logger,
	NotFoundException,
	ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, In, MoreThan, QueryFailedError, Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { MailService } from '../../mail/mail.service';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipsService } from '../../memberships/services/memberships.service';
import { CreateSecurityVerificationDto } from '../dto/create-security-verification.dto';
import {
	SecurityVerificationRequestedResponse,
	SecurityVerificationVerifiedResponse,
} from '../dto/security-verification.response';
import { VerifySecurityVerificationDto } from '../dto/verify-security-verification.dto';
import { SecurityVerification } from '../entities/security-verification.entity';
import { SecurityVerificationPurpose } from '../enums/security-verification-purpose.enum';
import { SecurityVerificationStatus } from '../enums/security-verification-status.enum';
import {
	SECURITY_VERIFICATION_AUTHORIZATION_TTL_MS,
	SECURITY_VERIFICATION_CODE_LENGTH,
	SECURITY_VERIFICATION_CODE_TTL_MS,
	SECURITY_VERIFICATION_MAX_ATTEMPTS,
	SECURITY_VERIFICATION_OPEN_SCOPE_INDEX,
	SECURITY_VERIFICATION_RESEND_COOLDOWN_MS,
} from '../security-verification.constants';
import { buildSecurityVerificationEmail } from '../templates/security-verification-email.template';

interface VerificationScope {
	userId: string;
	organizationId: string;
	purpose: SecurityVerificationPurpose;
}

/// Resultado de un intento de verificacion. Los rechazos se devuelven en lugar de lanzarse dentro
/// de la transaccion para que se confirme lo que el intento escribio (intentos fallidos, LOCKED,
/// EXPIRED) y recien despues se responda con el error.
type VerifyOutcome =
	| { kind: 'verified'; response: SecurityVerificationVerifiedResponse }
	| { kind: 'rejected'; exception: HttpException };

/// Error de cada status no verificable. PENDING no aparece: es el unico status verificable.
const NOT_PENDING_EXCEPTIONS: Record<
	Exclude<SecurityVerificationStatus, SecurityVerificationStatus.PENDING>,
	() => HttpException
> = {
	[SecurityVerificationStatus.VERIFIED]: () =>
		new ConflictException('Security verification has already been verified'),
	[SecurityVerificationStatus.CONSUMED]: () =>
		new ConflictException('Security verification has already been used'),
	[SecurityVerificationStatus.SUPERSEDED]: () =>
		new ConflictException('Security verification was replaced by a newer request'),
	[SecurityVerificationStatus.EXPIRED]: () =>
		new ConflictException('Security verification has expired, request a new code'),
	[SecurityVerificationStatus.LOCKED]: () =>
		new HttpException(
			'Maximum number of verification attempts reached, request a new code',
			HttpStatus.TOO_MANY_REQUESTS,
		),
};

/**
 * Verificacion por email de operaciones sensibles, reutilizable por purpose.
 * Flujo: solicitar codigo (PENDING) -> verificar codigo (VERIFIED) -> la operacion sensible
 * consume la autorizacion (CONSUMED) con `consumeAuthorization`.
 */
@Injectable()
export class SecurityVerificationsService {
	private readonly logger = new Logger(SecurityVerificationsService.name);

	constructor(
		@InjectRepository(SecurityVerification)
		private readonly verificationRepository: Repository<SecurityVerification>,
		private readonly membershipsService: MembershipsService,
		private readonly mailService: MailService,
		private readonly configService: ConfigService,
		private readonly dataSource: DataSource,
	) {}

	/**
	 * Solicita un codigo nuevo para (usuario autenticado, organization del path, purpose).
	 * Invalida las verificaciones abiertas anteriores del mismo scope y envia el codigo al email
	 * del usuario autenticado. El codigo nunca se devuelve.
	 */
	async requestVerification(
		organizationId: string,
		dto: CreateSecurityVerificationDto,
		user: User,
	): Promise<SecurityVerificationRequestedResponse> {
		const membership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		this.assertCanUsePurpose(dto.purpose, membership);
		const codeSecret = this.getCodeSecret();

		const scope: VerificationScope = {
			userId: user.id,
			organizationId,
			purpose: dto.purpose,
		};

		try {
			return await this.dataSource.transaction(async (manager) => {
				const verificationRepository = manager.getRepository(SecurityVerification);
				const now = new Date();

				/// Cooldown entre envios del mismo scope, cualquiera sea el status de la ultima
				/// verificacion (incluida una LOCKED: bloquearla no habilita un reenvio inmediato).
				const latestVerification = await verificationRepository.findOne({
					where: { ...scope },
					order: { createdAt: 'DESC' },
				});

				if (latestVerification) {
					const resendAvailableAt = new Date(
						latestVerification.createdAt.getTime() + SECURITY_VERIFICATION_RESEND_COOLDOWN_MS,
					);
					if (resendAvailableAt > now) {
						throw this.buildCooldownException(resendAvailableAt, now);
					}
				}

				await this.closeOpenVerifications(verificationRepository, scope, now);

				/// El id se genera aca porque forma parte del input del hash: el hash queda ligado a
				/// esta fila y a su scope.
				const id = randomUUID();
				const code = this.generateCode();
				const expiresAt = new Date(now.getTime() + SECURITY_VERIFICATION_CODE_TTL_MS);

				/// Si otra solicitud concurrente del mismo scope ya inserto su verificacion, este INSERT
				/// choca con el indice unico parcial (23505) y la transaccion completa hace rollback.
				await verificationRepository.insert({
					id,
					...scope,
					status: SecurityVerificationStatus.PENDING,
					codeHash: this.hashCode(codeSecret, { id, ...scope }, code),
					failedAttempts: 0,
					maxAttempts: SECURITY_VERIFICATION_MAX_ATTEMPTS,
					expiresAt,
					createdAt: now,
				});

				/// El email se envia dentro de la transaccion: si el proveedor falla, se hace rollback
				/// (no queda un codigo que nadie recibio, no corre el cooldown y las verificaciones
				/// anteriores siguen como estaban).
				await this.sendVerificationEmail(user, membership.organization.name, dto.purpose, code);

				return {
					verificationId: id,
					purpose: dto.purpose,
					expiresAt,
					resendAvailableAt: new Date(now.getTime() + SECURITY_VERIFICATION_RESEND_COOLDOWN_MS),
				};
			});
		} catch (error) {
			if (this.isOpenScopeConflict(error)) {
				throw new HttpException(
					'A security verification was requested concurrently, try again later',
					HttpStatus.TOO_MANY_REQUESTS,
				);
			}
			throw error;
		}
	}

	/**
	 * Verifica el codigo de una verificacion PENDING del usuario autenticado en la organization
	 * del path. Exito: PENDING -> VERIFIED. No consume la autorizacion.
	 */
	async verifyCode(
		organizationId: string,
		verificationId: string,
		dto: VerifySecurityVerificationDto,
		user: User,
	): Promise<SecurityVerificationVerifiedResponse> {
		const membership = await this.membershipsService.requireActiveMembership(
			user.id,
			organizationId,
		);
		const codeSecret = this.getCodeSecret();

		const outcome = await this.dataSource.transaction(async (manager): Promise<VerifyOutcome> => {
			const verificationRepository = manager.getRepository(SecurityVerification);

			/// Anti-IDOR: nunca solo por `verificationId`. Una verificacion de otro usuario u otra
			/// organization es indistinguible de una inexistente (mismo 404).
			/// FOR UPDATE serializa los intentos concurrentes sobre la misma verificacion: cada uno
			/// ve los intentos fallidos ya registrados y el status final del anterior.
			const verification = await verificationRepository
				.createQueryBuilder('verification')
				.addSelect('verification.codeHash')
				.where('verification.id = :verificationId', { verificationId })
				.andWhere('verification.userId = :userId', { userId: user.id })
				.andWhere('verification.organizationId = :organizationId', { organizationId })
				.setLock('pessimistic_write')
				.getOne();

			if (!verification) {
				return this.reject(new NotFoundException('Security verification not found'));
			}

			/// El permiso se vuelve a exigir sobre el purpose almacenado (nunca uno enviado por el cliente).
			this.assertCanUsePurpose(verification.purpose, membership);

			if (verification.status !== SecurityVerificationStatus.PENDING) {
				return this.reject(NOT_PENDING_EXCEPTIONS[verification.status]());
			}

			const now = new Date();

			if (verification.expiresAt <= now) {
				await verificationRepository.update(
					{ id: verification.id },
					{ status: SecurityVerificationStatus.EXPIRED, invalidatedAt: now },
				);
				return this.reject(NOT_PENDING_EXCEPTIONS[SecurityVerificationStatus.EXPIRED]());
			}

			if (!this.isCodeMatch(codeSecret, verification, dto.code)) {
				const failedAttempts = verification.failedAttempts + 1;

				if (failedAttempts >= verification.maxAttempts) {
					await verificationRepository.update(
						{ id: verification.id },
						{ failedAttempts, status: SecurityVerificationStatus.LOCKED, invalidatedAt: now },
					);
					return this.reject(
						new HttpException(
							'Invalid verification code. Maximum number of verification attempts reached, request a new code',
							HttpStatus.TOO_MANY_REQUESTS,
						),
					);
				}

				await verificationRepository.update({ id: verification.id }, { failedAttempts });
				return this.reject(new BadRequestException('Invalid verification code'));
			}

			const authorizationExpiresAt = new Date(
				now.getTime() + SECURITY_VERIFICATION_AUTHORIZATION_TTL_MS,
			);

			await verificationRepository.update(
				{ id: verification.id },
				{ status: SecurityVerificationStatus.VERIFIED, verifiedAt: now, authorizationExpiresAt },
			);

			return {
				kind: 'verified',
				response: {
					verificationId: verification.id,
					purpose: verification.purpose,
					verifiedAt: now,
					authorizationExpiresAt,
				},
			};
		});

		if (outcome.kind === 'rejected') {
			throw outcome.exception;
		}

		return outcome.response;
	}

	/**
	 * Uso interno (no expuesto por HTTP): autorizacion VERIFIED, vigente y no consumida del
	 * usuario para ese purpose en esa organization, o null. No modifica nada.
	 * Por el indice unico parcial existe como maximo una por scope.
	 * Para ejecutar la operacion sensible no alcanza con consultar: hay que consumir con
	 * `consumeAuthorization` dentro de la misma transaccion.
	 */
	async findUsableAuthorization(
		userId: string,
		organizationId: string,
		purpose: SecurityVerificationPurpose,
		manager?: EntityManager,
	): Promise<SecurityVerification | null> {
		return this.getRepository(manager).findOne({
			where: {
				userId,
				organizationId,
				purpose,
				status: SecurityVerificationStatus.VERIFIED,
				authorizationExpiresAt: MoreThan(new Date()),
			},
		});
	}

	async hasUsableAuthorization(
		userId: string,
		organizationId: string,
		purpose: SecurityVerificationPurpose,
		manager?: EntityManager,
	): Promise<boolean> {
		const authorization = await this.findUsableAuthorization(
			userId,
			organizationId,
			purpose,
			manager,
		);
		return authorization !== null;
	}

	/**
	 * Uso interno (no expuesto por HTTP): consume la autorizacion VERIFIED vigente del scope
	 * (VERIFIED -> CONSUMED). Devuelve `true` solo si este llamado la consumio.
	 * UPDATE condicional atomico: de dos consumos concurrentes, solo uno obtiene `true`.
	 * Debe recibir el `manager` de la transaccion de la operacion sensible: si la operacion falla
	 * y hace rollback, la autorizacion vuelve a quedar VERIFIED.
	 */
	async consumeAuthorization(
		userId: string,
		organizationId: string,
		purpose: SecurityVerificationPurpose,
		manager?: EntityManager,
	): Promise<boolean> {
		const now = new Date();
		const updateResult = await this.getRepository(manager)
			.createQueryBuilder()
			.update(SecurityVerification)
			.set({ status: SecurityVerificationStatus.CONSUMED, consumedAt: now })
			.where('user_id = :userId', { userId })
			.andWhere('organization_id = :organizationId', { organizationId })
			.andWhere('purpose = :purpose', { purpose })
			.andWhere('status = :verified', { verified: SecurityVerificationStatus.VERIFIED })
			.andWhere('authorization_expires_at > :now', { now })
			.execute();

		return (updateResult.affected ?? 0) > 0;
	}

	/**
	 * Permiso requerido por cada purpose. Se exige al solicitar y otra vez al verificar.
	 */
	private assertCanUsePurpose(purpose: SecurityVerificationPurpose, membership: Membership): void {
		switch (purpose) {
			case SecurityVerificationPurpose.DELETE_ORGANIZATION:
				this.membershipsService.assertCanDeleteOrganization(membership);
				return;
			default: {
				const unsupportedPurpose: never = purpose;
				throw new BadRequestException(
					`Unsupported security verification purpose: ${String(unsupportedPurpose)}`,
				);
			}
		}
	}

	/**
	 * Cierra las verificaciones abiertas (PENDING/VERIFIED) del scope antes de crear una nueva:
	 * las ya vencidas pasan a EXPIRED y el resto a SUPERSEDED. Asi solo queda valido el codigo
	 * mas reciente, incluida una autorizacion VERIFIED todavia no consumida.
	 */
	private async closeOpenVerifications(
		verificationRepository: Repository<SecurityVerification>,
		scope: VerificationScope,
		now: Date,
	): Promise<void> {
		await verificationRepository
			.createQueryBuilder()
			.update(SecurityVerification)
			.set({ status: SecurityVerificationStatus.EXPIRED, invalidatedAt: now })
			.where('user_id = :userId', { userId: scope.userId })
			.andWhere('organization_id = :organizationId', { organizationId: scope.organizationId })
			.andWhere('purpose = :purpose', { purpose: scope.purpose })
			.andWhere(
				'((status = :pending AND expires_at <= :now) OR (status = :verified AND authorization_expires_at <= :now))',
				{
					pending: SecurityVerificationStatus.PENDING,
					verified: SecurityVerificationStatus.VERIFIED,
					now,
				},
			)
			.execute();

		await verificationRepository.update(
			{
				...scope,
				status: In([SecurityVerificationStatus.PENDING, SecurityVerificationStatus.VERIFIED]),
			},
			{ status: SecurityVerificationStatus.SUPERSEDED, invalidatedAt: now },
		);
	}

	private reject(exception: HttpException): VerifyOutcome {
		return { kind: 'rejected', exception };
	}

	private buildCooldownException(resendAvailableAt: Date, now: Date): HttpException {
		const retryAfterSeconds = Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000);
		return new HttpException(
			`A security verification was requested recently, try again in ${retryAfterSeconds} seconds`,
			HttpStatus.TOO_MANY_REQUESTS,
		);
	}

	private isOpenScopeConflict(error: unknown): boolean {
		if (!(error instanceof QueryFailedError)) return false;
		const driverError = error.driverError as { code?: string; constraint?: string } | undefined;
		return (
			driverError?.code === '23505' &&
			driverError.constraint === SECURITY_VERIFICATION_OPEN_SCOPE_INDEX
		);
	}

	/**
	 * Secreto del HMAC del codigo. Un codigo de 6 digitos tiene solo 10^6 valores: un hash sin
	 * clave se revertiria por fuerza bruta si se filtrara la base, el HMAC con secreto no.
	 */
	private getCodeSecret(): string {
		const secret = this.configService.get<string>('SECURITY_VERIFICATION_SECRET')?.trim();
		if (!secret) {
			this.logger.error('SECURITY_VERIFICATION_SECRET is not configured');
			throw new InternalServerErrorException('Security verification is not configured');
		}
		return secret;
	}

	/// Codigo numerico uniforme de 6 digitos con CSPRNG (incluye ceros a la izquierda).
	private generateCode(): string {
		return randomInt(0, 10 ** SECURITY_VERIFICATION_CODE_LENGTH)
			.toString()
			.padStart(SECURITY_VERIFICATION_CODE_LENGTH, '0');
	}

	/// HMAC-SHA256 del codigo ligado a la fila y a su scope (id, user, organization, purpose).
	private hashCode(
		secret: string,
		binding: { id: string } & VerificationScope,
		code: string,
	): string {
		return createHmac('sha256', secret)
			.update([binding.id, binding.userId, binding.organizationId, binding.purpose, code].join(':'))
			.digest('hex');
	}

	/// Comparacion en tiempo constante.
	private isCodeMatch(secret: string, verification: SecurityVerification, code: string): boolean {
		const expected = Buffer.from(verification.codeHash, 'hex');
		const actual = Buffer.from(this.hashCode(secret, verification, code), 'hex');
		return expected.length === actual.length && timingSafeEqual(expected, actual);
	}

	private async sendVerificationEmail(
		user: User,
		organizationName: string,
		purpose: SecurityVerificationPurpose,
		code: string,
	): Promise<void> {
		const content = buildSecurityVerificationEmail({
			recipientName: user.fullName ?? '',
			organizationName,
			purpose,
			code,
			expiresInMinutes: SECURITY_VERIFICATION_CODE_TTL_MS / 60_000,
		});

		try {
			await this.mailService.sendMail({
				to: user.fullName ? { email: user.email, name: user.fullName } : { email: user.email },
				...content,
			});
		} catch {
			/// MailService ya registro la causa (sin destinatario ni contenido). Al cliente solo le
			/// llega un 503 generico.
			throw new ServiceUnavailableException('Verification email could not be sent, try again later');
		}
	}

	private getRepository(manager?: EntityManager): Repository<SecurityVerification> {
		return manager ? manager.getRepository(SecurityVerification) : this.verificationRepository;
	}
}
