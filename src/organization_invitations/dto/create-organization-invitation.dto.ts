import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { OrganizationRole } from '../../memberships/enums/organization-role.enum';

export class CreateOrganizationInvitationDto {
	@Transform(({ value }) =>
		typeof value === 'string' ? value.trim().toLowerCase() : value,
	)
	@IsEmail()
	@IsNotEmpty()
	email: string;

	@IsEnum(OrganizationRole)
	role: OrganizationRole;
}
