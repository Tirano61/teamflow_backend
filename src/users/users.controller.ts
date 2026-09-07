import {
	Controller,
	DefaultValuePipe,
	Get,
	ParseIntPipe,
	Query,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { USER_SEARCH_DEFAULT_LIMIT, UsersService } from './services/users.service';

@Auth()
@Controller('users')
export class UsersController {
	constructor(private readonly usersService: UsersService) {}

	@Get('search')
	searchUsers(
		@GetUser() user: User,
		@Query('q') q: string,
		@Query('limit', new DefaultValuePipe(USER_SEARCH_DEFAULT_LIMIT), ParseIntPipe)
		limit: number,
	) {
		return this.usersService.searchUsers(q, user, limit);
	}
}
