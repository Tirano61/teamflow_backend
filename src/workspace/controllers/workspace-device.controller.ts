import { Body, Controller, Delete, Post } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { DeleteUserDeviceDto } from '../dto/delete-user-device.dto';
import { UpsertUserDeviceDto } from '../dto/upsert-user-device.dto';
import { UserDeviceService } from '../services/user-device.service';

@Controller('workspace')
export class WorkspaceDeviceController {
	constructor(private readonly userDeviceService: UserDeviceService) { }

	@Post('devices')
	@Auth()
	registerDevice(@Body() dto: UpsertUserDeviceDto, @GetUser() user: User) {
		return this.userDeviceService.upsertUserDevice(dto, user);
	}

	@Delete('devices')
	@Auth()
	unregisterDevice(@Body() dto: DeleteUserDeviceDto, @GetUser() user: User) {
		return this.userDeviceService.removeUserDeviceByToken(dto.token, user);
	}
}
