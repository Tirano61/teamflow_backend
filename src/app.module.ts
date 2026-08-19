import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
		TypeOrmModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (configService: ConfigService) => {
				const databaseUrl = configService.get<string>('DATABASE_URL')?.trim();

				return {
					type: 'postgres' as const,
					...(databaseUrl
						? {
							url: databaseUrl,
							ssl: { rejectUnauthorized: false },
						}
						: {
							host: configService.get<string>('DB_HOST'),
							port: +(configService.get<string>('DB_PORT') ?? 5433),
							database: configService.get<string>('POSTGRES_DB_NAME'),
							username: configService.get<string>('POSTGRES_USER'),
							password: configService.get<string>('POSTGRES_PASSWORD'),
						}),
					autoLoadEntities: true,
					synchronize: true,
					extra: {},
				};
			},
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
