import { Logger } from '@nestjs/common';
import { isIP } from 'net';

/**
 * Configuracion de `trust proxy` de Express a partir de `TRUST_PROXY`. Define de donde sale
 * `req.ip`, que usa el rate limiting de autenticacion.
 *
 * - Sin definir (default), vacio, `false` o `0`: no se confia en ningun proxy. `req.ip` es la
 *   direccion del socket y se ignora `X-Forwarded-For`. Detras de un proxy (Render, dev tunnel)
 *   todos los clientes comparten la IP del proxy y, por lo tanto, el mismo contador.
 * - Entero positivo `N`: se confia en los `N` saltos mas cercanos. Express toma la direccion
 *   ubicada `N` posiciones desde la derecha de `X-Forwarded-For`; lo que el cliente agregue a la
 *   izquierda se ignora.
 * - Lista separada por comas de `loopback`, `linklocal`, `uniquelocal`, IPs o CIDRs: se confia
 *   solo en proxies con esas direcciones (por ejemplo `loopback` para un tunel local).
 * - `true` se rechaza: haria que Express use la entrada mas a la izquierda de
 *   `X-Forwarded-For`, que el cliente puede falsificar y asi evadir el limite por IP.
 */
const SUBNET_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);
const MAX_PROXY_HOPS = 10;

export type TrustProxySetting = number | string;

export function resolveTrustProxySetting(
	rawValue: string | undefined = process.env.TRUST_PROXY,
	logger = new Logger('TrustProxy'),
): TrustProxySetting | undefined {
	const value = rawValue?.trim();
	if (!value || value === 'false' || value === '0') return undefined;

	if (/^\d+$/.test(value)) {
		const hops = Number(value);
		if (hops >= 1 && hops <= MAX_PROXY_HOPS) return hops;
		logger.warn(`TRUST_PROXY=${value} ignored: hop count must be between 1 and ${MAX_PROXY_HOPS}`);
		return undefined;
	}

	if (value.toLowerCase() === 'true') {
		logger.warn(
			'TRUST_PROXY=true ignored: it trusts any client-supplied X-Forwarded-For. Use the number of proxy hops instead',
		);
		return undefined;
	}

	const entries = value.split(',').map((entry) => entry.trim());
	const invalid = entries.filter((entry) => !isValidSubnetEntry(entry));
	if (invalid.length > 0 || entries.length === 0) {
		logger.warn(`TRUST_PROXY ignored: invalid entries ${JSON.stringify(invalid)}`);
		return undefined;
	}

	return entries.join(',');
}

function isValidSubnetEntry(entry: string): boolean {
	if (SUBNET_KEYWORDS.has(entry)) return true;

	const [address, prefix, ...rest] = entry.split('/');
	if (rest.length > 0) return false;

	const family = isIP(address);
	if (family === 0) return false;
	if (prefix === undefined) return true;
	if (!/^\d+$/.test(prefix)) return false;

	return Number(prefix) <= (family === 4 ? 32 : 128);
}
