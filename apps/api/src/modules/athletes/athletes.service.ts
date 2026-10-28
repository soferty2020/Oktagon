import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  PermissionCode,
  type AthleteDetails,
  type AthleteView,
  type CreateAthleteInput,
  type LinkAccountInput,
  type UpdateAthleteInput,
  applyContactsVisibility,
  findRank,
  hasPermission,
  rankLabel,
} from '@octagon/contracts';

import { AthleteStatus, type BeltGrade, type Gender } from '../../../generated/prisma';
import { ApiException } from '../../shared/api-exception';
import { PermissionResolver } from '../../shared/permissions.guard';
import { AuditService } from '../audit/audit.service';
import { ResourceScopeService } from '../identity/resource-scope.service';
// Обычный импорт, не `import type`: AthletesRepository — DI-токен, его значение
// должно попасть в метаданные конструктора (emitDecoratorMetadata).
import { AthletesRepository } from './athletes.repository';
import type {
  AthleteRecord,
  CreateAthleteInput as CreateAthleteRecordInput,
  UpdateAthleteInput as UpdateAthleteRecordInput,
} from './athletes.repository';

/**
 * Спортсмены и связи с аккаунтами (issues C4–C5).
 *
 * Спецификация: docs/07-domain-model.md, docs/22-erd.md (Athlete, UserAthlete),
 * docs/00-project-overview.md (аккаунт не равен карточке спортсмена),
 * BR-007 (аудит), docs/15-security.md (контакты — только с правом).
 *
 * Здесь scope не только проверяется, но и влияет на выборку: тренер получает
 * список только своих спортсменов (docs/21-permission-matrix.md, Enforcement).
 * Даты приходят из контракта строками и преобразуются в Date на этой границе.
 */
@Injectable()
export class AthletesService {
  private readonly logger = new Logger(AthletesService.name);

  constructor(
    private readonly repository: AthletesRepository,
    private readonly scope: ResourceScopeService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionResolver,
  ) {}

  /** Список спортсменов в зоне видимости вызывающего. */
  async list(
    callerUserId: string,
    options: { status?: string; search?: string } = {},
  ): Promise<AthleteView[]> {
    const visible = await this.scope.visibleAthleteIds(callerUserId);
    const canViewContacts = await this.canViewContacts(callerUserId);
    const allowed = visible === null ? null : new Set(visible);

    const athletes = await this.repository.list({
      status: options.status as AthleteStatus | undefined,
      search: options.search,
    });

    return athletes
      .filter((athlete) => allowed === null || allowed.has(athlete.id))
      .map((athlete) => toAthleteView(athlete, canViewContacts));
  }

  async get(callerUserId: string, athleteId: string): Promise<AthleteDetails> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const athlete = await this.requireAthlete(athleteId);
    const accounts = await this.repository.listAccounts(athleteId);
    const affiliation = await this.repository.findAffiliation(athleteId);
    const canViewContacts = await this.canViewContacts(callerUserId);

