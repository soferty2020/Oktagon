/**
 * Domain enums shared between backend, admin и mobile.
 *
 * Значения соответствуют спецификации:
 * - docs/04-roles-permissions.md (роли и permissions)
 * - docs/03-business-rules.md (BR-006: статусы спортсмена)
 * - docs/22-erd.md (сущности)
 *
 * Значения enum'ов в БД хранятся в том же регистре, что и здесь, чтобы
 * контракт API и схема БД не расходились.
 */

/** Базовая роль пользователя (docs/04-roles-permissions.md). */
export const UserRole = {
  MEMBER: 'MEMBER',
  STAFF: 'STAFF',
  SUPERADMIN: 'SUPERADMIN',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: readonly UserRole[] = Object.values(UserRole);

/** Индивидуальные permissions поверх роли (docs/04-roles-permissions.md). */
export const PermissionCode = {
  AthletesView: 'athletes.view',
  AthletesEdit: 'athletes.edit',
  AthletesContactsView: 'athletes.contacts.view',
  GroupsView: 'groups.view',
  GroupsEdit: 'groups.edit',
  AttendanceView: 'attendance.view',
  AttendanceEdit: 'attendance.edit',
  AttestationsView: 'attestations.view',
  AttestationsManage: 'attestations.manage',
  AttestationsResults: 'attestations.results',
  AttestationsPublish: 'attestations.publish',
  CompetitionsView: 'competitions.view',
  CompetitionsManage: 'competitions.manage',
  CompetitionsResults: 'competitions.results',
  CompetitionsPublish: 'competitions.publish',
  ScheduleView: 'schedule.view',
  ScheduleEdit: 'schedule.edit',
  ScheduleCancel: 'schedule.cancel',
  ScheduleChangeTrainer: 'schedule.change_trainer',
  ScheduleChangeLocation: 'schedule.change_location',
  PaymentsView: 'payments.view',
  PaymentsEdit: 'payments.edit',
  FreezesView: 'freezes.view',
  FreezesEdit: 'freezes.edit',
  NewsCreate: 'news.create',
  NewsEdit: 'news.edit',
  NewsDelete: 'news.delete',
  NewsModerate: 'news.moderate',
  ChatUse: 'chat.use',
  BranchesView: 'branches.view',
  BranchesManage: 'branches.manage',
  UsersManage: 'users.manage',
  PermissionsManage: 'permissions.manage',
  AnalyticsView: 'analytics.view',
} as const;
export type PermissionCode = (typeof PermissionCode)[keyof typeof PermissionCode];

export const PERMISSION_CODES: readonly PermissionCode[] = Object.values(PermissionCode);

/** Права, открывающие финансовые данные (BR-010). */
export const FINANCIAL_PERMISSION_CODES: readonly PermissionCode[] = [
  PermissionCode.PaymentsView,
  PermissionCode.PaymentsEdit,
  PermissionCode.FreezesView,
  PermissionCode.FreezesEdit,
];

/**
 * Базовый набор прав роли. Индивидуальные permissions добавляются поверх.
 *
 * MEMBER получает три права **на чтение** — `groups.view`, `schedule.view`,
 * `attendance.view` (ADR-0013). Матрица прав обещает ему «own linked athletes»,
 * «own schedule» и «own attendance» со scope, а не capability, но без этих прав
 * запрос отклонялся guard'ом **до** проверки scope, и родитель не видел
 * расписание и посещаемость своего спортсмена (критерии 7, 9 и 14 приемки).
 *
 * Права на запись (`attendance.edit`, `schedule.edit`, `schedule.cancel`) роли не
 * даются: родитель не отмечает посещаемость и не переносит занятия. Финансовые
 * права тоже не даются: `payments.view` открывает суммы по всей школе и список
 * должников, что не выражает «own status only» (см. ADR-0013, Consequences).
 *
 * Каталог permissions в БД (seed) должен содержать ровно PERMISSION_CODES;
 * права, не выданные ни одной роли, включая payments.* и freezes.*, доступны
 * только через индивидуальную выдачу (BR-010).
 */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly PermissionCode[]>> = {
  // Родитель видит мероприятия своих детей и опубликованные результаты (#39).
  // Самостоятельной записи у него нет — это правило проверяет API, а не права.
  MEMBER: [
    PermissionCode.GroupsView,
    PermissionCode.ScheduleView,
    PermissionCode.AttendanceView,
    PermissionCode.AttestationsView,
    PermissionCode.CompetitionsView,
  ],
  STAFF: [
    PermissionCode.AthletesView,
    PermissionCode.AthletesContactsView,
    PermissionCode.GroupsView,
    PermissionCode.AttendanceView,
    PermissionCode.AttendanceEdit,
    // Тренер ведёт аттестации своих спортсменов: создаёт мероприятие, отмечает
    // допуск и результат. Публикация — отдельное право у руководителя.
    PermissionCode.AttestationsView,
    PermissionCode.AttestationsManage,
    PermissionCode.AttestationsResults,
    // Турниры: тренер заявляет своих спортсменов и вносит их результаты.
    PermissionCode.CompetitionsView,
    PermissionCode.CompetitionsManage,
    PermissionCode.CompetitionsResults,
    PermissionCode.ScheduleView,
    PermissionCode.ChatUse,
  ],
  SUPERADMIN: PERMISSION_CODES,
};

/** BR-006: статусы карточки спортсмена. */
export const AthleteStatus = {
  ACTIVE: 'ACTIVE',
  FROZEN: 'FROZEN',
  ARCHIVED: 'ARCHIVED',
} as const;
export type AthleteStatus = (typeof AthleteStatus)[keyof typeof AthleteStatus];

/** Пол в карточке спортсмена. */
export const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  UNSPECIFIED: 'UNSPECIFIED',
} as const;
export type Gender = (typeof Gender)[keyof typeof Gender];

