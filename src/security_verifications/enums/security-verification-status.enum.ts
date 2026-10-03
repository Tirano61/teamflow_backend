/**
 * Ciclo de vida de una SecurityVerification.
 *
 * Abiertos (como maximo uno por user + organization + purpose, garantizado por indice unico parcial):
 * - PENDING: codigo enviado por email, todavia no verificado.
 * - VERIFIED: codigo correcto; la autorizacion existe pero todavia no fue usada por la operacion
 *   sensible. Vence en `authorizationExpiresAt`.
 *
 * Cerrados (historial, nunca vuelven a abrirse):
 * - CONSUMED: la operacion sensible uso la autorizacion (uso unico).
 * - SUPERSEDED: reemplazada por una solicitud mas reciente para el mismo user + organization + purpose.
 * - EXPIRED: vencio sin completarse (`expiresAt` en PENDING o `authorizationExpiresAt` en VERIFIED).
 *   Se marca de forma perezosa: una fila PENDING/VERIFIED vencida ya se trata como invalida aunque
 *   todavia no tenga este status.
 * - LOCKED: se alcanzo el maximo de intentos incorrectos.
 */
export enum SecurityVerificationStatus {
	PENDING = 'PENDING',
	VERIFIED = 'VERIFIED',
	CONSUMED = 'CONSUMED',
	SUPERSEDED = 'SUPERSEDED',
	EXPIRED = 'EXPIRED',
	LOCKED = 'LOCKED',
}
