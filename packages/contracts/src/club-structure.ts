/**
 * Контракт структуры клуба: залы и тренеры (#64, #69, ADR-0016).
 *
 * Филиал упразднён: клуб делится по адресам, где проходят тренировки, а адрес —
 * свойство зала. Внутри зала — группы.
 */

/** `GET /api/v1/halls`. */
export interface HallView {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  capacity: number | null;
  isActive: boolean;
}

/** `GET /api/v1/halls/{id}` — зал вместе с группами. */
export interface HallDetails extends HallView {
  groups: { id: string; name: string }[];
}

/** `GET /api/v1/trainers`. */
export interface TrainerView {
  id: string;
  /** Аккаунт тренера, если он может входить в систему. */
  userId: string | null;
  /** «Фамилия Имя» — собирается на сервере, чтобы списки не расходились. */
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
}

export interface CreateHallInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  capacity?: number | null;
}

export interface UpdateHallInput {
  name?: string;
  address?: string | null;
  phone?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

export interface CreateTrainerInput {
  firstName: string;
  lastName: string;
  phone?: string | null;
  bio?: string | null;
  /** Существующий аккаунт: логин тренеру не обязателен (docs/04-roles-permissions.md). */
  userId?: string | null;
}

export interface UpdateTrainerInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
}

/**
 * Связывание профиля тренера с аккаунтом.
 *
 * Отдельная операция, а не поле в `UpdateTrainerInput`: привязка даёт человеку
 * доступ к системе (чаты групп, занятия, контакты родителей), поэтому требует
 * права на управление пользователями. Правка карточки — только `branches.manage`.
 *
 * Поле одно, и оно обязательно: «отвязать» — это отдельная операция со своим
 * смыслом, а не пустое значение поля. Так случайная отправка формы без выбора
 * аккаунта не снимает доступ молча.
 */
export interface LinkTrainerAccountInput {
  userId: string;
}

/**
 * Права, которыми управляются справочники клуба.
 *
 * Имена прав исторические (`branches.*`), хотя филиалов больше нет: переименование
 * затронуло бы миграции прав и выданные пользователям разрешения. Смысл прежний —
 * управление площадками клуба и профилями тренеров.
 */
export const TRAINER_MANAGE_PERMISSIONS = ['users.manage', 'branches.manage'] as const;
