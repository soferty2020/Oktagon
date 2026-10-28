'use client';

import { usePathname } from 'next/navigation';

/**
 * Хлебные крошки в шапке: «OCTAGON / Раздел».
 *
 * Раньше здесь был заголовок раздела — и он дублировал заголовок страницы,
 * который выводится в контенте (`PageHeader`). Две одинаковые надписи на одном
 * экране: «Тренеры» в шапке и «Тренеры» ниже. По макету в шапке место крошкам,
 * а заголовок остаётся один — в контенте.
 *
 * Раздел вычисляется из адреса, а не передается каждой страницей: иначе название
 * пришлось бы дублировать в 29 файлах и оно разошлось бы с навигацией.
 */
const SECTIONS: readonly { prefix: string; title: string }[] = [
  { prefix: '/halls', title: 'Залы' },
  { prefix: '/groups', title: 'Группы' },
  { prefix: '/athletes', title: 'Спортсмены' },
  { prefix: '/trainers', title: 'Тренеры' },
  { prefix: '/schedule', title: 'Расписание' },
  { prefix: '/attendance', title: 'Посещаемость' },
  { prefix: '/finance', title: 'Финансы' },
  { prefix: '/news', title: 'Новости' },
  { prefix: '/chats', title: 'Чаты' },
  { prefix: '/users', title: 'Пользователи' },
  { prefix: '/invite', title: 'Приглашение' },
  { prefix: '/settings', title: 'Настройки' },
];

export function Breadcrumbs({ fallback = 'Обзор' }: { fallback?: string }) {
  const pathname = usePathname();
  const match = SECTIONS.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  );

  return (
    <nav aria-label="Хлебные крошки" className="flex items-center gap-2 text-sm">
      <span className="font-semibold tracking-[0.18em] text-ink">OCTAGON</span>
      <span aria-hidden="true" className="text-muted">
        /
      </span>
      <span className="text-muted">{match?.title ?? fallback}</span>
    </nav>
  );
}
