/**
 * Аттестации спортсмена (карате: кю и даны).
 *
 * Пояс в карточке — текущее состояние; аттестация — событие с датой и ступенью.
 * Одно без другого отвечает на половину вопроса: «какой пояс» без «какая ступень
 * и когда получена».
 *
 * С ADR-0012 ступень — единая запись каталога (`kyu-0`…`dan-10`), и пояс из неё
 * выводится. `stageKind`/`stageNumber`/`beltGrade` остались полями контракта на
 * переходный период: старые клиенты их присылают, API сводит всё к ступени.
 */

import { findRank, type RankView } from './ranks';

/** Вид ступени: кю до чёрного пояса, дан — после. */
export const CertificationStageKind = {
  KYU: 'KYU',
  DAN: 'DAN',
} as const;
export type CertificationStageKind =
  (typeof CertificationStageKind)[keyof typeof CertificationStageKind];

/** Границы ступеней: и кю, и дан идут от 1 до 10. */
export const MIN_STAGE = 1;
export const MAX_STAGE = 10;

/** Аттестация в карточке спортсмена. */
export interface CertificationView {
  id: string;
  athleteId: string;
  /** Дата аттестации, YYYY-MM-DD. */
  certifiedOn: string;
  /** Присвоенная ступень из каталога (ADR-0012). */
  rank: string | null;
  /** Подпись ступени: «8 кю» или «2 дан». */
  rankLabel: string | null;
  /** Пояс, выведенный из ступени. */
  beltGrade: string;
  /** Устаревшие поля: остаются для клиентов, не перешедших на `rank`. */
  stageKind: CertificationStageKind;
  stageNumber: number;
  /** Подпись ступени: «8 кю» или «2 дан». Совпадает с `rankLabel`. */
  stageLabel: string;
  note: string | null;
  createdBy: { id: string; email: string } | null;
  createdAt: string;
}

/**
 * Новая аттестация.
 *
 * `rank` — предпочтительный способ. Если его нет, ступень выводится из
 * `stageKind`/`stageNumber`; `beltGrade` при этом не источни истины, а проверка:
 * несовпадение пояса со ступенью — ошибка ввода, а не повод молча переписать.
 */
export interface CreateCertificationInput {
  certifiedOn: string;
  rank?: string;
  beltGrade?: string;
  stageKind?: CertificationStageKind;
  stageNumber?: number;
  note?: string | null;
}

/** Подпись ступени. */
export function certificationStageLabel(
  kind: CertificationStageKind,
  number: number,
): string {
  return `${number} ${kind === CertificationStageKind.KYU ? 'кю' : 'дан'}`;
}

/** Ступень аттестации: из `rank`, иначе из вида и номера. */
export function certificationRank(certification: {
  rank?: string | null;
  stageKind?: CertificationStageKind | string | null;
  stageNumber?: number | null;
}): RankView | undefined {
  if (certification.rank) {
    return findRank(certification.rank);
  }

  if (certification.stageKind && typeof certification.stageNumber === 'number') {
    const kind = String(certification.stageKind).toUpperCase();
    return findRank(`${kind === 'DAN' ? 'dan' : 'kyu'}-${certification.stageNumber}`);
  }

  return undefined;
}
