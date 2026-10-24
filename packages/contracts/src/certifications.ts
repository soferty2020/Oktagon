/**
 * Аттестации спортсмена (карате: кю и даны).
 *
 * Пояс в карточке — текущее состояние; аттестация — событие с датой и ступенью.
 * Одно без другого отвечает на половину вопроса: «какой пояс» без «какая ступень
 * и когда получена».
 *
 * Ступень хранится числом и видом, а не строкой «8 кю»: по ней сравнивают
 * аттестации между собой, и разбор строки при каждом сравнении был бы лишним.
 */

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
  beltGrade: string;
  stageKind: CertificationStageKind;
  stageNumber: number;
  /** Подпись ступени: «8 кю» или «2 дан». */
  stageLabel: string;
  note: string | null;
  createdBy: { id: string; email: string } | null;
  createdAt: string;
}

/** Новая аттестация: создание меняет текущий пояс спортсмена. */
export interface CreateCertificationInput {
  certifiedOn: string;
  beltGrade: string;
  stageKind: CertificationStageKind;
  stageNumber: number;
  note?: string | null;
}

/** Подпись ступени. */
export function certificationStageLabel(
  kind: CertificationStageKind,
  number: number,
): string {
  return `${number} ${kind === CertificationStageKind.KYU ? 'кю' : 'дан'}`;
}
