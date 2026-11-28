/**
 * Normaliza un email igual que `User.checkFieldsBeforeInsert` al guardarlo
 * (`toLocaleLowerCase().trim()`), para que login y registro comparen contra el
 * mismo valor almacenado. No reescribe emails ya guardados.
 */
export function normalizeEmail(email: string): string {
	return email.toLocaleLowerCase().trim();
}

/** Para `@Transform` de class-transformer: solo normaliza strings; el resto lo rechaza la validacion. */
export function normalizeEmailInput(value: unknown): unknown {
	return typeof value === 'string' ? normalizeEmail(value) : value;
}