    return {
      ...toAthleteView(athlete, canViewContacts),
      notes: athlete.notes,
      // Группа, тренер и зал: null — не назначено, интерфейс покажет empty state.
      group: affiliation.group,
      trainer: affiliation.trainer,
      hall: affiliation.hall,
    hallId: athlete.hallId ?? null,
      linkedAccounts: accounts.map((account) => ({
        userId: account.userId,
        email: account.email,
        relation: account.relation,
        isPrimary: account.isPrimary,
      })),
    };
  }

  async create(input: CreateAthleteInput): Promise<AthleteView> {
    const athlete = await this.repository.create(toCreateRecord(input));

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_CREATED,
      entityType: AuditEntityType.ATHLETE,
      entityId: athlete.id,
      after: { firstName: athlete.firstName, lastName: athlete.lastName },
    });

    return toAthleteView(athlete, true);
  }

  async update(
    callerUserId: string,
    athleteId: string,
    input: UpdateAthleteInput,
  ): Promise<AthleteDetails> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const before = await this.requireAthlete(athleteId);
    await this.repository.update(athleteId, toUpdateRecord(input));

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_UPDATED,
      entityType: AuditEntityType.ATHLETE,
      entityId: athleteId,
      before: { status: before.status, lastName: before.lastName },
      after: { status: input.status ?? before.status, lastName: input.lastName ?? before.lastName },
    });

    return this.get(callerUserId, athleteId);
  }

  /** Мягкое удаление: карточка архивируется, история сохраняется. */
  async archive(callerUserId: string, athleteId: string): Promise<void> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const athlete = await this.requireAthlete(athleteId);
    await this.repository.archive(athleteId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_ARCHIVED,
      entityType: AuditEntityType.ATHLETE,
      entityId: athleteId,
      before: { firstName: athlete.firstName, lastName: athlete.lastName },
    });
  }

  /**
   * Стирает ПДн по запросу (#56, SEC-15).
   *
   * Отличается от архивации: архив оставляет ФИО и контакты, а здесь они
   * заменяются заглушкой. История тренировок, оплат и аттестаций сохраняется —
   * она нужна клубу, но уже не привязана к человеку. В аудит пишется только
   * факт и идентификаторы, без самих данных.
   */
  async erase(callerUserId: string, athleteId: string): Promise<void> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const athlete = await this.requireAthlete(athleteId);
    await this.repository.erase(athleteId, new Date());

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_ERASED,
      entityType: AuditEntityType.ATHLETE,
      entityId: athleteId,
      before: { status: athlete.status },
      after: { erased: true },
    });
  }

  /**
   * Связывает аккаунт со спортсменом (C5).
   *
   * Аккаунтов у спортсмена может быть несколько (например, оба родителя), но
   * «основным» помечается только один: признак снимается с остальных.
   */
  async linkAccount(
    callerUserId: string,
    athleteId: string,
    input: LinkAccountInput,
  ): Promise<AthleteDetails> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);
    await this.requireAthlete(athleteId);

    if (!(await this.repository.userExists(input.userId))) {
      throw new ApiException('NOT_FOUND' satisfies ApiErrorCode, 'Пользователь не найден');
    }

    if (await this.repository.findAccount(athleteId, input.userId)) {
      throw new ApiException(
        'ACCOUNT_ALREADY_LINKED' satisfies ApiErrorCode,
        'Аккаунт уже связан с этим спортсменом',
      );
    }

    const isPrimary = input.isPrimary ?? false;
    if (isPrimary) {
      await this.repository.clearPrimary(athleteId);
    }

    await this.repository.linkAccount({
      athleteId,
      userId: input.userId,
      relation: input.relation ?? 'PARENT',
      isPrimary,
    });

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_ACCOUNT_LINKED,
      entityType: AuditEntityType.USER_ATHLETE,
      entityId: athleteId,
      after: { userId: input.userId, relation: input.relation ?? 'PARENT', isPrimary },
    });

    return this.get(callerUserId, athleteId);
  }

  async unlinkAccount(
    callerUserId: string,
    athleteId: string,
    userId: string,
  ): Promise<AthleteDetails> {
    await this.scope.assertAthleteAccess(callerUserId, athleteId);

    const removed = await this.repository.unlinkAccount(athleteId, userId);
    if (!removed) {
      throw new ApiException(
        'ACCOUNT_NOT_LINKED' satisfies ApiErrorCode,
        'Аккаунт не связан с этим спортсменом',
      );
    }

    await this.audit.recordSafely({
      action: AuditAction.ATHLETE_ACCOUNT_UNLINKED,
      entityType: AuditEntityType.USER_ATHLETE,
      entityId: athleteId,
      before: { userId },
    });

    return this.get(callerUserId, athleteId);
  }

  // --- Вспомогательное -----------------------------------------------------

  private async canViewContacts(callerUserId: string): Promise<boolean> {
    const permissions = await this.permissions.getPermissions(callerUserId);
    return hasPermission(permissions, PermissionCode.AthletesContactsView);
  }

  private async requireAthlete(athleteId: string): Promise<AthleteRecord> {
    const athlete = await this.repository.find(athleteId);
    if (!athlete) {
      throw new ApiException('ATHLETE_NOT_FOUND' satisfies ApiErrorCode, 'Спортсмен не найден');
    }
    return athlete;
  }
}

