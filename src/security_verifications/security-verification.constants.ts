/// Vigencia del codigo enviado por email desde que se solicita.
export const SECURITY_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;

/// Vigencia de la autorizacion desde que el codigo se verifica correctamente.
/// Dentro de esta ventana la operacion sensible puede consumirla una unica vez.
export const SECURITY_VERIFICATION_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

/// Tiempo minimo entre dos solicitudes de codigo para el mismo user + organization + purpose.
export const SECURITY_VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

/// Intentos incorrectos permitidos antes de bloquear la verificacion (LOCKED).
export const SECURITY_VERIFICATION_MAX_ATTEMPTS = 5;

export const SECURITY_VERIFICATION_CODE_LENGTH = 6;

/// Indice unico parcial: como maximo una verificacion abierta (PENDING/VERIFIED) por
/// user + organization + purpose. Se usa para reconocer el conflicto concurrente.
export const SECURITY_VERIFICATION_OPEN_SCOPE_INDEX = 'uq_security_verifications_open_scope';
