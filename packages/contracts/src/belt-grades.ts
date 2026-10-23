/**
 * Справочник поясов клуба (K3, BR-015).
 *
 * Набор **фиксирован**: CRUD через админку запрещён, и API не предоставляет
 * эндпоинтов создания, изменения или удаления. Изменение набора — это изменение
 * кода и ревью, а не настройка.
 *
 * Порядок и названия согласованы с клубом (киокушин, с полосками). Порядок задан
 * явно: он определяет ступень, и перестановка двух соседних значений — это уже
 * другое правило.
 *
 * Кю и даны здесь не хранятся: это атрибут аттестаций, а не пояса. Дата
 * присвоения хранится у спортсмена, но не входит в справочник.
 */

/** Коды поясов. Код стабилен: он попадает в БД, поэтому названия меняются отдельно. */
export const BeltGrade = {
  WHITE: 'WHITE',
  ORANGE: 'ORANGE',
  /** Оранжевый с синей полоской. */
  ORANGE_BLUE_STRIPE: 'ORANGE_BLUE_STRIPE',
  BLUE: 'BLUE',
  /** Синий с жёлтой полоской. */
  BLUE_YELLOW_STRIPE: 'BLUE_YELLOW_STRIPE',
  YELLOW: 'YELLOW',
  /** Жёлтый с зелёной полоской. */
  YELLOW_GREEN_STRIPE: 'YELLOW_GREEN_STRIPE',
  GREEN: 'GREEN',
  /** Зелёный с коричневой полоской. */
  GREEN_BROWN_STRIPE: 'GREEN_BROWN_STRIPE',
  BROWN: 'BROWN',
  /** Коричневый с золотой полоской. */
  BROWN_GOLD_STRIPE: 'BROWN_GOLD_STRIPE',
  BLACK: 'BLACK',
} as const;

export type BeltGrade = (typeof BeltGrade)[keyof typeof BeltGrade];

/** Пояс для отображения: код, подпись, ступень и цвета. */
export interface BeltGradeView {
  code: BeltGrade;
  /** Подпись для интерфейса. */
  label: string;
  /** Ступень: 1 — младший пояс. Порядок утверждён клубом. */
  order: number;
  /** Цвет основы в hex: нужен, чтобы пояс показывался, а не только назывался. */
  color: string;
  /** Цвет полоски; `null` у поясов без полоски. */
  stripeColor: string | null;
}

/**
 * Утверждённый набор поясов.
 *
 * Белый пояс — это осознанно присвоенный пояс, а не отсутствие данных: у
 * спортсмена без пояса поле пустое и показывается «не указан».
 */
export const BELT_GRADES: readonly BeltGradeView[] = [
  { code: BeltGrade.WHITE, label: 'Белый', order: 1, color: '#FFFFFF', stripeColor: null },
  { code: BeltGrade.ORANGE, label: 'Оранжевый', order: 2, color: '#FF7A00', stripeColor: null },
  {
    code: BeltGrade.ORANGE_BLUE_STRIPE,
    label: 'Оранжевый с синей полоской',
    order: 3,
    color: '#FF7A00',
    stripeColor: '#1E4FA3',
  },
  { code: BeltGrade.BLUE, label: 'Синий', order: 4, color: '#1E4FA3', stripeColor: null },
  {
    code: BeltGrade.BLUE_YELLOW_STRIPE,
    label: 'Синий с жёлтой полоской',
    order: 5,
    color: '#1E4FA3',
    stripeColor: '#FFD400',
  },
  { code: BeltGrade.YELLOW, label: 'Жёлтый', order: 6, color: '#FFD400', stripeColor: null },
  {
    code: BeltGrade.YELLOW_GREEN_STRIPE,
    label: 'Жёлтый с зелёной полоской',
    order: 7,
    color: '#FFD400',
    stripeColor: '#2E9E5B',
  },
  { code: BeltGrade.GREEN, label: 'Зелёный', order: 8, color: '#2E9E5B', stripeColor: null },
  {
    code: BeltGrade.GREEN_BROWN_STRIPE,
    label: 'Зелёный с коричневой полоской',
    order: 9,
    color: '#2E9E5B',
    stripeColor: '#6B4A2B',
  },
  { code: BeltGrade.BROWN, label: 'Коричневый', order: 10, color: '#6B4A2B', stripeColor: null },
  {
    code: BeltGrade.BROWN_GOLD_STRIPE,
    label: 'Коричневый с золотой полоской',
    order: 11,
    color: '#6B4A2B',
    stripeColor: '#C9A227',
  },
  { code: BeltGrade.BLACK, label: 'Чёрный', order: 12, color: '#111114', stripeColor: null },
];

/** Пояс по коду; `undefined`, если кода нет в справочнике. */
export function findBeltGrade(code: string | null | undefined): BeltGradeView | undefined {
  if (!code) {
    return undefined;
  }
  return BELT_GRADES.find((grade) => grade.code === code);
}

/** Подпись пояса; для неизвестного кода возвращается сам код. */
export function beltGradeLabel(code: string | null | undefined): string | null {
  if (!code) {
    return null;
  }
  return findBeltGrade(code)?.label ?? code;
}
