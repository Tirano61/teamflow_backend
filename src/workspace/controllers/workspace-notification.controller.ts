import { Controller, Post } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import { WorkspacePushNotificationService } from '../services/workspace-push-notification.service';

@Controller('workspace')
export class WorkspaceNotificationController {
	constructor(private readonly notificationService: WorkspacePushNotificationService) { }

	@Post('notifications/test')
	@Auth()
	sendTestNotification(@GetUser() user: User) {
		return this.notificationService.sendToUser(user.id, {
			kind: 'VISIBLE',
			title: 'Workspace',
			body: 'Prueba desde NestJS',
			data: {
				type: 'TEST',
			},
		});
	}
}
