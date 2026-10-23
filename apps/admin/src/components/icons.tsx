/**
 * Иконки разделов.
 *
 * Набор своих SVG вместо библиотеки: нужны 12 иконок одного размера, а
 * зависимость ради них добавила бы пакет и вес в бандл.
 */
export type IconName =
  | 'home'
  | 'athletes'
  | 'groups'
  | 'trainers'
  | 'halls'
  | 'schedule'
  | 'attendance'
  | 'finance'
  | 'news'
  | 'users'
  | 'chats'
  | 'bell'
  | 'search'
  | 'plus'
  | 'logout'
  | 'chevron'
  | 'gift'
  | 'settings'
  | 'shield'
  | 'belt'
  | 'sliders'
  | 'lock'
  | 'clock';

const PATHS: Record<IconName, string> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5',
  athletes:
    'M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19M9 9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 8h4M20 6v4',
  groups:
    'M9 19v-1a3 3 0 0 0-3-3H4a3 3 0 0 0-3 3v1M5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM17 19v-1a3 3 0 0 0-3-3h-2a3 3 0 0 0-3 3v1M13 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  trainers:
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-1a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v1',
  halls: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-5h6v5',
  schedule:
    'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM8 12h3v3H8z',
  attendance: 'M9 12.5 11.5 15 16 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  finance: 'M3 7h18v12H3zM3 7l2-3h14l2 3M9 13h6',
  news: 'M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5ZM8 9h7M8 13h7M8 17h4',
  users:
    'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1',
  chats: 'M21 12a8 8 0 0 1-8 8H7l-4 2v-5a8 8 0 1 1 18-5Z',
  bell: 'M18 9a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7ZM10.5 20a2 2 0 0 0 3 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  logout: 'M15 17l5-5-5-5M20 12H9M12 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h7',
  chevron: 'm9 6 6 6-6 6',
  gift: 'M3 11h18v9H3zM3 7h18v4H3zM12 7v13M12 7c-2 0-3.5-1-3.5-2.5S10 2 12 7ZM12 7c2 0 3.5-1 3.5-2.5S14 2 12 7Z',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3ZM9 12l2 2 4-4',
  belt: 'M4 9h16v6H4zM9 9v6M15 9v6M12 9v6',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 4v6M8 14v6',
  lock: 'M6 11h12v10H6zM9 11V8a3 3 0 0 1 6 0v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
};

export function Icon({
  name,
  size = 18,
  className = '',
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
