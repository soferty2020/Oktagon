import { PERMISSION_CODES } from '@octagon/contracts';

/**
 * Каталог прав для интерфейса.
 *
 * Источник — `@octagon/contracts`, тот же список, что засеян в БД
 * (`packages/contracts/src/domain.ts`). Дублировать его в админке нельзя: при
 * добавлении права в контракт интерфейс обязан узнать о нем автоматически.
 */
export const PERMISSIONS: readonly string[] = PERMISSION_CODES;

/** Короткое описание права для подписи в интерфейсе. */
export function describePermission(code: string): string {
  const known: Record<string, string> = {
    'athletes.view': 'Просмотр спортсменов',
    'athletes.edit': 'Изменение спортсменов',
    'athletes.contacts.view': 'Просмотр контактов спортсменов',
    'groups.view': 'Просмотр групп',
    'groups.edit': 'Изменение групп',
    'attendance.view': 'Просмотр посещаемости',
    'attendance.edit': 'Отметка посещаемости',
    'schedule.view': 'Просмотр расписания',
    'schedule.edit': 'Изменение расписания',
    'schedule.cancel': 'Отмена занятий',
    'schedule.change_trainer': 'Замена тренера в занятии',
    'schedule.change_location': 'Перенос занятия в другой зал',
    'payments.view': 'Просмотр оплат (финансы)',
    'payments.edit': 'Изменение оплат (финансы)',
    'freezes.view': 'Просмотр заморозок (финансы)',
    'freezes.edit': 'Изменение заморозок (финансы)',
    'news.create': 'Создание новостей',
    'news.edit': 'Изменение новостей',
    'news.delete': 'Удаление новостей',
    'news.moderate': 'Модерация новостей',
    'chat.use': 'Чат',
    'branches.view': 'Просмотр филиалов',
    'branches.manage': 'Управление филиалами и залами',
    'users.manage': 'Управление пользователями',
    'permissions.manage': 'Управление правами',
    'analytics.view': 'Аналитика',
  };

  return known[code] ?? code;
}
