import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuditRecordPage } from '@octagon/contracts';

import { AuthGuard } from '../../shared/auth-stub';
import { SuperadminGuard } from '../../shared/superadmin.guard';
import { AuditQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

/**
 * Журнал действий (K6, docs/26-admin-settings.md).
 *
 * Только чтение: эндпоинтов изменения и удаления записей нет намеренно — журнал,
 * который можно править, не является журналом.
 *
 * Доступ закрыт SuperadminGuard по роли: документ требует, чтобы индивидуально
 * выданные grants не открывали аудит.
 */
@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(AuthGuard, SuperadminGuard)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Журнал действий с фильтрами' })
  @ApiOkResponse({
    description:
      'Записи от новых к старым. Чувствительные поля замаскированы, курсор для следующей страницы',
  })
  list(@Query() query: AuditQueryDto): Promise<AuditRecordPage> {
    return this.audit.listForView({
      actorUserId: query.actorUserId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      from: query.from,
      to: query.to,
      limit: query.limit,
      cursor: query.cursor,
    });
  }
}
