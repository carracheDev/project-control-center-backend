import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationService } from './notification.service.js';
import { AlertService } from './alert.service.js';
import { ScheduleModule } from '@nestjs/schedule';
import { GatingModule } from '../gating/gating.module.js';

@Global()
@Module({
  imports: [PrismaModule, ScheduleModule.forRoot(), GatingModule],
  controllers: [NotificationsController],
  providers: [NotificationService, AlertService],
  exports: [NotificationService],
})
export class NotificationsModule {}
