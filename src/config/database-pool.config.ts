import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Opciones del pool de `pg` que TypeORM recibe en `extra`.
 *
 * Abrir una conexion nueva contra Neon cuesta unos 6 viajes de red (TCP, SSLRequest, TLS,
 * startup y autenticacion SCRAM): alrededor de 1,15 s desde Argentina hacia us-east-2.
 * El valor por defecto de `pg-pool` cierra las conexiones inactivas a los 10 s, de modo que
 * casi cualquier pausa del usuario obligaba a pagar ese costo en la siguiente peticion.
 */
export const DEFAULT_DB_POOL_MAX = 10;

/**
 * 4 minutos: por debajo de los 5 minutos de inactividad tras los que Neon suspende el computo,
 * para que una conexion ociosa del pool nunca sea la que lo mantiene encendido.
 */
export const DEFAULT_DB_POOL_IDLE_TIMEOUT_MS = 240_000;

/** Primera sonda TCP keepalive tras 10 s sin trafico; detecta sockets muertos antes de reutilizarlos. */
export const DB_POOL_KEEPALIVE_INITIAL_DELAY_MS = 10_000;

export interface DatabasePoolOptions {
	max: number;
	idleTimeoutMillis: number;
	keepAlive: true;
	keepAliveInitialDelayMillis: number;
}

const logger = new Logger('DatabasePool');

function readPositiveInteger(configService: ConfigService, name: string, fallback: number): number {
	const raw = configService.get<string>(name)?.trim();
	if (!raw) return fallback;

	const value = Number(raw);
	if (!Number.isInteger(value) || value <= 0) {
		logger.warn(`${name}=${raw} is not a positive integer: using ${fallback}`);
		return fallback;
	}

	return value;
}

export function buildDatabasePoolOptions(configService: ConfigService): DatabasePoolOptions {
	return {
		max: readPositiveInteger(configService, 'DB_POOL_MAX', DEFAULT_DB_POOL_MAX),
		idleTimeoutMillis: readPositiveInteger(
			configService,
			'DB_POOL_IDLE_TIMEOUT_MS',
			DEFAULT_DB_POOL_IDLE_TIMEOUT_MS,
		),
		keepAlive: true,
		keepAliveInitialDelayMillis: DB_POOL_KEEPALIVE_INITIAL_DELAY_MS,
	};
}
