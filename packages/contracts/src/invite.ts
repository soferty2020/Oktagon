/**
 * Контракт приглашений (MVP scope: саморегистрации нет, пользователя
 * приглашает администратор).
 *
 * Провайдер доставки письма еще не выбран (docs/25-open-questions.md), поэтому
 * эндпоинт создания приглашения возвращает `token` один раз: администратор
 * передает его вручную. Ссылку на рассылку добавит отдельный issue, контракт
 * при этом не изменится.
 */

import type { UserRole } from './domain';

export interface UserInviteView {
  id: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
}

/** Ответ `POST /api/v1/users/invites`: токен показывается только здесь. */
export interface UserInviteCreated extends UserInviteView {
  /** Токен приглашения. Передается пользователю и не хранится в открытом виде. */
  token: string;
}
