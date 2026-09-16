import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import { ProjectAccess } from '../project-access/decorators/project-access.decorator.js';
import { AskPccQuestionDto } from './dto/ask-pcc-question.dto.js';
import { PccAiService } from './pcc-ai.service.js';

@Controller('ai')
export class PccAiController {
  constructor(private readonly aiService: PccAiService) {}

  @Get('phases/:phaseId/analyze')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  analyzePhase(@Param('phaseId') phaseId: string) {
    return this.aiService.analyzePhase(phaseId);
  }

  @Post('phases/:phaseId/chat')
  @ProjectAccess('phaseId', 'phase', ProjectMemberRole.VIEWER)
  askQuestion(@Param('phaseId') phaseId: string, @Body() dto: AskPccQuestionDto) {
    return this.aiService.chatPhase(phaseId, dto.message);
  }
}
