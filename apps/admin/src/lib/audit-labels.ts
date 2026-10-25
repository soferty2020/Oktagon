/**
 * Человекочитаемые названия действий и сущностей журнала.
 *
 * В API и базе коды технические (`athlete.certified`, `MembershipPeriod`): по ним
 * фильтруют и их нельзя менять. Но в интерфейсе администратор должен видеть
 * «Аттестация спортсмена», а не `athlete.certified`.
 *
 * Неизвестный код возвращается как есть: новый код в API не должен исчезнуть из
 * журнала только потому, что для него ещё нет перевода.
 */
const ACTIONS: Record<string, string> = {
  // Аутентификация и доступ
  'auth.login_succeeded': 'Вход выполнен',
  'auth.login_failed': 'Неудачная попытка входа',
  'auth.logout': 'Выход',
  'auth.token_refreshed': 'Обновление сессии',
  'auth.token_reuse_detected': 'Повторное использование токена',
  'auth.invite_accepted': 'Приглашение принято',

  // Пользователи и права
  'user.invited': 'Пользователь приглашён',
  'user.updated': 'Пользователь изменён',
  'user.blocked': 'Пользователь заблокирован',
  'user.unblocked': 'Пользователь разблокирован',
  'user.archived': 'Пользователь архивирован',
  'permission.granted': 'Право выдано',
  'permission.revoked': 'Право отозвано',

  // Структура клуба
  'branch.created': 'Филиал создан',
  'branch.updated': 'Филиал изменён',
  'branch.archived': 'Филиал архивирован',
  'hall.created': 'Зал создан',
  'hall.updated': 'Зал изменён',
  'hall.archived': 'Зал архивирован',
  'trainer.created': 'Тренер создан',
  'trainer.updated': 'Тренер изменён',
  'trainer.archived': 'Тренер архивирован',

  // Спортсмены и группы
  'athlete.created': 'Спортсмен создан',
  'athlete.updated': 'Спортсмен изменён',
  'athlete.archived': 'Спортсмен архивирован',
  'athlete.certified': 'Аттестация спортсмена',
  'athlete.certification_cancelled': 'Аттестация отменена',
  'athlete.account_linked': 'Аккаунт привязан',
  'athlete.account_unlinked': 'Аккаунт отвязан',
  'athlete.links_viewed': 'Просмотр контактов спортсмена',
  'group.created': 'Группа создана',
  'group.updated': 'Группа изменена',
  'group.archived': 'Группа архивирована',
  'group.branch_linked': 'Филиал привязан к группе',
  'group.branch_unlinked': 'Филиал отвязан от группы',
  'group.trainer_assigned': 'Тренер назначен',
  'group.trainer_unassigned': 'Тренер снят',
  'group.membership_added': 'Спортсмен зачислен в группу',
  'group.membership_ended': 'Спортсмен выбыл из группы',

  // Расписание
  'schedule.template_created': 'Шаблон расписания создан',
  'schedule.template_updated': 'Шаблон расписания изменён',
  'schedule.template_published': 'Шаблон расписания опубликован',
  'schedule.template_archived': 'Шаблон расписания архивирован',
  'schedule.slot_added': 'Слот добавлен',
  'schedule.slot_updated': 'Слот изменён',
  'schedule.slot_removed': 'Слот удалён',
  'schedule.sessions_generated': 'Занятия сгенерированы',
  'schedule.session_created': 'Занятие создано',
  'schedule.session_moved': 'Занятие перенесено',
  'schedule.session_cancelled': 'Занятие отменено',
  'schedule.session_trainer_changed': 'Сменён тренер занятия',
  'schedule.session_location_changed': 'Сменён зал занятия',

  // Посещаемость
  'attendance.marked': 'Посещаемость отмечена',
  'attendance.updated': 'Посещаемость изменена',
  'attendance.planned_absence_reported': 'Сообщено о планируемом отсутствии',
  'attendance.planned_absence_cancelled': 'Планируемое отсутствие отменено',

  // Финансы
  'finance.period_created': 'Расчётный период создан',
  'finance.period_updated': 'Расчётный период изменён',
  'finance.payment_recorded': 'Оплата внесена',
  'finance.payment_updated': 'Оплата изменена',
  'finance.payment_voided': 'Оплата отменена',
  'finance.payment_refunded': 'Возврат средств',
  'finance.payment_refund_voided': 'Возврат отменён',
  'finance.period_marked_fully_paid': 'Отмечена полная оплата',
  'finance.period_fully_paid_unmarked': 'Отметка полной оплаты снята',
  'freeze.created': 'Заморозка открыта',
  'freeze.updated': 'Заморозка изменена',
  'freeze.closed': 'Заморозка завершена',

  // Новости и чаты
  'news.published': 'Новость опубликована',
  'news.updated': 'Новость изменена',
  'news.archived': 'Новость архивирована',
  'news.comment_deleted': 'Комментарий удалён',
  'chat.conversation_created': 'Диалог создан',
  'chat.member_added': 'Участник добавлен в диалог',
  'chat.member_removed': 'Участник удалён из диалога',
  'chat.message_deleted': 'Сообщение удалено',

  // Настройки
  'settings.club_updated': 'Профиль клуба изменён',
  'settings.debt_rules_updated': 'Правила задолженности изменены',
  'settings.club_viewed': 'Профиль клуба просмотрен',
};

const ENTITIES: Record<string, string> = {
  User: 'Пользователь',
  UserPermission: 'Право пользователя',
  UserInvite: 'Приглашение',
  RefreshToken: 'Сессия',
  Branch: 'Филиал',
  Hall: 'Зал',
  TrainerProfile: 'Тренер',
  Athlete: 'Спортсмен',
  Certification: 'Аттестация',
  UserAthlete: 'Связь аккаунта',
  Group: 'Группа',
  GroupBranch: 'Филиал группы',
  GroupTrainer: 'Тренер группы',
  GroupMembership: 'Состав группы',
  ScheduleTemplate: 'Шаблон расписания',
  TrainingSession: 'Занятие',
  Attendance: 'Посещаемость',
  PlannedAbsence: 'Планируемое отсутствие',
  MembershipPeriod: 'Расчётный период',
  PaymentTransaction: 'Оплата',
  FreezePeriod: 'Заморозка',
  NewsPost: 'Новость',
  NewsComment: 'Комментарий',
  Conversation: 'Диалог',
  Message: 'Сообщение',
  ClubProfile: 'Профиль клуба',
  DebtRule: 'Правила задолженности',
};

/** Название действия для интерфейса. */
export function auditActionLabel(action: string): string {
  return ACTIONS[action] ?? action;
}

/** Название сущности для интерфейса. */
export function auditEntityLabel(entity: string): string {
  return ENTITIES[entity] ?? entity;
}
