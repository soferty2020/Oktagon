import { formatAmount } from '@/lib/money';

/** Точка динамики из API. */
export interface DynamicsPoint {
  year: number;
  month: number;
  received: number;
  refunded: number;
  revenue: number;
  debtors: number;
  debtorsWithoutExpected: number;
  debt: number | null;
}

const MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/**
 * Динамика за несколько месяцев.
 *
 * Выручка и долг — разные величины: первая по датам движений, вторая по
 * расчётному месяцу. Поэтому они в отдельных столбцах, а не в одной сумме.
 */
export function DynamicsTable({ points }: { points: DynamicsPoint[] }) {
  if (points.length === 0) {
    return null;
  }

  // Масштаб полосок — максимальная выручка за период.
  const maxRevenue = points.reduce((max, point) => Math.max(max, point.revenue), 0);

  return (
    <section className="rounded-card border border-line bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">Динамика за {points.length} мес.</h2>
      <p className="mt-1 text-xs text-muted">
        Выручка — по датам движений, задолженность — по расчётному месяцу.
      </p>

      <table className="table-base mt-3">
        <thead>
          <tr>
            <th>Месяц</th>
            <th>Выручка</th>
            <th>Возвраты</th>
            <th>Должники</th>
            <th>Долг</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={`${point.year}-${point.month}`}>
              <td className="whitespace-nowrap">
                {MONTHS[point.month - 1]} {point.year}
              </td>
              <td>
                <div className="flex items-center gap-2">
                  <span className="w-20 text-right">{formatAmount(point.revenue)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{
                        width: `${maxRevenue > 0 ? Math.round((point.revenue / maxRevenue) * 100) : 0}%`,
                      }}
                    />
                  </span>
                </div>
              </td>
              <td className="text-muted">{point.refunded > 0 ? formatAmount(point.refunded) : '—'}</td>
              <td>
                {point.debtors}
                {point.debtorsWithoutExpected > 0 ? (
                  <span className="ml-1 text-xs text-muted">
                    (без суммы: {point.debtorsWithoutExpected})
                  </span>
                ) : null}
              </td>
              <td>
                {point.debt === null ? (
                  <span className="text-xs text-muted">не считается</span>
                ) : (
                  formatAmount(point.debt)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
