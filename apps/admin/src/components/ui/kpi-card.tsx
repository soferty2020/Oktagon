/**
 * KPI-показатель раздела.
 *
 * В Control 2.0 KPI показывается только там, где помогает принять решение
 * (сколько всего спортсменов, сколько без группы). Декоративные показатели и
 * «средние по клубу» запрещены: значение обязано приходить из API, а не
 * считаться на клиенте.
 */
export function KpiCard({
  value,
  label,
  hint,
}: {
  value: number | string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-white px-4 py-3.5">
      <p className="text-[22px] font-bold leading-none text-ink">{value}</p>
      <p className="mt-2 text-xs text-muted">{label}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted/80">{hint}</p> : null}
    </div>
  );
}

/** Ряд KPI: от одного до четырёх показателей. */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </div>
  );
}
