import { SecurityVerificationPurpose } from '../enums/security-verification-purpose.enum';

/// Nunca incluye el codigo, su hash ni el detalle de intentos.
export interface SecurityVerificationRequestedResponse {
	verificationId: string;
	purpose: SecurityVerificationPurpose;
	expiresAt: Date;
	resendAvailableAt: Date;
}

export interface SecurityVerificationVerifiedResponse {
	verificationId: string;
	purpose: SecurityVerificationPurpose;
	verifiedAt: Date;
	authorizationExpiresAt: Date;
}
