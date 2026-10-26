import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode, type CertificationParticipantView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { RecordResultDto } from './participants.dto';
import { ResultsService, type ResultRevisionView } from './results.service';

/**
 * Результаты участников (#35).
 *
 * Отдельный контроллер от участников: запись результата меняет не только запись
 * участника, но и аттестацию и текущую ступень спортсмена — это другая операция
 * с другими последствиями.
 */
@ApiTags('certification-results')
@ApiBearerAuth()
@Controller('certification-events/:eventId/participants/:athleteId')
@UseGuards(AuthGuard, PermissionsGuard)
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Post('result')
  @RequirePermissions(PermissionCode.AttestationsResults)
  @ApiOperation({ summary: 'Записать итог; исправление требует причины' })
  @ApiOkResponse({ description: 'Итог сохранён; при PASSED ступень присвоена' })
  async record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Body() dto: RecordResultDto,
  ): Promise<CertificationParticipantView> {
    return this.results.record(user.id, user.role === 'SUPERADMIN', eventId, athleteId, dto);
  }

  @Get('revisions')
  @RequirePermissions(PermissionCode.AttestationsView)
  @ApiOperation({ summary: 'История версий результата' })
  async revisions(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
  ): Promise<ResultRevisionView[]> {
    return this.results.revisions(eventId, athleteId);
  }
}
