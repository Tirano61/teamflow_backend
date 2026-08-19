import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Request } from 'express';
import { CreateUserDto } from './dto/create_user.dto';
import { LoginUserDto } from './dto/login_user.dto';
import { UpdateUserRolesDto } from './dto/update_user_roles.dto';
import { UpdateUserPasswordDto } from './dto/update_user_password.dto';
import { GetUser } from './decorators/get-user.decorator';
import { User } from './entities/user.entity';
import { ValidRoles } from './interfaces/valid-roles';
import { Auth } from './decorators/auth.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  createUser(@Body() createUserDto: CreateUserDto) {
    return this.authService.createUser(createUserDto);
  }

  @Post('login')
  loginUser(@Body() loginUserDto: LoginUserDto) {
    return this.authService.loginUser(loginUserDto);
  }

  @Post('logout')
  @Auth() // Requiere estar autenticado para hacer logout
  logout(@GetUser() user: User) {
    return {
      ok: true,
      message: 'Logout successful',
      userId: user.id,
    };
  }

  @Get('validate')
  @Auth() // Requiere token válido
  validateToken(@GetUser() user: User, @Req() request: Request) {
    // Extraer el token del header
    const token = request.headers.authorization?.replace('Bearer ', '');

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roles,
      token: token,
    };
  }

  // @Get('private')
  // @UseGuards( AuthGuard() )
  // testingPrivateRout(
  //   @GetUser() user: User,
  //   @GetUser('email') userEmail: string,
  //   @GetRawHeaders() rawHeaders: string[]
  // ){
  //   return {
  //     ok: true,
  //     user: user,
  //     userEmail,
  //     rawHeaders
  //   }
  // }

  // @Get('private2')
  // //@SetMetadata('roles', ['admin', 'super-user'])
  // @RoleProtected( ValidRoles.admin )
  // @UseGuards( AuthGuard(), UserRoleGuard )
  // private2(
  //   @GetUser() user: User,
  // ){
  //   return{
  //     ok: true,
  //     user
  //   }
  // }

  /// Uso de Decorator composition
  @Get('private3')
  @Auth(ValidRoles.admin) /// El Auth se debe llamar en las rutas para comprobar el acceso, si es publica Auth()
  private3(@GetUser() user: User) {
    return {
      ok: true,
      user,
    };
  }

  @Get('users')
  @Auth(ValidRoles.admin)
  findAllUsers() {
    return this.authService.findAllUsers();
  }

  @Patch('users/:id/roles')
  @Auth(ValidRoles.admin)
  updateUserRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserRolesDto: UpdateUserRolesDto,
  ) {
    return this.authService.updateUserRoles(id, updateUserRolesDto);
  }

  @Patch('users/:id/password')
  @Auth(ValidRoles.admin)
  updateUserPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserPasswordDto: UpdateUserPasswordDto,
  ) {
    return this.authService.updateUserPassword(id, updateUserPasswordDto);
  }
}
