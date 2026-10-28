/**
 * Контракт спортсменов и связей аккаунтов (docs/07-domain-model.md,
 * docs/22-erd.md: Athlete, UserAthlete).
 *
 * Ключевой принцип (docs/00-project-overview.md): аккаунт не равен карточке
 * спортсмена, один аккаунт может быть связан с несколькими спортсменами.
 */

import type { AthleteStatus } from './domain';
import type { BeltGrade } from './belt-grades';

/** Карточка спортсмена для сотрудника: включает контактные данные. */
export interface AthleteView {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  /** Календарная дата без времени (YYYY-MM-DD). */
  birthDate: string | null;
  gender: string;
  status: AthleteStatus;
  /**
   * Текущий пояс (K3). `null` — пояс не присвоен; это не «белый пояс», а
   * отсутствие данных.
   */
  /**
   * Ступень из каталога (ADR-0012): kyu-0…dan-10. Источник истины для пояса.
   * 
ull — миграция не смогла вывести ступень однозначно; требуется решение.
   */
  rank: string | null;
  /** Подпись ступени: «0 кю», «2 дан». */
  rankLabel: string | null;
  /** Белый пояс — значение по умолчанию: поле всегда заполнено. */
  beltGrade: BeltGrade;
  /** Дата присвоения пояса (YYYY-MM-DD); может отсутствовать у старых записей. */
  beltAwardedAt: string | null;
  /** Контакты: только при праве `athletes.contacts.view` (docs/15-security.md). */
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Детали карточки: заметки клуба и связанные аккаунты. */
export interface AthleteDetails extends AthleteView {
  notes: string | null;
  linkedAccounts: Array<{
    userId: string;
    email: string;
    relation: string;
    isPrimary: boolean;
  }>;
  /**
   * Текущая группа, тренер и филиал (#60).
   *
   * `null` — не назначен. Карточка показывает это как empty state, а не
   * придумывает значение: «не в группе» — нормальное состояние новичка.
   */
  group: { id: string; name: string } | null;
  trainer: { id: string; displayName: string } | null;
  hall: { id: string; name: string } | null;
}

export interface CreateAthleteInput {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  birthDate?: string | null;
  gender?: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface UpdateAthleteInput {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  birthDate?: string | null;
  gender?: string;
  /**
   * Ступень из каталога (ADR-0012). Приоритет над `beltGrade`: пояс выводится из
   * неё, а не задаётся отдельно. Менять может только `athletes.edit`.
   */
  rank?: string;
  /**
   * Пояс (K3). Оставлен для совместимости: если ступень не задана, API принимает
   * пояс и выводит ступень только там, где это однозначно (белый → 0 кю).
   */
  beltGrade?: BeltGrade;
  /** Дата присвоения (YYYY-MM-DD); `null` очищает. */
  beltAwardedAt?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  status?: AthleteStatus;
}

/** Связь аккаунта со спортсменом (`POST /athletes/{id}/accounts`). */
export interface LinkAccountInput {
  userId: string;
  /** PARENT, GUARDIAN, SELF. */
  relation?: string;
  isPrimary?: boolean;
}

/**
 * Поля, которые не отдаются без `athletes.contacts.view`.
 *
 * Вынесено в контракт, чтобы фильтрация была одинаковой на backend и в тестах.
 */
export const CONTACT_FIELDS = ['phone', 'email'] as const;

/** Скрывает контакты, если у вызывающего нет соответствующего права. */
export function applyContactsVisibility<T extends { phone: string | null; email: string | null }>(
  athlete: T,
  canViewContacts: boolean,
): T {
  if (canViewContacts) {
    return athlete;
  }
  return { ...athlete, phone: null, email: null };
}
