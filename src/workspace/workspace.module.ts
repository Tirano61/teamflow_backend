import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { WorkspaceCatalogController } from './controllers/workspace-catalog.controller';
import { WorkspaceDeviceController } from './controllers/workspace-device.controller';
import { WorkspaceNotificationController } from './controllers/workspace-notification.controller';
import { DiscussionContextController } from './controllers/discussion-context.controller';
import { DiscussionMessageController } from './controllers/discussion-message.controller';
import { DiscussionController } from './controllers/discussion.controller';
import { WorkModule } from './entities/work-module.entity';
import { Component } from './entities/component.entity';
import { Discussion } from './entities/discussion.entity';
import { DiscussionMessage } from './entities/discussion_message.entity';
import { DiscussionReadState } from './entities/discussion_read_state.entity';
import { Tag } from './entities/tag.entity';
import { UserDevice } from './entities/user_device.entity';
import { WorkspaceCatalogService } from './services/workspace-catalog.service';
import { WorkspaceNotificationService } from './services/workspace-notification.service';
import { WorkspacePushNotificationService } from './services/workspace-push-notification.service';
import { UserDeviceService } from './services/user-device.service';
import { DiscussionContextService } from './services/discussion-context.service';
import { DiscussionMessageService } from './services/discussion-message.service';
import { DiscussionService } from './services/discussion.service';

@Module({
	imports: [
		TypeOrmModule.forFeature([
			User,
			WorkModule,
			Component,
			Discussion,
			Tag,
			DiscussionMessage,
			DiscussionReadState,
			UserDevice,
		]),
		AuthModule,
		CloudinaryModule,
		FirebaseModule,
	],
	controllers: [
		WorkspaceCatalogController,
		DiscussionController,
		DiscussionContextController,
		DiscussionMessageController,
		WorkspaceDeviceController,
		WorkspaceNotificationController,
	],
	providers: [
		WorkspaceCatalogService,
		DiscussionService,
		DiscussionContextService,
		DiscussionMessageService,
		UserDeviceService,
		WorkspacePushNotificationService,
		WorkspaceNotificationService,
	],
	exports: [
		WorkspaceCatalogService,
		DiscussionService,
		DiscussionContextService,
		DiscussionMessageService,
		UserDeviceService,
		WorkspacePushNotificationService,
		WorkspaceNotificationService,
	],
})
export class WorkspaceModule { }
