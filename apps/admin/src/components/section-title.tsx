'use client';

import { usePathname } from 'next/navigation';

/**
 * Заголовок текущего раздела в шапке.
 *
 * Вычисляется из адреса, а не передается каждой страницей: иначе название
 * пришлось бы дублировать в 15 файлах, и оно разошлось бы с навигацией.
 */
const TITLES: readonly { prefix: string; title: string }[] = [
  { prefix: '/branches', title: 'Филиалы и залы' },
  { prefix: '/groups', title: 'Группы' },
  { prefix: '/athletes', title: 'Спортсмены' },
  { prefix: '/trainers', title: 'Тренеры' },
  { prefix: '/schedule', title: 'Расписание' },
  { prefix: '/attendance', title: 'Посещаемость' },
  { prefix: '/finance', title: 'Абонементы и оплаты' },
  { prefix: '/news', title: 'Новости' },
  { prefix: '/chats', title: 'Чаты' },
  { prefix: '/users', title: 'Пользователи' },
  { prefix: '/invite', title: 'Приглашение' },
  { prefix: '/settings', title: 'Настройки' },
];

export function SectionTitle({ fallback = 'Главная' }: { fallback?: string }) {
  const pathname = usePathname();
  const match = TITLES.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`));

  return <h1 className="text-lg font-semibold text-ink">{match?.title ?? fallback}</h1>;
}
