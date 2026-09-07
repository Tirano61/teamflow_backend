import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { MembershipsModule } from '../memberships/memberships.module';
import { Membership } from '../memberships/entities/membership.entity';
import { OrganizationInvitation } from './entities/organization-invitation.entity';
import { OrganizationInvitationsController } from './organization-invitations.controller';
import { OrganizationInvitationsService } from './services/organization-invitations.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([OrganizationInvitation, Membership, User]),
		AuthModule,
		MembershipsModule,
	],
	controllers: [OrganizationInvitationsController],
	providers: [OrganizationInvitationsService],
	exports: [OrganizationInvitationsService],
})
export class OrganizationInvitationsModule {}