/** Календарная дата из контракта (YYYY-MM-DD) превращается в Date для БД. */
function parseCalendarDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return new Date(value);
}

function toCreateRecord(input: CreateAthleteInput): CreateAthleteRecordInput {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    middleName: input.middleName ?? null,
    birthDate: parseCalendarDate(input.birthDate) ?? null,
    // Значения контракта и Prisma-клиента совпадают; DTO ограничивает набор
    // значений через @IsEnum(Gender).
    gender: input.gender as Gender | undefined,
    phone: input.phone ?? null,
    email: input.email ?? null,
    notes: input.notes ?? null,
  };
}

function toUpdateRecord(input: UpdateAthleteInput): UpdateAthleteRecordInput {
  const record: UpdateAthleteRecordInput = {
    firstName: input.firstName,
    lastName: input.lastName,
    middleName: input.middleName,
    gender: input.gender as Gender | undefined,
    // Значения контракта и Prisma-клиента совпадают: набор ограничен
    // @IsEnum(BeltGrade) в DTO и фиксированным справочником BELT_GRADES.
    beltGrade: input.beltGrade as BeltGrade | undefined,
    phone: input.phone,
    email: input.email,
    notes: input.notes,
    status: input.status,
    // Основной зал (#66): `null` очищает привязку, отсутствие поля — не трогает.
    ...(input.hallId === undefined ? {} : { hallId: input.hallId }),
  };

  // Ступень (ADR-0012) — источник истины: пояс выводится из неё. Присланный
  // отдельно пояс проверяется, а не переписывается молча: расхождение — ошибка
  // ввода, и скрывать её нельзя.
  if (input.rank) {
    const rank = findRank(input.rank);
    if (!rank) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Ступень «${input.rank}» отсутствует в справочнике`,
      );
    }

    if (input.beltGrade && input.beltGrade !== rank.belt) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Ступень «${rank.label}» соответствует поясу «${rank.beltLabel}», а не «${input.beltGrade}»`,
      );
    }

    record.rank = rank.id;
    record.beltGrade = rank.belt;
  }

  const birthDate = parseCalendarDate(input.birthDate);
  if (birthDate !== undefined) {
    record.birthDate = birthDate;
  }

  // Дата присвоения может прийти без пояса (старая запись) и наоборот: это
  // независимые поля, и связывать их валидацией значило бы запретить
  // «пояс известен, дата нет».
  const beltAwardedAt = parseCalendarDate(input.beltAwardedAt);
  if (beltAwardedAt !== undefined) {
    record.beltAwardedAt = beltAwardedAt;
  }

  return record;
}

function toAthleteView(athlete: AthleteRecord, canViewContacts: boolean): AthleteView {
  const view: AthleteView = {
    id: athlete.id,
    firstName: athlete.firstName,
    lastName: athlete.lastName,
    middleName: athlete.middleName,
    birthDate: athlete.birthDate ? athlete.birthDate.toISOString().slice(0, 10) : null,
    gender: athlete.gender,
    status: athlete.status,
    // Ступень — источник истины (ADR-0012); пояс выводится из неё, если известен.
    // `null` означает, что миграция не смогла вывести ступень однозначно, и это
    // честнее, чем подставить белый пояс.
    rank: athlete.rank ?? null,
    rankLabel: rankLabel(athlete.rank),
    // Пояс всегда заполнен: белый — значение по умолчанию, а не отсутствие данных.
    beltGrade: athlete.beltGrade,
    beltAwardedAt: athlete.beltAwardedAt
      ? athlete.beltAwardedAt.toISOString().slice(0, 10)
      : null,
    phone: athlete.phone,
    email: athlete.email,
    createdAt: athlete.createdAt.toISOString(),
    updatedAt: athlete.updatedAt.toISOString(),
  };

  return applyContactsVisibility(view, canViewContacts);
}
