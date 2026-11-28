import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmailInput } from '../helpers/normalize-email';

/// Tope de entrada para no procesar contraseñas abusivamente largas. Es mayor que el maximo de
/// creacion (50) para no rechazar credenciales existentes; bcrypt solo usa los primeros 72 bytes.
export const LOGIN_PASSWORD_MAX_LENGTH = 128;

export class LoginUserDto {
  @Transform(({ value }) => normalizeEmailInput(value))
  @IsString()
  @IsEmail()
  email: string;

  /// Solo se valida el formato de entrada. La politica de complejidad se aplica al crear o
  /// cambiar la contraseña (CreateUserDto, UpdateUserPasswordDto), no al autenticar una existente.
  @IsString()
  @IsNotEmpty()
  @MaxLength(LOGIN_PASSWORD_MAX_LENGTH)
  password: string;
}
