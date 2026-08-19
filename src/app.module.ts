import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipsModule } from './memberships/memberships.module';
import { OrganizationInvitationsModule } from './organization_invitations/organization-invitations.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { FirebaseModule } from './firebase/firebase.module';

@Module({
	imports: [
		ConfigModule.forRoot(),
		TypeOrmModule.forRoot({
			type: 'postgres',
			host: process.env.DB_HOST,
			port: +(process.env.DB_PORT ?? 5433),
			database: process.env.POSTGRES_DB_NAME,
			username: process.env.POSTGRES_USER,
			password: process.env.POSTGRES_PASSWORD,
			autoLoadEntities: true,
			synchronize: true, // importante: no permitir que TypeORM altere esquema con tipos no reconocidos
			extra: {},
		}),
		AuthModule,
		FirebaseModule,
		MembershipsModule,
		OrganizationInvitationsModule,
		OrganizationsModule,
		WorkspaceModule,
	],
	controllers: [AppController],
	providers: [],
})
export class AppModule { }
