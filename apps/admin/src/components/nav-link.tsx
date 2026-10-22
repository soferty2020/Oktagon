'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from '@/components/icons';

/**
 * Пункт боковой навигации с подсветкой активного раздела.
 *
 * Отдельный клиентский компонент, потому что активный раздел знает только
 * браузер: в серверном компоненте `usePathname` недоступен. Оранжевая заливка
 * активного пункта — по макету.
 */
export function NavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: IconName;
}) {
  const pathname = usePathname();
  const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={
        isActive
          ? 'flex items-center gap-3 rounded-card bg-accent px-3 py-2.5 text-sm font-medium text-white'
          : 'flex items-center gap-3 rounded-card px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white'
      }
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </Link>
  );
}
