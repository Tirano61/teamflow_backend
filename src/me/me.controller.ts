import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { UserContextService } from './user-context.service';

@Auth()
@Controller('me')
export class MeController {
	constructor(private readonly userContextService: UserContextService) {}

	@Get('context')
	getContext(@GetUser() user: User) {
		return this.userContextService.getContext(user);
	}
}
