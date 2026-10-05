/**
 * Контракт списка пользователей (docs/09-api.md, ADR-0006).
 *
 * В каталоге прав есть только `users.manage`: отдельного права на просмотр
 * списка нет, поэтому список доступен тому, кто управляет пользователями.
 */

import type { UserRole, UserStatus } from './domain';
import type { PageMeta } from './transport';

/** Пользователь в списке админки. */
export interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  /** Доступ ко всем группам, а не только к назначенным. */
  scopeAllGroups: boolean;
  createdAt: string;
}

export interface ListUsersQuery {
  role?: UserRole;
  status?: UserStatus;
  /** Поиск по email, фамилии или имени. */
  search?: string;
  page?: number;
  perPage?: number;
}

export interface PaginatedUsers {
  items: UserView[];
  meta: PageMeta;
}
