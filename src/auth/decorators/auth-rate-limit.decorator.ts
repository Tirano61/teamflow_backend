import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import {
	AUTH_RATE_LIMIT_THROTTLERS,
	AUTH_RATE_LIMITS,
	AuthRateLimitScope,
} from '../../config/auth-rate-limit.config';
import {
	AUTH_RATE_LIMIT_SCOPE_KEY,
	AuthRateLimitGuard,
} from '../guards/auth-rate-limit/auth-rate-limit.guard';

/**
 * Aplica los limites de `AUTH_RATE_LIMITS[scope]` a la ruta. Las rutas con el mismo scope
 * comparten contadores. Responde 429 con `Retry-After` al superarlos.
 */
export function AuthRateLimit(scope: AuthRateLimitScope) {
	const policy = AUTH_RATE_LIMITS[scope];

	const decorators = [
		SetMetadata(AUTH_RATE_LIMIT_SCOPE_KEY, scope),
		Throttle({
			[AUTH_RATE_LIMIT_THROTTLERS.ipBurst]: {
				limit: policy.ipBurst.limit,
				ttl: policy.ipBurst.ttlMs,
			},
			[AUTH_RATE_LIMIT_THROTTLERS.ipSustained]: {
				limit: policy.ipSustained.limit,
				ttl: policy.ipSustained.ttlMs,
			},
			...(policy.identity
				? {
						[AUTH_RATE_LIMIT_THROTTLERS.identity]: {
							limit: policy.identity.limit,
							ttl: policy.identity.ttlMs,
						},
					}
				: {}),
		}),
		...(policy.identity
			? []
			: [SkipThrottle({ [AUTH_RATE_LIMIT_THROTTLERS.identity]: true })]),
		UseGuards(AuthRateLimitGuard),
	];

	return applyDecorators(...decorators);
}
