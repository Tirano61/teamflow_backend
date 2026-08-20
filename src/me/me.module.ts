import { Module } from '@nestjs/common';
import { MembershipsModule } from '../memberships/memberships.module';
import { OrganizationInvitationsModule } from '../organization_invitations/organization-invitations.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { MeController } from './me.controller';
import { UserContextService } from './user-context.service';

@Module({
	imports: [MembershipsModule, OrganizationsModule, OrganizationInvitationsModule],
	controllers: [MeController],
	providers: [UserContextService],
	exports: [UserContextService],
})
export class MeModule {}
