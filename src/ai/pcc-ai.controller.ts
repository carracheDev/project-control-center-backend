import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.js';
import { AskPccQuestionDto } from './dto/ask-pcc-question.dto.js';
import { PccAiService } from './pcc-ai.service.js';

@Controller('ai')
export class PccAiController {
  constructor(private readonly aiService: PccAiService) {}

  @Get('phases/:phaseId/analyze')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  analyzePhase(@Param('phaseId') phaseId: string, @CurrentUser() user: AuthenticatedUser) {
    console.log('[PccAiController] ANALYZE request received', { phaseId, userId: user.id });
    return this.aiService.analyzePhase(phaseId);
  }

  @Post('phases/:phaseId/chat')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  askQuestion(@Param('phaseId') phaseId: string, @Body() dto: AskPccQuestionDto) {
    return this.aiService.chatPhase(phaseId, dto.message, dto.sessionId, dto.interviewId);
  }
}
