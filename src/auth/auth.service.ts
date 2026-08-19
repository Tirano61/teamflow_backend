import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create_user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login_user.dto';
import { JWTPayloadInterface } from './interfaces/jwt-payload.interface';
import { JwtService } from '@nestjs/jwt';
import { UpdateUserRolesDto } from './dto/update_user_roles.dto';
import { UpdateUserPasswordDto } from './dto/update_user_password.dto';

@Injectable()
export class AuthService {
  /// Inyectado el repositorio de la tabla de usuarios
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async createUser(createUserDto: CreateUserDto) {
    try {
      const { password, ...userData } = createUserDto;
      const user = this.userRepository.create({
        ...userData,
        password: bcrypt.hashSync(password, 10),
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
    const { email, password } = loginUserDto;

    const user = await this.userRepository.findOne({
      where: { email },
      select: {
        email: true,
        password: true,
        id: true,
        fullName: true,
        roles: true,
      },
    });

    if (!user) throw new UnauthorizedException('Credentials are not valid');

    if (!bcrypt.compareSync(password, user.password))
      throw new UnauthorizedException('Credentials are not valid');

    delete (user as any).password;

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

    user.password = bcrypt.hashSync(updateUserPasswordDto.password, 10);

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

  private getJwtToken(payload: JWTPayloadInterface) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  private handleDBError(error: any): never {
    if (error.code === '23505') throw new BadRequestException(error.detail);
    console.log(error);

    throw new InternalServerErrorException('Please check server logs');
  }
}
