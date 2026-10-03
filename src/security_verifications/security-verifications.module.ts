import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { SecurityVerification } from './entities/security-verification.entity';
import { SecurityVerificationsController } from './security-verifications.controller';
import { SecurityVerificationsService } from './services/security-verifications.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([SecurityVerification]),
		ConfigModule,
		AuthModule,
		MembershipsModule,
		MailModule,
	],
	controllers: [SecurityVerificationsController],
	providers: [SecurityVerificationsService],
	/// Exportado para que la operacion sensible (eliminar organization, Prompt 27) pueda
	/// consultar y consumir la autorizacion.
	exports: [SecurityVerificationsService],
})
export class SecurityVerificationsModule {}
