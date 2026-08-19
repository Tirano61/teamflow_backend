import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationInvitationsModule } from '../organization_invitations/organization-invitations.module';
import { Organization } from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './services/organizations.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([Organization]),
		AuthModule,
		MembershipsModule,
		OrganizationInvitationsModule,
	],
	controllers: [OrganizationsController],
	providers: [OrganizationsService],
	exports: [OrganizationsService],
})
export class OrganizationsModule {}
