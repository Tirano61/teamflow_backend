import { SecurityVerificationPurpose } from '../enums/security-verification-purpose.enum';

/// Descripcion de la operacion que se esta verificando, en el texto del email.
const PURPOSE_DESCRIPTIONS: Record<
	SecurityVerificationPurpose,
	(organizationName: string) => string
> = {
	[SecurityVerificationPurpose.DELETE_ORGANIZATION]: (organizationName) =>
		`eliminar la organización "${organizationName}"`,
};

export interface SecurityVerificationEmailParams {
	recipientName: string;
	organizationName: string;
	purpose: SecurityVerificationPurpose;
	code: string;
	expiresInMinutes: number;
}

export interface SecurityVerificationEmailContent {
	subject: string;
	htmlContent: string;
	textContent: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Email de seguridad con el codigo de verificacion.
 * El codigo no va en el asunto para que no quede expuesto en notificaciones/previews.
 */
export function buildSecurityVerificationEmail(
	params: SecurityVerificationEmailParams,
): SecurityVerificationEmailContent {
	const operation = PURPOSE_DESCRIPTIONS[params.purpose](params.organizationName);
	const htmlOperation = PURPOSE_DESCRIPTIONS[params.purpose](escapeHtml(params.organizationName));
	const greetingName = params.recipientName.trim();

	const subject = 'TeamFlow: código de verificación para una operación sensible';

	const textContent = [
		greetingName ? `Hola ${greetingName},` : 'Hola,',
		'',
		`Se solicitó una operación sensible en TeamFlow: ${operation}.`,
		'',
		`Tu código de verificación es: ${params.code}`,
		'',
		`El código vence en ${params.expiresInMinutes} minutos y solo puede usarse una vez.`,
		'No compartas este código con nadie.',
		'',
		'Si no iniciaste esta operación, podés ignorar este mensaje: sin el código no puede completarse.',
		'',
		'TeamFlow',
	].join('\n');

	const htmlContent = `<!doctype html>
<html lang="es">
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2933;">
	<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px;">
		<p style="margin:0 0 16px;">${greetingName ? `Hola ${escapeHtml(greetingName)},` : 'Hola,'}</p>
		<p style="margin:0 0 16px;">Se solicitó una operación sensible en TeamFlow: <strong>${htmlOperation}</strong>.</p>
		<p style="margin:0 0 8px;">Tu código de verificación es:</p>
		<p style="margin:0 0 16px;font-size:28px;font-weight:bold;letter-spacing:6px;">${params.code}</p>
		<p style="margin:0 0 16px;">El código vence en ${params.expiresInMinutes} minutos y solo puede usarse una vez. No compartas este código con nadie.</p>
		<p style="margin:0;color:#52606d;font-size:13px;">Si no iniciaste esta operación, podés ignorar este mensaje: sin el código no puede completarse.</p>
	</div>
</body>
</html>`;

	return { subject, htmlContent, textContent };
}
