import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { SecurityVerificationPurpose } from '../enums/security-verification-purpose.enum';
import { SecurityVerificationStatus } from '../enums/security-verification-status.enum';

/**
 * Verificacion por email de una operacion sensible, ligada a (user, organization, purpose).
 * Distingue tres momentos: codigo solicitado (`createdAt`, PENDING), codigo verificado
 * (`verifiedAt`, VERIFIED) y autorizacion consumida por la operacion (`consumedAt`, CONSUMED).
 * Las filas cerradas se conservan como historial: no hay constraint que lo impida.
 */
@Entity('security_verifications')
@Index('idx_security_verifications_scope', ['organizationId', 'userId', 'purpose', 'createdAt'])
@Index('uq_security_verifications_open_scope', ['userId', 'organizationId', 'purpose'], {
	unique: true,
	where: `"status" IN ('PENDING', 'VERIFIED')`,
})
export class SecurityVerification {
	/// Se genera en la aplicacion antes del INSERT porque forma parte del input del hash del codigo.
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ name: 'user_id', type: 'uuid' })
	userId: string;

	@ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'user_id' })
	user: User;

	@Column({ name: 'organization_id', type: 'uuid' })
	organizationId: string;

	@ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'organization_id' })
	organization: Organization;

	@Column({
		type: 'enum',
		enum: SecurityVerificationPurpose,
		enumName: 'security_verification_purpose_enum',
	})
	purpose: SecurityVerificationPurpose;

	@Column({
		type: 'enum',
		enum: SecurityVerificationStatus,
		enumName: 'security_verification_status_enum',
		default: SecurityVerificationStatus.PENDING,
	})
	status: SecurityVerificationStatus;

	/// HMAC-SHA256 (hex) del codigo de 6 digitos. El codigo nunca se guarda en texto plano.
	/// `select: false`: solo se lee explicitamente al verificar.
	@Column({ name: 'code_hash', type: 'varchar', length: 64, select: false })
	codeHash: string;

	@Column({ name: 'failed_attempts', type: 'int', default: 0 })
	failedAttempts: number;

	@Column({ name: 'max_attempts', type: 'int' })
	maxAttempts: number;

	/// Vencimiento del codigo (solicitud + 10 minutos).
	@Column({ name: 'expires_at', type: 'timestamptz' })
	expiresAt: Date;

	@Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
	verifiedAt: Date | null;

	/// Vencimiento de la autorizacion verificada (verificacion + 10 minutos). Null hasta VERIFIED.
	@Column({ name: 'authorization_expires_at', type: 'timestamptz', nullable: true })
	authorizationExpiresAt: Date | null;

	@Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
	consumedAt: Date | null;

	/// Momento en que paso a SUPERSEDED, EXPIRED o LOCKED.
	@Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
	invalidatedAt: Date | null;

	@CreateDateColumn({ name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ name: 'updated_at' })
	updatedAt: Date;
}
