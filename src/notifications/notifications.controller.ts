import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { RegisterPushTokenDto } from './dto/register-push-token.dto.js';
import { NotificationService } from './notification.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Post('tokens')
  register(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterPushTokenDto) {
    return this.notifications.registerToken(user.id, dto);
  }

  @Delete('tokens/:token')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.notifications.removeToken(user.id, token);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) { return this.notifications.findForUser(user.id); }

  @Patch(':id/read')
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.notifications.markRead(user.id, id); }

  @Patch(':id/resolve')
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) { return this.notifications.resolve(user.id, id); }
}
