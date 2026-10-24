'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Пункт боковой навигации.
 *
 * По макету пункты идут без иконок: подписи читаются быстрее, а иконки в
 * двадцати пунктах превращались в шум. Активный раздел — светлая плашка на
 * тёмном сайдбаре с оранжевой полосой слева; заливка акцентом осталась в
 * мобильном приложении, где пунктов мало и нужен сильный акцент.
 *
 * Клиентский компонент: активный раздел знает только браузер, в серверном
 * `usePathname` недоступен.
 */
export function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        isActive
          ? 'flex items-center rounded-md border-l-2 border-accent bg-white/10 px-3 py-2.5 text-sm font-medium text-white'
          : 'flex items-center rounded-md border-l-2 border-transparent px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white'
      }
    >
      {label}
    </Link>
  );
}
