import { Logger } from '@nestjs/common';

export const BACKEND_TIME_ZONE = 'UTC';

/**
 * Fija la zona horaria del proceso. Debe ejecutarse antes de abrir la conexion a PostgreSQL.
 *
 * Las columnas `timestamp without time zone` (`createdAt`, `updatedAt`) guardan UTC, pero el valor
 * no trae offset y el driver `pg` lo convierte a Date con la zona del proceso. En cualquier otra
 * zona la API devolveria un instante desplazado. Las columnas `timestamptz` no dependen de esto.
 */
export function enforceBackendTimeZone(): void {
	const configuredTimeZone = process.env.TZ;
	if (configuredTimeZone && configuredTimeZone !== BACKEND_TIME_ZONE) {
		new Logger('TimeZone').warn(
			`TZ=${configuredTimeZone} is not supported: overriding it with ${BACKEND_TIME_ZONE}. Remove it from the environment or .env`,
		);
	}

	process.env.TZ = BACKEND_TIME_ZONE;

	if (new Date().getTimezoneOffset() !== 0) {
		throw new Error(`Unable to run the backend process in ${BACKEND_TIME_ZONE}`);
	}
}
