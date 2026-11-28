import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

/**
 * Costo bcrypt de las contraseñas. Todos los hashes actuales son `$2b$10$`; cambiarlo solo
 * afecta a los hashes nuevos (bcrypt lee el costo de cada hash al comparar).
 */
export const PASSWORD_HASH_ROUNDS = 10;

/** Hash asincronico: no bloquea el event loop mientras bcrypt trabaja en el threadpool de libuv. */
export function hashPassword(plainPassword: string): Promise<string> {
	return bcrypt.hash(plainPassword, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
	return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Hash bcrypt valido, con el mismo costo que los reales, de un secreto aleatorio que se descarta
 * en el acto: ninguna contraseña lo valida y no existe en texto plano. Se calcula una vez por
 * proceso para comparar contra el cuando el email no existe, de modo que ese caso tambien pague
 * el costo de bcrypt.
 */
export function createDummyPasswordHash(): Promise<string> {
	return hashPassword(randomBytes(32).toString('base64'));
}
