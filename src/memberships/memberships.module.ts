import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Membership } from './entities/membership.entity';
import { MembershipsService } from './services/memberships.service';

@Module({
	imports: [TypeOrmModule.forFeature([Membership])],
	providers: [MembershipsService],
	exports: [TypeOrmModule, MembershipsService],
})
export class MembershipsModule {}
