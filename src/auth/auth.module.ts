import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { ThrottlerModule } from '@nestjs/throttler';
import { buildAuthThrottlerOptions } from '../config/auth-rate-limit.config';
import { getIdentityTracker } from './guards/auth-rate-limit/auth-rate-limit.guard';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  imports: [
    ConfigModule, /// Oara poder usarlo en en la comprovacion del token

    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),

    /// Rate limiting en memoria de login y registro. No hay guard global: solo limitan las rutas
    /// marcadas con @AuthRateLimit(). Ver src/config/auth-rate-limit.config.ts.
    ThrottlerModule.forRoot(buildAuthThrottlerOptions(getIdentityTracker)),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get('JWT_SECRET_KEY'),
          signOptions: {}, // Sin expiración
        };
      },
    }),

    /* JwtModule.register({
			secret: process.env.JWT_SECRET_KEY,
			signOptions:  {
				expiresIn: '2h'
			}
		}), */
  ],
  /// Para que  pueda ser usado fuera de este modulo
  exports: [TypeOrmModule, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
