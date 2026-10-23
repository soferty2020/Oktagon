/**
 * Контракт настроек клуба (K1, docs/26-admin-settings.md).
 *
 * Здесь только безопасные параметры: название, логотип, контакты и часовой пояс.
 * Секреты, подключения к БД, ключи провайдеров и параметры инфраструктуры в
 * админку не попадают и в этот контракт не входят — документ запрещает их
 * сериализовать в API.
 */

/** Профиль клуба, как его видит админка. */
export interface ClubProfileView {
  name: string;
  /** Ссылка на логотип; загрузки файлов в MVP нет. */
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** IANA-имя, например `Asia/Almaty`. */
  timezone: string;
  updatedAt: string;
}

/**
 * Изменение профиля.
 *
 * Все поля необязательны: форма отправляет только измененное, а частичное
 * обновление не должно требовать пересылки всего профиля.
 */
export interface UpdateClubProfileInput {
  name?: string;
  /** `null` очищает поле. */
  logoUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  timezone?: string;
}
