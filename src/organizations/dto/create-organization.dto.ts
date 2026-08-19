import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateOrganizationDto {
	@IsString()
	@IsNotEmpty()
	@Length(2, 120)
	name: string;
}
