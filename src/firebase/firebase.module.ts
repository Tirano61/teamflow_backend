import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FirebaseMessagingService } from './firebase-messaging.service';

@Global()
@Module({
	imports: [ConfigModule],
	providers: [FirebaseMessagingService],
	exports: [FirebaseMessagingService],
})
export class FirebaseModule { }
