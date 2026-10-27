/**
 * Иконки карточки спортсмена (#60).
 *
 * Inline SVG, а не библиотека: нужны семь иконок, и тянуть ради них пакет с
 * сотнями — лишний вес в бандле. Контурные, 20×20, наследуют цвет текста.
 *
 * В макете иконок нет — он собран из прямоугольников. Добавлены по просьбе
 * владельца: без них факты в шапке читаются как строки таблицы, а не как
 * показатели профиля.
 */
export type IconName =
  | 'rank'
  | 'belt'
  | 'group'
  | 'trainer'
  | 'branch'
  | 'phone'
  | 'mail'
  | 'calendar'
  | 'pin'
  | 'pencil'
  | 'plus'
  | 'trophy'
  | 'archive'
  | 'dots'
  | 'chevron';

const PATHS: Record<IconName, string> = {
  rank: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9L12 3z',
  belt: 'M4 6h16M4 12h16M4 18h10',
  group: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3 3 0 100-6 3 3 0 000 6zM21 19v-1a4 4 0 00-3-3.9M16 4.1a4 4 0 010 7.8',
  trainer: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4.5 20a7.5 7.5 0 0115 0',
  branch: 'M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6',
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A15 15 0 013 6a2 2 0 012-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  pin: 'M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 8.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5',
  pencil: 'M4 20h4L20 8l-4-4L4 16zM14 6l4 4',
  plus: 'M12 5v14M5 12h14',
  trophy: 'M8 4h8v5a4 4 0 01-8 0zM8 6H5v2a3 3 0 003 3M16 6h3v2a3 3 0 01-3 3M10 17h4v3h-4z',
  archive: 'M3 5h18v4H3zM5 9v10h14V9M9 13h6',
  dots: 'M12 6h.01M12 12h.01M12 18h.01',
  chevron: 'M6 9l6 6 6-6',
};

export function Icon({
  name,
  className = 'h-4 w-4',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.6}
      viewBox="0 0 24 24"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
