/**
 * Единый формат ошибок API (docs/09-api.md) и стабильные машиночитаемые коды
 * (docs/23-api-contract-plan.md: authorization errors distinguish 401/403).
 */

export const ApiErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // identity
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  INVITE_INVALID: 'INVITE_INVALID',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_ALREADY_USED: 'INVITE_ALREADY_USED',
  /** Приглашение выдано на другой адрес: принимающий вошел под своим аккаунтом. */
  INVITE_EMAIL_MISMATCH: 'INVITE_EMAIL_MISMATCH',
  USER_BLOCKED: 'USER_BLOCKED',
  /** Неизвестный код права: каталог permissions не содержит такого значения. */
  PERMISSION_UNKNOWN: 'PERMISSION_UNKNOWN',
  /** Право уже гарантировано ролью пользователя. */
  PERMISSION_GRANTED_BY_ROLE: 'PERMISSION_GRANTED_BY_ROLE',
  /** Право пришло от роли и не может быть отозвано индивидуально. */
  PERMISSION_IS_ROLE_BASED: 'PERMISSION_IS_ROLE_BASED',
  /** Индивидуальной выдачи с таким правом нет. */
  PERMISSION_NOT_GRANTED: 'PERMISSION_NOT_GRANTED',
  /** Срок действия выдачи уже истек. */
  PERMISSION_EXPIRES_IN_PAST: 'PERMISSION_EXPIRES_IN_PAST',

  // club structure / groups
  BRANCH_ARCHIVED: 'BRANCH_ARCHIVED',
  BRANCH_NOT_FOUND: 'BRANCH_NOT_FOUND',
  HALL_NOT_IN_BRANCH: 'HALL_NOT_IN_BRANCH',
  HALL_NOT_FOUND: 'HALL_NOT_FOUND',
  /**
   * В филиале уже есть зал с таким названием.
   *
   * Схема требует уникальности пары «филиал + название» (`@@unique`). Без явной
   * проверки Prisma отдавала ошибку P2002, которая превращалась в 500:
   * администратор видел «внутренняя ошибка» вместо причины.
   */
  HALL_NAME_TAKEN: 'HALL_NAME_TAKEN',
  /**
   * В зале есть предстоящие занятия: архивировать нельзя.
   *
   * Архивный зал исчезает из выбора в расписании, а занятия в нем остались бы:
   * тренер и группа пришли бы в закрытый зал. Сначала занятия нужно перенести.
   */
  HALL_HAS_SESSIONS: 'HALL_HAS_SESSIONS',
  TRAINER_ALREADY_ASSIGNED: 'TRAINER_ALREADY_ASSIGNED',
  TRAINER_NOT_FOUND: 'TRAINER_NOT_FOUND',
  /** Профиль тренера не связан с аккаунтом: отвязывать нечего. */
  TRAINER_ACCOUNT_NOT_LINKED: 'TRAINER_ACCOUNT_NOT_LINKED',
  /**
   * Роль аккаунта не подходит для тренера.
   *
   * Тренеру нужна роль STAFF: у участника клуба (MEMBER) нет прав на занятия и
   * посещаемость, поэтому связь создала бы «тренера» без возможностей.
   */
  TRAINER_ACCOUNT_ROLE_INVALID: 'TRAINER_ACCOUNT_ROLE_INVALID',
  /** Аккаунт не активирован: приглашение еще не принято. */
  TRAINER_ACCOUNT_NOT_ACTIVE: 'TRAINER_ACCOUNT_NOT_ACTIVE',
  /** Аккаунт уже связан с этим спортсменом. */
  ACCOUNT_ALREADY_LINKED: 'ACCOUNT_ALREADY_LINKED',
  /** Связи аккаунта со спортсменом нет. */
  ACCOUNT_NOT_LINKED: 'ACCOUNT_NOT_LINKED',

  // athletes
  ATHLETE_ARCHIVED: 'ATHLETE_ARCHIVED',
  ATHLETE_NOT_FOUND: 'ATHLETE_NOT_FOUND',
  ACTIVE_MEMBERSHIP_EXISTS: 'ACTIVE_MEMBERSHIP_EXISTS',

  // groups
  GROUP_NOT_FOUND: 'GROUP_NOT_FOUND',
  GROUP_ARCHIVED: 'GROUP_ARCHIVED',
  /** Тренер уже ведет эту группу (активное назначение). */
  GROUP_TRAINER_ALREADY_ASSIGNED: 'GROUP_TRAINER_ALREADY_ASSIGNED',
  /** Назначение тренера не найдено. */
  GROUP_TRAINER_NOT_ASSIGNED: 'GROUP_TRAINER_NOT_ASSIGNED',
  /** Филиал уже привязан к группе. */
  GROUP_BRANCH_ALREADY_LINKED: 'GROUP_BRANCH_ALREADY_LINKED',
  /** Привязка филиала не найдена. */
  GROUP_BRANCH_NOT_LINKED: 'GROUP_BRANCH_NOT_LINKED',
  /** Спортсмен уже состоит в этой группе. */
  ATHLETE_ALREADY_MEMBER: 'ATHLETE_ALREADY_MEMBER',
  /** Членство спортсмена в группе не найдено. */
  MEMBERSHIP_NOT_FOUND: 'MEMBERSHIP_NOT_FOUND',
  /**
   * Занятие этой группы на это время уже есть.
   *
   * Отдельно от `TRAINING_SESSION_CONFLICT`: там накладка с чужим занятием
   * (зал или тренер), здесь — повторное создание того же самого. Для
   * администратора это разные ситуации, и подсказки должны быть разными.
   */
  TRAINING_SESSION_DUPLICATE: 'TRAINING_SESSION_DUPLICATE',

  // schedule
  SCHEDULE_TEMPLATE_NOT_FOUND: 'SCHEDULE_TEMPLATE_NOT_FOUND',
  SCHEDULE_TEMPLATE_EXISTS: 'SCHEDULE_TEMPLATE_EXISTS',
  SCHEDULE_TEMPLATE_ALREADY_PUBLISHED: 'SCHEDULE_TEMPLATE_ALREADY_PUBLISHED',
  /** Шаблон опубликован: слоты менять нельзя, иначе занятия разойдутся с ним. */
  SCHEDULE_TEMPLATE_PUBLISHED: 'SCHEDULE_TEMPLATE_PUBLISHED',
  SCHEDULE_TEMPLATE_EMPTY: 'SCHEDULE_TEMPLATE_EMPTY',
  /** Слот пересекается с другим слотом того же шаблона. */
  SLOT_OVERLAPS_TEMPLATE: 'SLOT_OVERLAPS_TEMPLATE',
  /** Интервал слота некорректен: конец не позже начала. */
  SCHEDULE_SLOT_INVALID_TIME: 'SCHEDULE_SLOT_INVALID_TIME',
  TRAINING_SESSION_NOT_FOUND: 'TRAINING_SESSION_NOT_FOUND',
  TRAINING_SESSION_CANCELLED: 'TRAINING_SESSION_CANCELLED',
  /** У группы уже есть занятие в это время. */
  TRAINING_SESSION_CONFLICT: 'TRAINING_SESSION_CONFLICT',
  /** Тренер занят в это время в другой группе. */
  TRAINER_BUSY: 'TRAINER_BUSY',
  /** Зал занят в это время другой группой. */
  HALL_BUSY: 'HALL_BUSY',
  /** Занятие началось: точечные изменения по прошлому запрещены. */
  SESSION_ALREADY_STARTED: 'SESSION_ALREADY_STARTED',

  // attendance
  ATTENDANCE_ALREADY_RECORDED: 'ATTENDANCE_ALREADY_RECORDED',
  ATTENDANCE_NOT_FOUND: 'ATTENDANCE_NOT_FOUND',
  /**
   * Спортсмен не числился в группе на дату занятия: отметить его нельзя, иначе
   * в журнале появились бы отсутствия за занятия, которых у него не было.
   */
  ATHLETE_NOT_IN_GROUP: 'ATHLETE_NOT_IN_GROUP',
  PLANNED_ABSENCE_EXISTS: 'PLANNED_ABSENCE_EXISTS',
  PLANNED_ABSENCE_NOT_FOUND: 'PLANNED_ABSENCE_NOT_FOUND',

  // finance / freezes
  MEMBERSHIP_PERIOD_LOCKED: 'MEMBERSHIP_PERIOD_LOCKED',
  MEMBERSHIP_PERIOD_NOT_FOUND: 'MEMBERSHIP_PERIOD_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  PAYMENT_AMOUNT_INVALID: 'PAYMENT_AMOUNT_INVALID',
  /** ADR-0010: возврат не найден. */
  REFUND_NOT_FOUND: 'REFUND_NOT_FOUND',
  /**
   * ADR-0010: возврат больше, чем было получено.
   *
   * Отдельно от `PAYMENT_AMOUNT_INVALID`: там ошибка в самой сумме, здесь —
   * попытка вернуть деньги, которых период не получал. Для администратора это
   * разные ситуации и разные подсказки.
   */
  REFUND_EXCEEDS_PAYMENT: 'REFUND_EXCEEDS_PAYMENT',
  /** ADR-0010: возврат относится к поступлению другого периода. */
  REFUND_PAYMENT_MISMATCH: 'REFUND_PAYMENT_MISMATCH',
  /** ADR-0010: по поступлению уже есть возвраты — удалять его нельзя. */
  PAYMENT_HAS_REFUNDS: 'PAYMENT_HAS_REFUNDS',
  FREEZE_ALREADY_OPEN: 'FREEZE_ALREADY_OPEN',
  FREEZE_PERIOD_INVALID: 'FREEZE_PERIOD_INVALID',
  FREEZE_NOT_OPEN: 'FREEZE_NOT_OPEN',

  // communication
  CONVERSATION_ACCESS_DENIED: 'CONVERSATION_ACCESS_DENIED',
  NEWS_NOT_PUBLISHED: 'NEWS_NOT_PUBLISHED',
  /** Новость не найдена (в том числе если это чужой черновик). */
  NEWS_POST_NOT_FOUND: 'NEWS_POST_NOT_FOUND',
  /** Комментарий не найден или уже удален. */
  NEWS_COMMENT_NOT_FOUND: 'NEWS_COMMENT_NOT_FOUND',
  /**
   * Новость нельзя изменить в этом состоянии.
   *
   * Отдельно от `NEWS_NOT_PUBLISHED`: там попытка прокомментировать черновик,
   * здесь — попытка править архивную запись или опубликовать ее повторно.
   */
  NEWS_POST_STATE_INVALID: 'NEWS_POST_STATE_INVALID',
  /** Диалог не найден (в том числе если он невидим вызывающему). */
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  /** Сообщение не найдено или уже удалено. */
  MESSAGE_NOT_FOUND: 'MESSAGE_NOT_FOUND',
  /**
   * Диалог не той природы, чем требует запрос.
   *
   * Например, попытка прочитать состав группового чата у личного диалога или
   * создать групповой чат без группы.
   */
  CONVERSATION_TYPE_INVALID: 'CONVERSATION_TYPE_INVALID',
  /** Личный диалог требует ровно одного собеседника. */
  CONVERSATION_PARTICIPANTS_INVALID: 'CONVERSATION_PARTICIPANTS_INVALID',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