/** Статус пользователя (приглашённый аккаунт ещё не активирован). */
export const UserStatus = {
  INVITED: 'INVITED',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Итоговая посещаемость подтверждается тренером (BR-008). */
export const AttendanceStatus = {
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  EXCUSED: 'EXCUSED',
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

/** Причина точечного изменения экземпляра занятия (BR-009). */
export const SessionStatus = {
  SCHEDULED: 'SCHEDULED',
  CANCELLED: 'CANCELLED',
  MOVED: 'MOVED',
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

/** BR-011: статус новости. Черновик виден только автору и модератору. */
export const NewsStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type NewsStatus = (typeof NewsStatus)[keyof typeof NewsStatus];

/** Тип диалога (BR-012). */
export const ConversationType = {
  GROUP: 'GROUP',
  DIRECT: 'DIRECT',
} as const;
export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];
/** Тип подписки участника диалога. */
export const ConversationMemberRole = {
  MEMBER: 'MEMBER',
  TRAINER: 'TRAINER',
} as const;
export type ConversationMemberRole =
  (typeof ConversationMemberRole)[keyof typeof ConversationMemberRole];

/** День недели для слота квартального шаблона расписания. */
export const Weekday = {
  MONDAY: 'MONDAY',
  TUESDAY: 'TUESDAY',
  WEDNESDAY: 'WEDNESDAY',
  THURSDAY: 'THURSDAY',
  FRIDAY: 'FRIDAY',
  SATURDAY: 'SATURDAY',
  SUNDAY: 'SUNDAY',
} as const;
export type Weekday = (typeof Weekday)[keyof typeof Weekday];

/** Статус расчетного периода за календарный месяц (BR-001..BR-004). */
export const MembershipPeriodStatus = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  FULLY_PAID_MARKED: 'FULLY_PAID_MARKED',
} as const;
export type MembershipPeriodStatus =
  (typeof MembershipPeriodStatus)[keyof typeof MembershipPeriodStatus];

/** Способ внесения оплаты (фиксируется вручную суперадмином). */
export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  TRANSFER: 'TRANSFER',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

/**
 * Направление движения средств (ADR-0010).
 *
 * Возврат — не удаление поступления: деньги сначала поступили, потом были
 * возвращены, и оба факта остаются в истории. Сумма транзакции всегда
 * положительна, направление задает этот признак.
 */
export const PaymentKind = {
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND',
} as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];
