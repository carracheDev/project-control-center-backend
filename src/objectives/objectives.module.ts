import { Module } from '@nestjs/common';
import { ObjectivesController } from './objectives.controller.js';
import { ObjectivesService } from './objectives.service.js';

@Module({
  controllers: [ObjectivesController],
  providers: [ObjectivesService],
  exports: [ObjectivesService],
})
export class ObjectivesModule {}