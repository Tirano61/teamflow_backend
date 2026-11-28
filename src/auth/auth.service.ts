import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create_user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { LoginUserDto } from './dto/login_user.dto';
import { JWTPayloadInterface } from './interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserRolesDto } from './dto/update_user_roles.dto';
import { UpdateUserPasswordDto } from './dto/update_user_password.dto';
import { normalizeEmail } from './helpers/normalize-email';
import {
  createDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from './helpers/password-hashing';

/// Unica respuesta para email inexistente, contraseña incorrecta y usuario inactivo.
const INVALID_CREDENTIALS_MESSAGE = 'Credentials are not valid';
const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Email is already registered';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash?: Promise<string>;

  /// Inyectado el repositorio de la tabla de usuarios
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit() {
    /// Se precalcula al arrancar para que el primer login con un email inexistente no lo pague.
    await this.getDummyPasswordHash();
  }

  async createUser(createUserDto: CreateUserDto) {
    try {
      const { password, ...userData } = createUserDto;
      const user = this.userRepository.create({
        ...userData,
        password: await hashPassword(password),
      });

      await this.userRepository.save(user);

      delete (user as any).password;

      return {
        ...user,
        token: this.getJwtToken({ id: user.id }),
      };
    } catch (error) {
      this.handleDBError(error);
    }
  }

  async loginUser(loginUserDto: LoginUserDto) {
    const { password } = loginUserDto;
    const email = normalizeEmail(loginUserDto.email);

    const user = await this.userRepository.findOne({
      where: { email },
      select: {
        email: true,
        password: true,
        id: true,
        fullName: true,
        roles: true,
        isActive: true,
      },
    });

    /// Siempre se ejecuta una comparacion bcrypt, aunque el email no exista (contra un hash
    /// ficticio del mismo costo), para no responder mas rapido segun exista o no la cuenta.
    const passwordHash =
      typeof user?.password === 'string'
        ? user.password
        : await this.getDummyPasswordHash();
    const passwordMatches = await verifyPassword(password, passwordHash);

    /// El estado se revisa despues de comparar y con el mismo mensaje: un usuario inactivo no
    /// recibe JWT y la respuesta no revela si la cuenta existe, esta inactiva o la clave es mala.
    if (!user || !passwordMatches || !user.isActive)
      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);

    /// Mismo cuerpo que antes: `isActive` solo se selecciona para la verificacion.
    delete (user as Partial<User>).password;
    delete (user as Partial<User>).isActive;

    return {
      ...user,
      token: this.getJwtToken({ id: user.id }),
    };
  }

  async findAllUsers() {
    return this.userRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  async updateUserRoles(
    userId: string,
    updateUserRolesDto: UpdateUserRolesDto,
  ) {
    const user = await this.userRepository.preload({
      id: userId,
      roles: [...new Set(updateUserRolesDto.roles)],
    });

    if (!user)
      throw new BadRequestException(`User with id ${userId} not found`);

    try {
      const updatedUser = await this.userRepository.save(user);
      return updatedUser;
    } catch (error) {
      this.handleDBError(error);
    }
  }

  async updateUserPassword(
    userId: string,
    updateUserPasswordDto: UpdateUserPasswordDto,
  ) {
    const user = await this.userRepository.findOneBy({ id: userId });

    if (!user)
      throw new BadRequestException(`User with id ${userId} not found`);

    user.password = await hashPassword(updateUserPasswordDto.password);

    try {
      await this.userRepository.save(user);
      return {
        ok: true,
        message: 'Password updated successfully',
      };
    } catch (error) {
      this.handleDBError(error);
    }
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= createDummyPasswordHash().catch((error) => {
      /// No memorizar un fallo: el siguiente intento lo vuelve a calcular.
      this.dummyPasswordHash = undefined;
      throw error;
    });
    return this.dummyPasswordHash;
  }

  private getJwtToken(payload: JWTPayloadInterface) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  private handleDBError(error: unknown): never {
    /// 23505 en `users` solo puede venir del email unico. No se devuelve `error.detail`
    /// ("Key (email)=(...) already exists.") ni otros datos del driver.
    if ((error as { code?: unknown } | null)?.code === '23505')
      throw new BadRequestException(EMAIL_ALREADY_REGISTERED_MESSAGE);

    /// El resto lo registra GlobalHttpExceptionFilter con secretos redactados (sin `parameters`,
    /// que incluyen el hash de la contraseña) y responde 500 generico.
    throw error;
  }
}
