import { BeltGrade } from './belt-grades';
import { beltForRank, findRank, findRankByStage, INITIAL_RANK_ID, RANKS, rankLabel } from './ranks';

/**
 * Справочник ступеней (ADR-0012).
 *
 * Проверяем не «список существует», а правила: ступень определяет пояс,
 * 0 кю — начальное состояние, даны различаются номером при одном чёрном поясе,
 * порядок строго возрастает.
 */
describe('RankCatalog', () => {
  it('новый спортсмен начинает с 0 кю и белого пояса', () => {
    const initial = findRank(INITIAL_RANK_ID);

    expect(initial).toBeDefined();
    expect(initial?.kind).toBe('KYU');
    expect(initial?.number).toBe(0);
    expect(initial?.belt).toBe(BeltGrade.WHITE);
    expect(initial?.order).toBe(0);
  });

  it('первая аттестация на 10 кю даёт оранжевый пояс', () => {
    expect(beltForRank('kyu-10')).toBe(BeltGrade.ORANGE);
  });

  it('кю идут от 0 до 10 и каждому соответствует свой пояс', () => {
    const kyu = RANKS.filter((rank) => rank.kind === 'KYU');

    expect(kyu).toHaveLength(11);
    expect(new Set(kyu.map((rank) => rank.belt)).size).toBe(11);
  });

  it('1 кю — коричневый с золотой полоской', () => {
    const rank = findRank('kyu-1');

    expect(rank?.belt).toBe(BeltGrade.BROWN_GOLD_STRIPE);
    expect(rank?.stripeColor).not.toBeNull();
  });

  it('даны 1–10 имеют чёрный пояс и различаются номером', () => {
    const dans = RANKS.filter((rank) => rank.kind === 'DAN');

    expect(dans).toHaveLength(10);
    expect(dans.every((rank) => rank.belt === BeltGrade.BLACK)).toBe(true);
    expect(dans.map((rank) => rank.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('порядок строго возрастает от 0 кю к 10 дан', () => {
    const orders = RANKS.map((rank) => rank.order);

    expect(orders).toEqual([...orders].sort((left, right) => left - right));
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('идентификаторы уникальны', () => {
    expect(new Set(RANKS.map((rank) => rank.id)).size).toBe(RANKS.length);
  });

  it('находит ступень по виду и номеру для миграции', () => {
    expect(findRankByStage('KYU', 10)?.id).toBe('kyu-10');
    expect(findRankByStage('kyu', 0)?.id).toBe('kyu-0');
    expect(findRankByStage('DAN', 3)?.id).toBe('dan-3');
  });

  it('неизвестная ступень не превращается в догадку', () => {
    expect(findRank('kyu-11')).toBeUndefined();
    expect(findRank('dan-0')).toBeUndefined();
    expect(findRank(null)).toBeUndefined();
    expect(findRankByStage('KYU', 11)).toBeUndefined();
    expect(findRankByStage('MASTER', 1)).toBeUndefined();
  });

  it('подпись ступени читаема и не подменяется кодом', () => {
    expect(rankLabel('kyu-0')).toBe('0 кю');
    expect(rankLabel('dan-1')).toBe('1 дан');
    expect(rankLabel('unknown-rank')).toBe('unknown-rank');
  });
});
