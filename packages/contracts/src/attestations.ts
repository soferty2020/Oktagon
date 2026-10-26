/**
 * Мероприятия аттестаций (ADR-0012, #33).
 *
 * Аттестация — это событие: экзамен с датой, местом и списком участников. Раньше
 * была только запись «кому и когда присвоили ступень»; отдельного события не
 * существовало, поэтому нельзя было ни запланировать экзамен, ни собрать список
 * допущенных.
 *
 * Жизненный цикл: черновик → запланировано → идёт → завершено → опубликовано.
 * Отмена возможна почти из любого состояния, но результаты при этом не удаляются:
 * они остаются в архиве вместе с историей.
 */

/** Статус мероприятия. */
export const CertificationEventStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type CertificationEventStatus =
  (typeof CertificationEventStatus)[keyof typeof CertificationEventStatus];

/**
 * Разрешённые переходы.
 *
 * Заданы явно: проверять «статус из списка» недостаточно — нельзя, например,
 * опубликовать черновик или вернуть отменённое мероприятие в работу.
 */
export const EVENT_TRANSITIONS: Readonly<
  Record<CertificationEventStatus, readonly CertificationEventStatus[]>
> = {
  DRAFT: [CertificationEventStatus.PLANNED, CertificationEventStatus.CANCELLED],
  PLANNED: [CertificationEventStatus.IN_PROGRESS, CertificationEventStatus.CANCELLED],
  IN_PROGRESS: [CertificationEventStatus.COMPLETED, CertificationEventStatus.CANCELLED],
  COMPLETED: [CertificationEventStatus.PUBLISHED, CertificationEventStatus.CANCELLED],
  // Опубликованное мероприятие не отменяется: результаты уже видны родителям.
  // Исправления идут через версии результатов, а не через отмену события.
  PUBLISHED: [],
  CANCELLED: [],
};

/** Допустим ли переход статуса. */
export function canTransitionEvent(
  from: CertificationEventStatus,
  to: CertificationEventStatus,
): boolean {
  return EVENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Мероприятие в списке и карточке. */
export interface CertificationEventView {
  id: string;
  title: string;
  /** Дата и время экзамена, ISO 8601. */
  scheduledAt: string;
  location: string | null;
  organizer: string | null;
  description: string | null;
  status: CertificationEventStatus;
  /** Сколько участников добавлено. */
  participantsCount: number;
  createdBy: { id: string; email: string } | null;
  publishedAt: string | null;
  publishedBy: { id: string; email: string } | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Новое мероприятие создаётся черновиком. */
export interface CreateCertificationEventInput {
  title: string;
  scheduledAt: string;
  location?: string | null;
  organizer?: string | null;
  description?: string | null;
}

/** Правка мероприятия: меняются только заполняемые поля, статус — отдельными действиями. */
export interface UpdateCertificationEventInput {
  title?: string;
  scheduledAt?: string;
  location?: string | null;
  organizer?: string | null;
  description?: string | null;
}

/** Допуск к экзамену. Ставится вручную, независимо от оплаты. */
export const ParticipantAdmission = {
  PENDING: 'PENDING',
  ADMITTED: 'ADMITTED',
  REJECTED: 'REJECTED',
} as const;
export type ParticipantAdmission = (typeof ParticipantAdmission)[keyof typeof ParticipantAdmission];

/** Оплата экзамена: без суммы и без финансовой транзакции. */
export const ParticipantPaymentStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
} as const;
export type ParticipantPaymentStatus =
  (typeof ParticipantPaymentStatus)[keyof typeof ParticipantPaymentStatus];

/** Итог участника. */
export const ParticipantResult = {
  PENDING: 'PENDING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type ParticipantResult = (typeof ParticipantResult)[keyof typeof ParticipantResult];

/** Участник мероприятия. */
export interface CertificationParticipantView {
  id: string;
  eventId: string;
  athlete: { id: string; firstName: string; lastName: string };
  responsibleTrainer: { id: string; displayName: string } | null;
  targetRank: string;
  targetRankLabel: string | null;
  /** Снимок текущей ступени на момент добавления. */
  snapshotRank: string | null;
  snapshotRankLabel: string | null;
  admission: ParticipantAdmission;
  paymentStatus: ParticipantPaymentStatus;
  result: ParticipantResult;
  awardedRank: string | null;
  awardedRankLabel: string | null;
  resultComment: string | null;
  certificationId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Добавление участника. */
export interface AddParticipantInput {
  athleteId: string;
  targetRank: string;
  responsibleTrainerId?: string;
}

/** Допуск и целевая ступень. */
export interface UpdateParticipantInput {
  targetRank?: string;
  admission?: ParticipantAdmission;
}

/** Итог участника. */
export interface RecordResultInput {
  result: ParticipantResult;
  awardedRank?: string;
  comment?: string;
  /** Причина исправления: обязательна, если итог уже был сохранён. */
  reason?: string;
}