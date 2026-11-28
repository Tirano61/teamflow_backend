/**
 * Descripcion de errores para los logs del servidor, sin secretos. Conserva lo util para
 * diagnosticar (tipo, mensaje, codigo y tabla/constraint de PostgreSQL, SQL con placeholders,
 * stack) y descarta lo que puede contener valores de columnas: `parameters` y `detail` de
 * TypeORM/pg (por ejemplo el hash de una contraseña en un INSERT o en "Failing row contains").
 */
const REDACTIONS: Array<[RegExp, string]> = [
	[/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]'],
	[/eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g, '[REDACTED_JWT]'],
	[/\$2[abxy]?\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]'],
	[
		/// Valores tipo `token=abc` o `password: abc`; respeta placeholders SQL (`password = $1`).
		/\b(password|passwd|secret|token|api[_-]?key|authorization|cookie)(\s*[=:]\s*)(?!\$\d)[^\s,;&"']+/gi,
		'$1$2[REDACTED]',
	],
];

const MAX_QUERY_LENGTH = 500;

export function redactSecrets(text: string): string {
	return REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), text);
}

export interface ErrorLogDescription {
	message: string;
	stack?: string;
}

export function describeErrorForLog(error: unknown): ErrorLogDescription {
	if (!(error instanceof Error)) {
		return {
			message:
				typeof error === 'string'
					? `Non-Error thrown: ${redactSecrets(error)}`
					: `Non-Error thrown: ${error === null ? 'null' : typeof error}`,
		};
	}

	const dbError = error as Error & {
		code?: unknown;
		table?: unknown;
		column?: unknown;
		constraint?: unknown;
		query?: unknown;
	};

	const fields = (['code', 'table', 'column', 'constraint'] as const)
		.filter((key) => typeof dbError[key] === 'string' && dbError[key])
		.map((key) => `${key}=${String(dbError[key])}`);

	if (typeof dbError.query === 'string') {
		fields.push(`query=${dbError.query.slice(0, MAX_QUERY_LENGTH)}`);
	}

	const suffix = fields.length > 0 ? ` [${fields.join(' ')}]` : '';

	return {
		message: redactSecrets(`${error.name}: ${error.message}${suffix}`),
		stack: error.stack ? redactSecrets(error.stack) : undefined,
	};
}
