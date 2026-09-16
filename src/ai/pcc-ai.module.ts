import { Module } from '@nestjs/common';
import Groq from 'groq-sdk';
import { GatingModule } from '../gating/gating.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReadinessModule } from '../readiness/readiness.module.js';
import { GROQ_CLIENT, GroqClient } from './ai.constants.js';
import { PccAiController } from './pcc-ai.controller.js';
import { PccAiService } from './pcc-ai.service.js';

@Module({
  imports: [PrismaModule, ReadinessModule, GatingModule],
  controllers: [PccAiController],
  providers: [
    PccAiService,
    {
      provide: GROQ_CLIENT,
      useFactory: (): GroqClient | null => {
        const apiKey = process.env.GROQ_API_KEY?.trim();
        return apiKey ? (new Groq({ apiKey }) as unknown as GroqClient) : null;
      },
    },
  ],
  exports: [PccAiService],
})
export class PccAiModule {}
