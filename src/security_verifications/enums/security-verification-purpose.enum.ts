/**
 * Operacion sensible que una SecurityVerification autoriza.
 * Cada verificacion queda ligada a (user, organization, purpose): un codigo pedido para un
 * purpose/organization no sirve para otro.
 * Futuros valores previstos (todavia sin flujo): TRANSFER_OWNERSHIP, DELETE_ACCOUNT.
 */
export enum SecurityVerificationPurpose {
	DELETE_ORGANIZATION = 'DELETE_ORGANIZATION',
}
