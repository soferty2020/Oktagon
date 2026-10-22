/**
 * Графики дашборда.
 *
 * Нарисованы вручную в SVG, а не библиотекой: нужны три простых формы
 * (линия, столбцы, кольцо), а chart-библиотека добавила бы сотни килобайт и
 * клиентский JS туда, где достаточно серверного рендера.
 */

/** Мини-график тренда: линия без осей. */
export function Sparkline({
  points,
  width = 120,
  height = 36,
}: {
  points: number[];
  width?: number;
  height?: number;
}) {
  if (points.length < 2) {
    return <div className="h-9" />;
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = width / (points.length - 1);

  const coords = points.map((value, index) => {
    const x = index * step;
    // Инвертированные координаты: в SVG ось Y растет вниз.
    const y = height - ((value - min) / span) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Столбчатая диаграмма с подписями и значениями. */
export function BarChart({
  items,
  height = 180,
  format = (value: number) => `${value}%`,
}: {
  items: readonly { label: string; value: number }[];
  height?: number;
  format?: (value: number) => string;
}) {
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-muted">Нет данных за период</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="flex items-stretch gap-3" style={{ height }}>
      {items.map((item) => {
        // Минимальная высота 2%: нулевой столбец не должен выглядеть как
        // отсутствие данных.
        const ratio = Math.max(item.value / max, 0.02);
        return (
          <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[11px] font-medium text-ink">{format(item.value)}</span>
            <div className="flex h-full w-full items-end">
              <div
                className="w-full rounded-t-md bg-accent"
                style={{ height: `${ratio * 100}%`, opacity: item.value === 0 ? 0.25 : 1 }}
              />
            </div>
            <span className="truncate text-[11px] text-muted">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Кольцевая диаграмма с легендой. */
export function Donut({
  segments,
  size = 168,
  thickness = 20,
  centerLabel,
  centerValue,
}: {
  segments: readonly { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={thickness}
          />
          {total > 0
            ? segments.map((segment) => {
                const length = (segment.value / total) * circumference;
                const dash = `${length} ${circumference - length}`;
                const element = (
                  <circle
                    key={segment.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={thickness}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                    strokeLinecap="butt"
                  />
                );
                offset += length;
                return element;
              })
            : null}
        </g>
        {centerValue ? (
          <>
            <text
              x="50%"
              y="47%"
              textAnchor="middle"
              className="fill-ink"
              style={{ fontSize: 18, fontWeight: 700 }}
            >
              {centerValue}
            </text>
            <text
              x="50%"
              y="60%"
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 11 }}
            >
              {centerLabel}
            </text>
          </>
        ) : null}
      </svg>

      <ul className="space-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: segment.color }}
              aria-hidden="true"
            />
            <span className="text-muted">{segment.label}</span>
            <span className="font-medium text-ink">{segment.value.toLocaleString('ru-RU')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
