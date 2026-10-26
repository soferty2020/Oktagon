/**
 * Единый справочник ступеней кю/дан (ADR-0012, #30).
 *
 * Спортивная ступень однозначно определяет пояс: в киокушине кю и дан — это и
 * есть пояс, а не отдельный атрибут. Раньше пояс и ступень хранились двумя
 * независимыми полями, и можно было сохранить «синий пояс, 10 кю».
 *
 * Набор **фиксирован**: изменение — правка кода и ревью, а не настройка
 * (BR-015). Порядок задан явно: перестановка соседних записей меняет правило.
 *
 * Источник соответствий: kyokushinprofi.com, «Пояса кёкусинкай и их
 * последовательность» (утверждено владельцем в #30).
 */
import { BeltGrade } from './belt-grades';

/** Вид ступени: ученическая (кю) или мастерская (дан). */
export const RankKind = {
  KYU: 'KYU',
  DAN: 'DAN',
} as const;

export type RankKind = (typeof RankKind)[keyof typeof RankKind];

/** Ступень с поясом, который из неё следует. */
export interface RankView {
  /** Стабильный идентификатор для БД: `kyu-0`, `kyu-10`, `dan-1`. */
  id: string;
  kind: RankKind;
  /** Номер внутри вида: 0–10 для кю, 1–10 для дан. */
  number: number;
  /** Порядок от младшей ступени к старшей. */
  order: number;
  /** Подпись для интерфейса: «10 кю», «1 дан». */
  label: string;
  /** Пояс, который соответствует ступени. */
  belt: BeltGrade;
  /** Отображаемый пояс: «Оранжевый с синей полоской». */
  beltLabel: string;
  /** Цвет основы пояса. */
  beltColor: string;
  /** Цвет полоски; `null` у поясов без полоски. */
  stripeColor: string | null;
}

/**
 * Кю от 0 до 10 включительно.
 *
 * 0 кю — начальное состояние без экзамена: белый пояс у нового спортсмена.
 * Поэтому нумерация идёт вниз: 10 кю младше 1 кю, а порядок в справочнике
 * обратный номеру.
 */
const KYU_BELTS: readonly { number: number; belt: BeltGrade }[] = [
  { number: 0, belt: BeltGrade.WHITE },
  { number: 10, belt: BeltGrade.ORANGE },
  { number: 9, belt: BeltGrade.ORANGE_BLUE_STRIPE },
  { number: 8, belt: BeltGrade.BLUE },
  { number: 7, belt: BeltGrade.BLUE_YELLOW_STRIPE },
  { number: 6, belt: BeltGrade.YELLOW },
  { number: 5, belt: BeltGrade.YELLOW_GREEN_STRIPE },
  { number: 4, belt: BeltGrade.GREEN },
  { number: 3, belt: BeltGrade.GREEN_BROWN_STRIPE },
  { number: 2, belt: BeltGrade.BROWN },
  { number: 1, belt: BeltGrade.BROWN_GOLD_STRIPE },
];

/** Дан-ступени: 1–10, чёрный пояс, различаются номером. */
const DAN_COUNT = 10;

