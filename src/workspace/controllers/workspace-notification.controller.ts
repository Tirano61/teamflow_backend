import { Controller, Logger, Post, ServiceUnavailableException } from '@nestjs/common';
import { Auth } from '../../auth/decorators/auth.decorator';
import { GetUser } from '../../auth/decorators/get-user.decorator';
import { User } from '../../auth/entities/user.entity';
import {
	GENERIC_PUSH_BODY,
	GENERIC_PUSH_TITLE,
	WorkspacePushNotificationService,
} from '../services/workspace-push-notification.service';

@Controller('workspace')
export class WorkspaceNotificationController {
	private readonly logger = new Logger(WorkspaceNotificationController.name);

	constructor(private readonly notificationService: WorkspacePushNotificationService) { }

	@Post('notifications/test')
	@Auth()
	async sendTestNotification(@GetUser() user: User) {
		try {
			return await this.notificationService.sendToUser(user.id, {
				kind: 'VISIBLE',
				// Mismo contenido visible que los push reales: la prueba muestra lo que vera el usuario.
				title: GENERIC_PUSH_TITLE,
				body: GENERIC_PUSH_BODY,
				data: {
					type: 'TEST',
				},
			});
		} catch (error) {
			// Firebase rechazo el envio completo (credencial, project id o red). Los fallos por
			// dispositivo no llegan aca: se informan en `failuresByCode`.
			const code = (error as { code?: string } | null)?.code ?? 'unknown';
			this.logger.warn(`Test push could not be sent userId=${user.id} code=${code}`);
			throw new ServiceUnavailableException('Push notification service is not available');
		}
	}
}
