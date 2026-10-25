/**
 * Финансовые и посещаемостные блоки дашборда.
 *
 * Раньше здесь были кольцевая диаграмма и столбцы, нарисованные в SVG. После
 * перехода на канон макета они не нужны: финансовая сводка — одна полоса
 * «оплачено против долга», посещаемость — прогресс-бары по строкам. Оба
 * компонента рисуются обычной разметкой, без SVG и без клиентского JS.
 */

/**
 * Прогресс-бары по строкам: дорожка, заливка и процент справа.
 *
 * По макету посещаемость показана именно так, а не столбцами: значение читается
 * сразу, а сравнивать строки удобнее по длине заливки.
 */
export function ProgressList({ items }: { items: readonly { label: string; value: number }[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">Нет данных за период.</p>;
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-4">
          <span className="w-32 shrink-0 truncate text-sm text-ink">{item.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
            <span
              className="block h-full rounded-full bg-accent"
              style={{ width: `${Math.min(Math.max(item.value, 0), 100)}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right text-xs text-muted">{item.value}%</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Полоса «оплачено против задолженности» с суммами и процентами.
 *
 * Заменяет кольцевую диаграмму: на макете финансовая сводка — одна полоса, и
 * двух чисел достаточно, чтобы понять соотношение. Кольцо с тремя сегментами
 * требовало легенды и занимало место.
 */
export function PaidAgainstDebt({
  paid,
  debt,
  paidText,
  debtText,
}: {
  paid: number;
  debt: number;
  paidText: string;
  debtText: string;
}) {
  const total = paid + debt;
  const paidPercent = total === 0 ? 0 : Math.round((paid / total) * 100);
  const debtPercent = total === 0 ? 0 : 100 - paidPercent;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-canvas">
        {total === 0 ? null : (
          <>
            <span className="h-full bg-accent" style={{ width: `${paidPercent}%` }} />
            <span className="h-full bg-danger" style={{ width: `${debtPercent}%` }} />
          </>
        )}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Оплачено</dt>
          <dd className="text-right">
            <span className="font-semibold text-ink">{paidText}</span>
            <span className="ml-2 text-xs text-muted">{paidPercent}%</span>
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted">Задолженность</dt>
          <dd className="text-right">
            <span className={debt > 0 ? 'font-semibold text-danger' : 'font-semibold text-ink'}>
              {debtText}
            </span>
            <span className="ml-2 text-xs text-muted">{debtPercent}%</span>
          </dd>
        </div>
      </dl>
    </div>
  );
}
