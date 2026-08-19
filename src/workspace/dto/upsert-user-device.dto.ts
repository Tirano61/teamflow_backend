import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { DevicePlatform } from '../enums/device-platform.enum';

export class UpsertUserDeviceDto {
	@IsString()
	@MinLength(10)
	@MaxLength(4096)
	token!: string;

	@IsEnum(DevicePlatform)
	platform!: DevicePlatform;
}
