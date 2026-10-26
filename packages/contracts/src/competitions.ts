/**
 * Соревнования (#36–#38).
 *
 * Три уровня, потому что правила разные:
 * - турнир — мероприятие с датой, местом и статусом;
 * - участник турнира — спортсмен, у которого одна оплата на весь турнир;
 * - участие — выступление в дисциплине и категории со своим результатом.
 *
 * Кумитэ и ката одного спортсмена — отдельные участия с отдельными результатами,
 * но оплата у них общая: платят за турнир, а не за дисциплину.
 */

/** Статус турнира. Переходы те же, что у мероприятий аттестаций. */
export const CompetitionStatus = {
  DRAFT: 'DRAFT',
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
} as const;

export type CompetitionStatus = (typeof CompetitionStatus)[keyof typeof CompetitionStatus];

export const COMPETITION_TRANSITIONS: Readonly<
  Record<CompetitionStatus, readonly CompetitionStatus[]>
> = {
  DRAFT: [CompetitionStatus.PLANNED, CompetitionStatus.CANCELLED],
  PLANNED: [CompetitionStatus.IN_PROGRESS, CompetitionStatus.CANCELLED],
  IN_PROGRESS: [CompetitionStatus.COMPLETED, CompetitionStatus.CANCELLED],
  COMPLETED: [CompetitionStatus.PUBLISHED, CompetitionStatus.CANCELLED],
  // Опубликованное не отменяется: результаты уже видны родителям.
  PUBLISHED: [],
  CANCELLED: [],
};

export function canTransitionCompetition(from: CompetitionStatus, to: CompetitionStatus): boolean {
  return COMPETITION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Уровень турнира: от клубного до международного. */
export const CompetitionLevel = {
  CLUB: 'CLUB',
  CITY: 'CITY',
  REGIONAL: 'REGIONAL',
  NATIONAL: 'NATIONAL',
  INTERNATIONAL: 'INTERNATIONAL',
} as const;

export type CompetitionLevel = (typeof CompetitionLevel)[keyof typeof CompetitionLevel];

/** Дисциплина. */
export const CompetitionDiscipline = {
  KUMITE: 'KUMITE',
  KATA: 'KATA',
} as const;

export type CompetitionDiscipline =
  (typeof CompetitionDiscipline)[keyof typeof CompetitionDiscipline];

/** Турнир в списке и карточке. */
export interface CompetitionView {
  id: string;
  title: string;
  startsAt: string;
  /** Дата окончания; у однодневных турниров совпадает с началом. */
  endsAt: string | null;
  location: string | null;
  organizer: string | null;
  level: CompetitionLevel;
  description: string | null;
  status: CompetitionStatus;
  participantsCount: number;
  createdBy: { id: string; email: string } | null;
  publishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompetitionInput {
  title: string;
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  organizer?: string | null;
  level?: CompetitionLevel;
  description?: string | null;
}

export interface UpdateCompetitionInput {
  title?: string;
  startsAt?: string;
  endsAt?: string | null;
  location?: string | null;
  organizer?: string | null;
  level?: CompetitionLevel;
  description?: string | null;
}

/** Итог участия. PLACED требует места; NO_SHOW не может иметь медаль. */
export const CompetitionEntryResult = {
  PENDING: 'PENDING',
  PLACED: 'PLACED',
  PARTICIPATED: 'PARTICIPATED',
  ELIMINATED: 'ELIMINATED',
  DISQUALIFIED: 'DISQUALIFIED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type CompetitionEntryResult =
  (typeof CompetitionEntryResult)[keyof typeof CompetitionEntryResult];

/** Медаль независима от места: бывает третье место без медали и наоборот. */
export const CompetitionMedal = {
  NONE: 'NONE',
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  BRONZE: 'BRONZE',
} as const;
export type CompetitionMedal = (typeof CompetitionMedal)[keyof typeof CompetitionMedal];

/** Результат встречи кумитэ. */
export const CompetitionMatchResult = {
  WIN: 'WIN',
  LOSS: 'LOSS',
} as const;
export type CompetitionMatchResult =
  (typeof CompetitionMatchResult)[keyof typeof CompetitionMatchResult];