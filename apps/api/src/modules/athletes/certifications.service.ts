import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  certificationStageLabel,
  findBeltGrade,
  rankLabel,
  resolveRank,
  type CertificationStageKind,
  type CertificationView,
  type CreateCertificationInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
import { CertificationsRepository, type CertificationRecord } from './certifications.repository';

/**
 * Аттестации спортсмена.
 *
 * Создание аттестации — это присвоение ступени: оно меняет текущий пояс в
 * карточке. Поэтому операция идёт через сервис, а не через прямое редактирование
 * поля: иначе история и карточка разошлись бы.
 *
 * Отмена разрешена: ошибочная запись должна исправляться, а не жить вечно. При
 * отмене текущий пояс пересчитывается по последней оставшейся аттестации.
 */
@Injectable()
export class CertificationsService {
  private readonly logger = new Logger(CertificationsService.name);

  constructor(
    private readonly repository: CertificationsRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
  ) {}

  /** История аттестаций: новые сверху. */
  async list(callerUserId: string, athleteId: string): Promise<CertificationView[]> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const records = await this.repository.listForAthlete(athleteId);
    return records.map(toView);
  }

  /** Новая аттестация: присваивает ступень и пояс. */
  async create(
    callerUserId: string,
    athleteId: string,
    input: CreateCertificationInput,
  ): Promise<CertificationView> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const certifiedOn = parseCertifiedOn(input.certifiedOn);

    // Ступень — источник истины (ADR-0012). Принимаем и новый `rank`, и старую
    // пару «вид + номер»: клиенты обновляются не одновременно с API.
    const rank = resolveRank(input);
    if (!rank) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        'Укажите ступень из справочника',
      );
    }

    // Если клиент прислал пояс, он должен совпадать с поясом ступени. Молча
    // переписать пояс — значит скрыть ошибку ввода, а не исправить её.
    if (input.beltGrade) {
      const belt = validateBeltGrade(input.beltGrade);
      if (belt !== rank.belt) {
        throw new ApiException(
          'VALIDATION_FAILED' satisfies ApiErrorCode,
          `Ступень «${rank.label}» соответствует поясу «${rank.beltLabel}», а не «${input.beltGrade}»`,
        );
      }
    }

    const record = await this.repository.create({
      athleteId,
      certifiedOn,
      beltGrade: rank.belt,
      stageKind: rank.kind,
      stageNumber: rank.number,
      rank: rank.id,
      note: input.note?.trim() ? input.note.trim().slice(0, 500) : null,
      createdById: callerUserId,
    });

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_CERTIFIED,
      entityType: AuditEntityType.CERTIFICATION,
      entityId: record.id,
      actorUserId: callerUserId,
      after: {
        athleteId,
        beltGrade: record.beltGrade,
        stage: certificationStageLabel(record.stageKind, record.stageNumber),
        certifiedOn: record.certifiedOn.toISOString().slice(0, 10),
      },
    });

    this.logger.log(`Аттестация ${record.id}: спортсмен ${athleteId} → ${record.beltGrade}`);
    return toView(record);
  }

  /** Отмена ошибочной аттестации; текущий пояс пересчитывается. */
  async cancel(callerUserId: string, certificationId: string): Promise<void> {
    const existing = await this.repository.findById(certificationId);
    if (!existing) {
      throw ApiException.notFound('Аттестация не найдена');
    }

    await this.scope.assertAthleteAccess(callerUserId, existing.athleteId);

    const cancelled = await this.repository.cancel(certificationId);
    if (!cancelled) {
      throw ApiException.notFound('Аттестация не найдена');
    }

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_CERTIFICATION_CANCELLED,
      entityType: AuditEntityType.CERTIFICATION,
      entityId: certificationId,
      actorUserId: callerUserId,
      before: {
        athleteId: existing.athleteId,
        beltGrade: existing.beltGrade,
        stage: certificationStageLabel(existing.stageKind, existing.stageNumber),
      },
    });
  }
}

/** Дата аттестации: прошедшее событие, будущее запрещено. */
function parseCertifiedOn(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Некорректная дата аттестации');
  }

  const today = new Date();
  const endOfToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1),
  );
  if (date >= endOfToday) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      'Дата аттестации не может быть в будущем',
    );
  }

  return date;
}


/** Пояс должен быть из фиксированного справочника (BR-015). */
function validateBeltGrade(value: string) {
  const grade = findBeltGrade(value);
  if (!grade) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      `Пояс «${value}» отсутствует в справочнике`,
    );
  }
  return grade.code;
}

/** Запись → ответ API. */
function toView(record: CertificationRecord): CertificationView {
  return {
    id: record.id,
    athleteId: record.athleteId,
    certifiedOn: record.certifiedOn.toISOString().slice(0, 10),
    // Ступень — из каталога; для старых записей её выводит миграция. Если её нет,
    // клиент покажет «не определена», а не подставит пояс как ступень.
    rank: record.rank ?? null,
    rankLabel: rankLabel(record.rank),
    beltGrade: record.beltGrade,
    stageKind: record.stageKind as CertificationStageKind,
    stageNumber: record.stageNumber,
    stageLabel: certificationStageLabel(
      record.stageKind as CertificationStageKind,
      record.stageNumber,
    ),
    note: record.note,
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
  };
}
