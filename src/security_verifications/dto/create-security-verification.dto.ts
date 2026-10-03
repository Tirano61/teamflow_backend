import { IsEnum } from 'class-validator';
import { SecurityVerificationPurpose } from '../enums/security-verification-purpose.enum';

/// Solo `purpose`: la organization sale del path y el usuario/email del JWT.
/// Cualquier otra propiedad (userId, email, organizationId) responde 400 por `forbidNonWhitelisted`.
export class CreateSecurityVerificationDto {
	@IsEnum(SecurityVerificationPurpose, {
		message: `purpose must be one of the following values: ${Object.values(SecurityVerificationPurpose).join(', ')}`,
	})
	purpose: SecurityVerificationPurpose;
}
