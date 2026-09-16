import { Module } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { GatingModule } from '../gating/gating.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ReadinessModule } from '../readiness/readiness.module.js';
import { GEMINI_CLIENT, GeminiClient } from './ai.constants.js';
import { PccAiController } from './pcc-ai.controller.js';
import { PccAiService } from './pcc-ai.service.js';

@Module({
  imports: [PrismaModule, ReadinessModule, GatingModule],
  controllers: [PccAiController],
  providers: [
    PccAiService,
    {
      provide: GEMINI_CLIENT,
      useFactory: (): GeminiClient | null => {
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        return apiKey ? (new GoogleGenAI({ apiKey }) as unknown as GeminiClient) : null;
      },
    },
  ],
  exports: [PccAiService],
})
export class PccAiModule {}
