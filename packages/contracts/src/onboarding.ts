/**
 * Онбординг родителей (ADR-0015).
 *
 * Два пути привязки: код от тренера (быстро) и заявка с подтверждением
 * администратором (когда кода нет). До привязки родитель не видит ни одного
 * спортсмена — только общие разделы клуба.
 */

/** Регистрация родителя: аккаунт создаётся сразу активным, без детей. */
export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

/** Код привязки, выданный тренером или администратором. Показывается один раз. */
export interface AthleteLinkCodeIssued {
  code: string;
  expiresAt: string;
  athleteId: string;
}

export type LinkRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Заявка на привязку: что родитель рассказал про ребёнка. */
export interface LinkRequestView {
  id: string;
  status: LinkRequestStatus;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  phone: string | null;
  /** Заполнено после подтверждения. */
  athleteId: string | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface CreateLinkRequestInput {
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  phone?: string | null;
}

/** Кандидат для администратора: карточка, похожая на описание в заявке. */
export interface LinkRequestCandidate {
  athleteId: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  groupName: string | null;
}
