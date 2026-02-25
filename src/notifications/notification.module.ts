import { Module, OnModuleInit } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationGateway } from './notification.gateway';
import { EmailService, EMAIL_PROVIDER, DummyEmailProvider } from './email.service';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationResolver } from 'src/api/contracts/graphql/resolvers/notification.resolver';

@Module({
  imports: [AuthModule],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      useClass: DummyEmailProvider, // Use DummyEmailProvider for dev
    },
    EmailService,
    NotificationService,
    NotificationGateway,
    NotificationResolver,
  ],
  exports: [NotificationService],
})
export class NotificationModule implements OnModuleInit {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  onModuleInit() {
    // Wire the gateway to the service to avoid circular dependency issues
    // and to ensure both are fully constructed before wiring.
    this.notificationService.setGateway(this.notificationGateway);
  }
}
