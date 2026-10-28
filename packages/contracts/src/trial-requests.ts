/**
 * Заявки на пробную тренировку (ADR-0013, #25).
 *
 * Заявка — не спортсмен: у звонящего может не быть ни фамилии, ни даты рождения,
 * а заводить карточку на каждого — мусор в справочнике. Превращение в спортсмена
 * остаётся решением тренера.
 */

/** Статус заявки. */
export const TrialRequestStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  TRIAL_SCHEDULED: 'TRIAL_SCHEDULED',
  CONVERTED: 'CONVERTED',
  REJECTED: 'REJECTED',
} as const;

export type TrialRequestStatus = (typeof TrialRequestStatus)[keyof typeof TrialRequestStatus];

/**
 * Финальные статусы.
 *
 * Из них не возвращаются: иначе ломается конверсия — заявка «стала спортсменом»,
 * а потом снова «в работе».
 */
export const FINAL_TRIAL_STATUSES: readonly TrialRequestStatus[] = [
  TrialRequestStatus.CONVERTED,
  TrialRequestStatus.REJECTED,
];

export function isFinalTrialStatus(status: TrialRequestStatus): boolean {
  return FINAL_TRIAL_STATUSES.includes(status);
}

/** Заявка в списке администратора. */
export interface TrialRequestView {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  childName: string | null;
  childAge: number | null;
  comment: string | null;
  status: TrialRequestStatus;
  /** Откуда пришла заявка: сайт, соцсеть, звонок. */
  source: string | null;
  createdAt: string;
  updatedAt: string;
  /** Кто и когда последний раз менял статус. */
  processedAt: string | null;
  processedBy: { id: string; email: string } | null;
  /** Согласие на обработку ПДн (#56, SEC-15): старые заявки его не имеют. */
  consentAcceptedAt: string | null;
  consentVersion: string | null;
}

/** Публичная форма заявки. */
export interface CreateTrialRequestInput {
  name: string;
  phone: string;
  email?: string | null;
  childName?: string | null;
  childAge?: number | null;
  comment?: string | null;
  source?: string | null;
  /** Honeypot: люди его не видят, боты заполняют. */
  website?: string | null;
  /**
   * Согласие на обработку ПДн (#56, SEC-15).
   *
   * Обязательно: без него заявка не принимается, а в карточке нечего показать
   * проверяющему — на каком основании обрабатываются данные ребёнка.
   */
  consent: boolean;
}

/** Смена статуса администратором. */
export interface UpdateTrialRequestInput {
  status?: TrialRequestStatus;
}
