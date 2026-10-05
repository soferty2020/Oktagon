import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type CloseFreezeInput,
  type CreateFreezeInput,
  type FreezeView,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
// Обычный импорт, не `import type`: репозиторий — DI-токен, его значение должно
// попасть в метаданные конструктора (emitDecoratorMetadata).
import { FreezeRepository } from './freezes.repository';
import type { FreezeRecord } from './freezes.repository';

/**
 * Заморозки (эпик F, BR-005).
 *
 * Заморозка — открытый период приостановления: она начинается с указанной даты и
 * длится до ручного завершения. Начало и завершение можно внести задним числом:
 * заморозку часто оформляют постфактум, когда спортсмен уже вернулся.
 *
 * Одновременно открытая заморозка только одна: иначе нельзя было бы понять,
 * когда приостановка закончилась, а задолженность освобождалась бы дважды
 * (BR-004, условие 4).
 */
@Injectable()
export class FreezesService {
  private readonly logger = new Logger(FreezesService.name);

  constructor(
    private readonly freezes: FreezeRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(callerUserId: string, athleteId: string): Promise<FreezeView[]> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);
    const freezes = await this.freezes.listFreezes(athleteId);
    return freezes.map(toFreezeView);
  }

  async open(
    callerUserId: string,
    athleteId: string,
    input: CreateFreezeInput,
  ): Promise<FreezeView> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    if (!(await this.freezes.athleteExists(athleteId))) {
      throw new ApiException('ATHLETE_NOT_FOUND' satisfies ApiErrorCode, 'Спортсмен не найден');
    }

    const existing = await this.freezes.findOpenFreeze(athleteId);
    if (existing) {
      throw new ApiException(
        'FREEZE_ALREADY_OPEN' satisfies ApiErrorCode,
        'У спортсмена уже есть открытая заморозка: сначала завершите ее',
        { freezeId: existing.id, startedOn: toCalendarDate(existing.startedOn) },
      );
    }

    const startedOn = parseCalendarDate(input.startedOn);

    const freeze = await this.freezes.createFreeze({
      athleteId,
      startedOn,
      reason: input.reason ?? null,
      createdById: callerUserId,
    });

    await this.audit.recordSafely({
      action: AuditAction.FREEZE_CREATED,
      entityType: AuditEntityType.FREEZE_PERIOD,
      entityId: freeze.id,
      after: { athleteId, startedOn: toCalendarDate(startedOn), reason: input.reason ?? null },
    });

    this.logger.log(`Заморозка открыта: спортсмен ${athleteId} с ${toCalendarDate(startedOn)}`);

    return toFreezeView(freeze);
  }

  async close(
    callerUserId: string,
    freezeId: string,
    input: CloseFreezeInput,
  ): Promise<FreezeView> {
    const freeze = await this.requireFreeze(freezeId);
    await this.scope.assertAthleteAccess(callerUserId, freeze.athleteId);

    if (freeze.endedOn) {
      throw new ApiException('FREEZE_NOT_OPEN' satisfies ApiErrorCode, 'Заморозка уже завершена');
    }

    const endedOn = parseCalendarDate(input.endedOn);
    if (endedOn < freeze.startedOn) {
      throw new ApiException(
        'FREEZE_PERIOD_INVALID' satisfies ApiErrorCode,
        'Дата завершения раньше даты начала заморозки',
        { startedOn: toCalendarDate(freeze.startedOn) },
      );
    }

    const closed = await this.freezes.closeFreeze({
      id: freezeId,
      endedOn,
      closedById: callerUserId,
    });

    await this.audit.recordSafely({
      action: AuditAction.FREEZE_CLOSED,
      entityType: AuditEntityType.FREEZE_PERIOD,
      entityId: freezeId,
      before: { startedOn: toCalendarDate(freeze.startedOn) },
      after: { endedOn: toCalendarDate(endedOn) },
    });

    return toFreezeView(closed);
  }

  private async requireFreeze(freezeId: string): Promise<FreezeRecord> {
    const freeze = await this.freezes.findFreeze(freezeId);
    if (!freeze) {
      throw new ApiException('FREEZE_NOT_OPEN' satisfies ApiErrorCode, 'Заморозка не найдена');
    }
    return freeze;
  }
}

/** Календарная дата YYYY-MM-DD: заморозка считается по дням, время не нужно. */
function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiException(
      'FREEZE_PERIOD_INVALID' satisfies ApiErrorCode,
      'Дата должна быть в формате YYYY-MM-DD',
      { value },
    );
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new ApiException(
      'FREEZE_PERIOD_INVALID' satisfies ApiErrorCode,
      'Некорректная дата заморозки',
      { value },
    );
  }
  return date;
}

function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toFreezeView(freeze: FreezeRecord): FreezeView {
  return {
    id: freeze.id,
    athleteId: freeze.athleteId,
    athleteName: freeze.athleteName,
    startedOn: toCalendarDate(freeze.startedOn),
    endedOn: freeze.endedOn ? toCalendarDate(freeze.endedOn) : null,
    reason: freeze.reason,
    isOpen: freeze.endedOn === null,
    createdAt: freeze.createdAt.toISOString(),
  };
}
