import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { CreateSecurityVerificationDto } from './dto/create-security-verification.dto';
import { VerifySecurityVerificationDto } from './dto/verify-security-verification.dto';
import { SecurityVerificationsService } from './services/security-verifications.service';

/// Verificacion por email de operaciones sensibles. La organization sale del path y el usuario
/// (y su email) del JWT: ningun body acepta userId, email ni organizationId.
@Auth()
@Controller('organizations/:organizationId/security-verifications')
export class SecurityVerificationsController {
	constructor(private readonly securityVerificationsService: SecurityVerificationsService) {}

	@Post()
	requestVerification(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Body() dto: CreateSecurityVerificationDto,
		@GetUser() user: User,
	) {
		return this.securityVerificationsService.requestVerification(organizationId, dto, user);
	}

	@Post(':verificationId/verify')
	verifyCode(
		@Param('organizationId', new ParseUUIDPipe()) organizationId: string,
		@Param('verificationId', new ParseUUIDPipe()) verificationId: string,
		@Body() dto: VerifySecurityVerificationDto,
		@GetUser() user: User,
	) {
		return this.securityVerificationsService.verifyCode(organizationId, verificationId, dto, user);
	}
}
