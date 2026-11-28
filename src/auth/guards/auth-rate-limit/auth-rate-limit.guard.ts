import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import {
	ThrottlerGuard,
	ThrottlerLimitDetail,
	normalizeIp,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import {
	AUTH_RATE_LIMIT_EMAIL_MAX_LENGTH,
	AuthRateLimitScope,
} from '../../../config/auth-rate-limit.config';
import { normalizeEmail } from '../../helpers/normalize-email';

export const AUTH_RATE_LIMIT_SCOPE_KEY = 'auth-rate-limit:scope';

const logger = new Logger('AuthRateLimit');
let proxyWarningLogged = false;

/**
 * Tracker por IP. `req.ip` depende de `TRUST_PROXY` (ver `src/config/trust-proxy.config.ts`);
 * nunca se lee `X-Forwarded-For` directamente. IPv6 se agrupa por /64 (un cliente suele tener
 * todo un /64) e IPv4 mapeado (`::ffff:a.b.c.d`) se trata como IPv4.
 */
export function getClientIpTracker(req: Record<string, any>): string {
	warnIfProxyIsNotTrusted(req);
	const ip = typeof req.ip === 'string' && req.ip ? req.ip : 'unknown';
	return `ip:${normalizeIp(ip)}`;
}

/**
 * Tracker por identidad: el email normalizado igual que en login. El guard corre antes del
 * ValidationPipe, asi que se normaliza el body crudo. Si no hay un email utilizable (falta, no es
 * string o es demasiado largo) se rastrea por IP: la request va a fallar la validacion igual.
 */
export function getIdentityTracker(req: Record<string, any>): string {
	const email: unknown = req.body?.email;
	if (typeof email === 'string' && email.length <= AUTH_RATE_LIMIT_EMAIL_MAX_LENGTH) {
		const normalized = normalizeEmail(email);
		if (normalized) return `email:${normalized}`;
	}

	return getClientIpTracker(req);
}

function warnIfProxyIsNotTrusted(req: Record<string, any>): void {
	if (proxyWarningLogged) return;
	if (!req.headers?.['x-forwarded-for']) return;
	if (req.app?.get?.('trust proxy')) return;

	proxyWarningLogged = true;
	logger.warn(
		'Requests arrive with X-Forwarded-For but TRUST_PROXY is not set: auth rate limiting groups every client behind the proxy under the proxy IP',
	);
}

/**
 * ThrottlerGuard de los endpoints publicos de autenticacion. Solo se aplica a traves de
 * `@AuthRateLimit(scope)`; no es un guard global.
 */
@Injectable()
export class AuthRateLimitGuard extends ThrottlerGuard {
	protected async getTracker(req: Record<string, any>): Promise<string> {
		return getClientIpTracker(req);
	}

	/// La clave usa el scope y no el handler, para que `register` y `users` compartan contador.
	/// Se hashea: en memoria no quedan emails ni IPs en claro.
	protected generateKey(context: ExecutionContext, suffix: string, name: string): string {
		const scope =
			this.reflector.getAllAndOverride<AuthRateLimitScope | undefined>(
				AUTH_RATE_LIMIT_SCOPE_KEY,
				[context.getHandler(), context.getClass()],
			) ?? `${context.getClass().name}.${context.getHandler().name}`;

		return createHash('sha256')
			.update(`auth-rate-limit:${scope}:${name}:${suffix}`)
			.digest('hex');
	}

	protected async throwThrottlingException(
		context: ExecutionContext,
		throttlerLimitDetail: ThrottlerLimitDetail,
	): Promise<void> {
		const response = context.switchToHttp().getResponse();
		const retryAfterSeconds = Math.max(1, Math.ceil(throttlerLimitDetail.timeToBlockExpire));
		response.setHeader?.('Retry-After', String(retryAfterSeconds));

		return super.throwThrottlingException(context, throttlerLimitDetail);
	}
}