const BELT_INFO: Readonly<Record<BeltGrade, { label: string; color: string; stripe: string | null }>> = {
  [BeltGrade.WHITE]: { label: 'Белый', color: '#FFFFFF', stripe: null },
  [BeltGrade.ORANGE]: { label: 'Оранжевый', color: '#FF7A00', stripe: null },
  [BeltGrade.ORANGE_BLUE_STRIPE]: {
    label: 'Оранжевый с синей полоской',
    color: '#FF7A00',
    stripe: '#1E4FA3',
  },
  [BeltGrade.BLUE]: { label: 'Синий', color: '#1E4FA3', stripe: null },
  [BeltGrade.BLUE_YELLOW_STRIPE]: {
    label: 'Синий с жёлтой полоской',
    color: '#1E4FA3',
    stripe: '#FFD400',
  },
  [BeltGrade.YELLOW]: { label: 'Жёлтый', color: '#FFD400', stripe: null },
  [BeltGrade.YELLOW_GREEN_STRIPE]: {
    label: 'Жёлтый с зелёной полоской',
    color: '#FFD400',
    stripe: '#2E9E5B',
  },
  [BeltGrade.GREEN]: { label: 'Зелёный', color: '#2E9E5B', stripe: null },
  [BeltGrade.GREEN_BROWN_STRIPE]: {
    label: 'Зелёный с коричневой полоской',
    color: '#2E9E5B',
    stripe: '#6B4A2B',
  },
  [BeltGrade.BROWN]: { label: 'Коричневый', color: '#6B4A2B', stripe: null },
  [BeltGrade.BROWN_GOLD_STRIPE]: {
    label: 'Коричневый с золотой полоской',
    color: '#6B4A2B',
    stripe: '#C9A227',
  },
  [BeltGrade.BLACK]: { label: 'Чёрный', color: '#111114', stripe: null },
};

/** Утверждённый набор ступеней: 0–10 кю, затем 1–10 дан. */
export const RANKS: readonly RankView[] = [
  ...KYU_BELTS.map((entry, index) => ({
    id: `kyu-${entry.number}`,
    kind: RankKind.KYU,
    number: entry.number,
    order: index,
    label: `${entry.number} кю`,
    belt: entry.belt,
    beltLabel: BELT_INFO[entry.belt].label,
    beltColor: BELT_INFO[entry.belt].color,
    stripeColor: BELT_INFO[entry.belt].stripe,
  })),
  ...Array.from({ length: DAN_COUNT }, (_, index) => {
    const number = index + 1;

    return {
      id: `dan-${number}`,
      kind: RankKind.DAN,
      number,
      order: KYU_BELTS.length + index,
      label: `${number} дан`,
      belt: BeltGrade.BLACK,
      beltLabel: BELT_INFO[BeltGrade.BLACK].label,
      beltColor: BELT_INFO[BeltGrade.BLACK].color,
      stripeColor: null,
    };
  }),
];

/** Начальная ступень нового спортсмена: белый пояс без экзамена. */
export const INITIAL_RANK_ID = 'kyu-0';

/** Ступень по идентификатору; `undefined`, если такого нет в справочнике. */
export function findRank(id: string | null | undefined): RankView | undefined {
  if (!id) {
    return undefined;
  }

  return RANKS.find((rank) => rank.id === id);
}

/** Ступень по виду и номеру — для миграции старых записей. */
export function findRankByStage(kind: string, number: number): RankView | undefined {
  const normalized = kind.trim().toUpperCase();
  if (normalized !== RankKind.KYU && normalized !== RankKind.DAN) {
    return undefined;
  }

  return findRank(`${normalized === RankKind.KYU ? 'kyu' : 'dan'}-${number}`);
}

/** Подпись ступени; для неизвестного идентификатора возвращается сам идентификатор. */
export function rankLabel(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }

  return findRank(id)?.label ?? id;
}

/**
 * Пояс, который следует из ступени.
 *
 * Обратной функции нет: десять данов соответствуют одному чёрному поясу, и
 * «пояс → ступень» неоднозначно по определению.
 */
export function beltForRank(id: string | null | undefined): BeltGrade | undefined {
  return findRank(id)?.belt;
}

/**
 * Ступень из входных данных: приоритет у `rank`, иначе — из вида и номера.
 *
 * Нужна на переходный период: новые клиенты присылают `rank`, старые —
 * `stageKind`/`stageNumber`. Оба варианта сводятся к одной ступени, и дальше
 * работает только она.
 */
export function resolveRank(input: {
  rank?: string | null;
  stageKind?: string | null;
  stageNumber?: number | null;
}): RankView | undefined {
  if (input.rank) {
    return findRank(input.rank);
  }

  if (input.stageKind && typeof input.stageNumber === 'number') {
    return findRankByStage(input.stageKind, input.stageNumber);
  }

  return undefined;
}