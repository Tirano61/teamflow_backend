import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationInvitationsModule } from '../organization_invitations/organization-invitations.module';
import { SecurityVerificationsModule } from '../security_verifications/security-verifications.module';
import { Organization } from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationDeletionService } from './services/organization-deletion.service';
import { OrganizationsService } from './services/organizations.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Organization]),
		AuthModule,
		MembershipsModule,
		OrganizationInvitationsModule,
		SecurityVerificationsModule,
		CloudinaryModule,
	],
	controllers: [OrganizationsController],
	providers: [OrganizationsService, OrganizationDeletionService],
	exports: [OrganizationsService],
})
export class OrganizationsModule {}
