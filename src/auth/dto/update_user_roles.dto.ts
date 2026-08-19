import { ArrayMinSize, IsArray, IsEnum } from 'class-validator';
import { ValidRoles } from '../interfaces/valid-roles';

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ValidRoles, { each: true })
  roles: ValidRoles[];
}