/** Тело ошибки, отдаваемое клиентам. */
export interface ApiErrorBody {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
  /** correlation id запроса, для сопоставления с логами. */
  requestId?: string;
}

/** Соответствие доменных кодов HTTP-статусам. */
export const API_ERROR_HTTP_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,

  EMAIL_ALREADY_EXISTS: 409,
  INVITE_INVALID: 400,
  INVITE_EXPIRED: 400,
  INVITE_ALREADY_USED: 409,
  INVITE_EMAIL_MISMATCH: 403,
  USER_BLOCKED: 403,
  PERMISSION_UNKNOWN: 400,
  PERMISSION_GRANTED_BY_ROLE: 409,
  PERMISSION_IS_ROLE_BASED: 409,
  PERMISSION_NOT_GRANTED: 404,
  PERMISSION_EXPIRES_IN_PAST: 400,

  BRANCH_ARCHIVED: 409,
  BRANCH_NOT_FOUND: 404,
  HALL_NOT_IN_BRANCH: 400,
  HALL_NOT_FOUND: 404,
  HALL_NAME_TAKEN: 409,
  HALL_HAS_SESSIONS: 409,
  TRAINER_ALREADY_ASSIGNED: 409,
  TRAINER_NOT_FOUND: 404,
  TRAINER_ACCOUNT_NOT_LINKED: 404,
  TRAINER_ACCOUNT_ROLE_INVALID: 409,
  TRAINER_ACCOUNT_NOT_ACTIVE: 409,
  ACCOUNT_ALREADY_LINKED: 409,
  ACCOUNT_NOT_LINKED: 404,

  ATHLETE_ARCHIVED: 409,
  ATHLETE_NOT_FOUND: 404,
  ACTIVE_MEMBERSHIP_EXISTS: 409,

  GROUP_NOT_FOUND: 404,
  GROUP_ARCHIVED: 409,
  GROUP_TRAINER_ALREADY_ASSIGNED: 409,
  GROUP_TRAINER_NOT_ASSIGNED: 404,
  GROUP_BRANCH_ALREADY_LINKED: 409,
  GROUP_BRANCH_NOT_LINKED: 404,
  ATHLETE_ALREADY_MEMBER: 409,
  MEMBERSHIP_NOT_FOUND: 404,

  SCHEDULE_TEMPLATE_NOT_FOUND: 404,
  SCHEDULE_TEMPLATE_EXISTS: 409,
  SCHEDULE_TEMPLATE_ALREADY_PUBLISHED: 409,
  SCHEDULE_TEMPLATE_PUBLISHED: 409,
  SCHEDULE_TEMPLATE_EMPTY: 409,
  /** Слот пересекается с другим слотом того же шаблона. */
  SLOT_OVERLAPS_TEMPLATE: 409,
  SCHEDULE_SLOT_INVALID_TIME: 400,
  TRAINING_SESSION_NOT_FOUND: 404,
  TRAINING_SESSION_CANCELLED: 409,
  TRAINING_SESSION_CONFLICT: 409,
  TRAINING_SESSION_DUPLICATE: 409,
  TRAINER_BUSY: 409,
  HALL_BUSY: 409,
  SESSION_ALREADY_STARTED: 409,

  // attendance
  ATTENDANCE_ALREADY_RECORDED: 409,
  ATTENDANCE_NOT_FOUND: 404,
  ATHLETE_NOT_IN_GROUP: 409,
  PLANNED_ABSENCE_EXISTS: 409,
  PLANNED_ABSENCE_NOT_FOUND: 404,

  MEMBERSHIP_PERIOD_LOCKED: 409,
  MEMBERSHIP_PERIOD_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  PAYMENT_AMOUNT_INVALID: 400,
  REFUND_NOT_FOUND: 404,
  REFUND_EXCEEDS_PAYMENT: 400,
  REFUND_PAYMENT_MISMATCH: 400,
  PAYMENT_HAS_REFUNDS: 409,
  FREEZE_ALREADY_OPEN: 409,
  FREEZE_PERIOD_INVALID: 400,
  FREEZE_NOT_OPEN: 409,

  CONVERSATION_ACCESS_DENIED: 403,
  NEWS_NOT_PUBLISHED: 409,
  NEWS_POST_NOT_FOUND: 404,
  NEWS_COMMENT_NOT_FOUND: 404,
  NEWS_POST_STATE_INVALID: 409,
  CONVERSATION_NOT_FOUND: 404,
  MESSAGE_NOT_FOUND: 404,
  CONVERSATION_TYPE_INVALID: 400,
  CONVERSATION_PARTICIPANTS_INVALID: 400,
};
