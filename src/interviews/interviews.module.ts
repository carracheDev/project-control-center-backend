import { Module } from '@nestjs/common';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';

@Module({
  controllers: [InterviewsController],
  providers: [InterviewsService],
  exports: [InterviewsService],
})
export class InterviewsModule {}