/**
 * Словарь аудита (BR-007, docs/08-database.md).
 *
 * Действия и типы сущностей живут в общем контракте, потому что по ним потом
 * фильтрует web-админка, а backend только пишет записи.
 *
 * Соглашение об именах: действие `<область>.<глагол_в_прошедшем_времени>`.
 * Пример: `schedule.session_moved`.
 */

export const AuditAction = {
  // Аутентификация и доступ
  AUTH_LOGIN_SUCCEEDED: 'auth.login_succeeded',
  AUTH_LOGIN_FAILED: 'auth.login_failed',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESHED: 'auth.token_refreshed',
  /** Повторное использование отозванного refresh-токена: все токены отозваны. */
  AUTH_TOKEN_REUSE_DETECTED: 'auth.token_reuse_detected',
  AUTH_INVITE_ACCEPTED: 'auth.invite_accepted',

  // Пользователи, приглашения, права доступа (BR-007: права доступа аудируемы)
  USER_INVITED: 'user.invited',
  USER_UPDATED: 'user.updated',
  USER_BLOCKED: 'user.blocked',
  USER_UNBLOCKED: 'user.unblocked',
  USER_ARCHIVED: 'user.archived',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_REVOKED: 'permission.revoked',

  // Структура клуба
  BRANCH_CREATED: 'branch.created',
  BRANCH_UPDATED: 'branch.updated',
  BRANCH_ARCHIVED: 'branch.archived',
  HALL_CREATED: 'hall.created',
  HALL_UPDATED: 'hall.updated',
  HALL_ARCHIVED: 'hall.archived',
  TRAINER_CREATED: 'trainer.created',
  TRAINER_UPDATED: 'trainer.updated',
  TRAINER_ARCHIVED: 'trainer.archived',

  // Спортсмены и группы
  ATHLETE_CREATED: 'athlete.created',
  ATHLETE_UPDATED: 'athlete.updated',
  ATHLETE_ARCHIVED: 'athlete.archived',
  ATHLETE_ACCOUNT_LINKED: 'athlete.account_linked',
  ATHLETE_ACCOUNT_UNLINKED: 'athlete.account_unlinked',
  /** Обращение к списку связанных спортсменов: контактные данные (docs/15-security.md). */
  ATHLETE_LINKS_VIEWED: 'athlete.links_viewed',
  GROUP_CREATED: 'group.created',
  GROUP_UPDATED: 'group.updated',
  GROUP_ARCHIVED: 'group.archived',
  GROUP_BRANCH_LINKED: 'group.branch_linked',
  GROUP_BRANCH_UNLINKED: 'group.branch_unlinked',
  GROUP_TRAINER_ASSIGNED: 'group.trainer_assigned',
  GROUP_TRAINER_UNASSIGNED: 'group.trainer_unassigned',
  GROUP_MEMBERSHIP_ADDED: 'group.membership_added',
  GROUP_MEMBERSHIP_ENDED: 'group.membership_ended',

  // Расписание (BR-007, BR-009: изменения расписания аудируемы)
  SCHEDULE_TEMPLATE_CREATED: 'schedule.template_created',
  SCHEDULE_TEMPLATE_UPDATED: 'schedule.template_updated',
  /** Публикация шаблона: после нее слоты не меняются, иначе занятия разойдутся с шаблоном. */
  SCHEDULE_TEMPLATE_PUBLISHED: 'schedule.template_published',
  SCHEDULE_TEMPLATE_ARCHIVED: 'schedule.template_archived',
  SCHEDULE_SLOT_ADDED: 'schedule.slot_added',
  SCHEDULE_SLOT_UPDATED: 'schedule.slot_updated',
  SCHEDULE_SLOT_REMOVED: 'schedule.slot_removed',
  /** Материализация занятий из шаблона. */
  SCHEDULE_SESSIONS_GENERATED: 'schedule.sessions_generated',
  SCHEDULE_SESSION_CREATED: 'schedule.session_created',
  SCHEDULE_SESSION_MOVED: 'schedule.session_moved',
  SCHEDULE_SESSION_CANCELLED: 'schedule.session_cancelled',
  SCHEDULE_SESSION_TRAINER_CHANGED: 'schedule.session_trainer_changed',
  SCHEDULE_SESSION_LOCATION_CHANGED: 'schedule.session_location_changed',

  // Посещаемость (BR-008)
  ATTENDANCE_MARKED: 'attendance.marked',
  ATTENDANCE_UPDATED: 'attendance.updated',
  PLANNED_ABSENCE_REPORTED: 'attendance.planned_absence_reported',
  PLANNED_ABSENCE_CANCELLED: 'attendance.planned_absence_cancelled',

  // Финансы (BR-001..BR-003, BR-007)
  MEMBERSHIP_PERIOD_CREATED: 'finance.period_created',
  MEMBERSHIP_PERIOD_UPDATED: 'finance.period_updated',
  PAYMENT_RECORDED: 'finance.payment_recorded',
  PAYMENT_UPDATED: 'finance.payment_updated',
  PAYMENT_VOIDED: 'finance.payment_voided',
  PERIOD_MARKED_FULLY_PAID: 'finance.period_marked_fully_paid',
  PERIOD_FULLY_PAID_UNMARKED: 'finance.period_fully_paid_unmarked',

  // Заморозки (BR-005, BR-007)
  FREEZE_CREATED: 'freeze.created',
  FREEZE_UPDATED: 'freeze.updated',
  FREEZE_CLOSED: 'freeze.closed',

  // Коммуникации
  NEWS_PUBLISHED: 'news.published',
  NEWS_UPDATED: 'news.updated',
  NEWS_ARCHIVED: 'news.archived',
  NEWS_COMMENT_DELETED: 'news.comment_deleted',
  CONVERSATION_CREATED: 'chat.conversation_created',
  CONVERSATION_MEMBER_ADDED: 'chat.member_added',
  CONVERSATION_MEMBER_REMOVED: 'chat.member_removed',
  MESSAGE_DELETED: 'chat.message_deleted',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const AUDIT_ACTIONS: readonly AuditAction[] = Object.values(AuditAction);

/** Тип сущности в записи аудита. */
export const AuditEntityType = {
  USER: 'User',
  USER_PERMISSION: 'UserPermission',
  USER_INVITE: 'UserInvite',
  REFRESH_TOKEN: 'RefreshToken',
  BRANCH: 'Branch',
  HALL: 'Hall',
  TRAINER_PROFILE: 'TrainerProfile',
  ATHLETE: 'Athlete',
  USER_ATHLETE: 'UserAthlete',
  GROUP: 'Group',
  GROUP_BRANCH: 'GroupBranch',
  GROUP_TRAINER: 'GroupTrainer',
  GROUP_MEMBERSHIP: 'GroupMembership',
  SCHEDULE_TEMPLATE: 'ScheduleTemplate',
  TRAINING_SESSION: 'TrainingSession',
  ATTENDANCE: 'Attendance',
  PLANNED_ABSENCE: 'PlannedAbsence',
  MEMBERSHIP_PERIOD: 'MembershipPeriod',
  PAYMENT_TRANSACTION: 'PaymentTransaction',
  FREEZE_PERIOD: 'FreezePeriod',
  NEWS_POST: 'NewsPost',
  NEWS_COMMENT: 'NewsComment',
  CONVERSATION: 'Conversation',
  MESSAGE: 'Message',
} as const;
export type AuditEntityType = (typeof AuditEntityType)[keyof typeof AuditEntityType];

export const AUDIT_ENTITY_TYPES: readonly AuditEntityType[] = Object.values(AuditEntityType);

/**
 * Контекст запроса, попадающий в аудит: кто, откуда и в рамках какого запроса
 * выполнил действие.
 */
export interface AuditContext {
  actorUserId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** Запись аудита, запрашиваемая вызывающим кодом. */
export interface AuditEvent extends AuditContext {
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}
