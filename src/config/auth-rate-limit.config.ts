import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Limites de intentos de los endpoints publicos de autenticacion. Es el unico lugar donde se
 * definen los valores; `docs/workspace-endpoints.md` ("Rate limiting de autenticacion") los
 * documenta y debe actualizarse si cambian.
 *
 * Cada scope comparte contadores entre sus rutas: `signup` agrupa `POST /auth/register` y
 * `POST /auth/users` (son alias), asi que alternar entre ambos no duplica el cupo.
 *
 * Dimensiones:
 * - `ipBurst` / `ipSustained`: por IP del cliente (ver `src/config/trust-proxy.config.ts`). Cambiar
 *   el email no evade este limite.
 * - `identity`: por email normalizado, sin importar la IP. Frena el ataque distribuido contra una
 *   misma cuenta. Contrapartida: quien conozca un email puede agotar su cupo y demorar el login
 *   legitimo de esa cuenta durante la ventana (no hay bloqueo permanente).
 *
 * Al superar un limite la ruta responde 429 durante `ttlMs` (el bloqueo dura lo mismo que la
 * ventana) e incluye `Retry-After` en segundos. Las respuestas exitosas no cambian.
 *
 * Almacenamiento en memoria del proceso: los contadores se pierden al reiniciar y, con varias
 * instancias, cada una cuenta por separado (el limite efectivo se multiplica por la cantidad de
 * instancias). Para compartirlos habria que usar un storage comun (por ejemplo Redis).
 */
export type AuthRateLimitScope = 'login' | 'signup';

export interface AuthRateLimitWindow {
	limit: number;
	ttlMs: number;
}

export interface AuthRateLimitPolicy {
	ipBurst: AuthRateLimitWindow;
	ipSustained: AuthRateLimitWindow;
	/** `null`: la dimension por email no aplica a este scope. */
	identity: AuthRateLimitWindow | null;
}

const MINUTE_MS = 60_000;

export const AUTH_RATE_LIMITS: Record<AuthRateLimitScope, AuthRateLimitPolicy> = {
	/// POST /auth/login
	login: {
		ipBurst: { limit: 20, ttlMs: MINUTE_MS },
		ipSustained: { limit: 100, ttlMs: 15 * MINUTE_MS },
		identity: { limit: 10, ttlMs: 15 * MINUTE_MS },
	},
	/// POST /auth/register y POST /auth/users. Sin dimension por email: el registro no autentica
	/// una cuenta existente; el riesgo es la creacion masiva y el sondeo de emails, que limita la IP.
	signup: {
		ipBurst: { limit: 10, ttlMs: MINUTE_MS },
		ipSustained: { limit: 30, ttlMs: 60 * MINUTE_MS },
		identity: null,
	},
};

export const AUTH_RATE_LIMIT_THROTTLERS = {
	ipBurst: 'auth-ip-burst',
	ipSustained: 'auth-ip-sustained',
	identity: 'auth-identity',
} as const;

export const AUTH_RATE_LIMIT_MESSAGE = 'Too many attempts, please try again later';

/** Un `email` mas largo no es valido (RFC 5321); se rastrea por IP en lugar de por email. */
export const AUTH_RATE_LIMIT_EMAIL_MAX_LENGTH = 320;

export function buildAuthThrottlerOptions(
	getIdentityTracker: (req: Record<string, any>) => string,
): ThrottlerModuleOptions {
	/// Los valores por defecto son los de login; cada ruta los fija explicitamente con
	/// `@AuthRateLimit(scope)`.
	const defaults = AUTH_RATE_LIMITS.login;

	return {
		/// Sin encabezados X-RateLimit-* en las respuestas exitosas: el guard solo agrega
		/// `Retry-After` en el 429.
		setHeaders: false,
		errorMessage: AUTH_RATE_LIMIT_MESSAGE,
		throttlers: [
			{
				name: AUTH_RATE_LIMIT_THROTTLERS.ipBurst,
				limit: defaults.ipBurst.limit,
				ttl: defaults.ipBurst.ttlMs,
			},
			{
				name: AUTH_RATE_LIMIT_THROTTLERS.ipSustained,
				limit: defaults.ipSustained.limit,
				ttl: defaults.ipSustained.ttlMs,
			},
			{
				name: AUTH_RATE_LIMIT_THROTTLERS.identity,
				limit: defaults.identity!.limit,
				ttl: defaults.identity!.ttlMs,
				getTracker: getIdentityTracker,
			},
		],
	};
}
