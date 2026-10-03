import { IsString, Matches } from 'class-validator';

/// Solo `code`: purpose, usuario y organization se toman de la verificacion almacenada,
/// del JWT y del path. Cualquier otra propiedad responde 400 por `forbidNonWhitelisted`.
export class VerifySecurityVerificationDto {
	@IsString()
	@Matches(/^\d{6}$/, { message: 'code must be a string of exactly 6 digits' })
	code: string;
}
