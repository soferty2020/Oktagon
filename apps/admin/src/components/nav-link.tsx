'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from '@/components/icons';

/**
 * Пункт боковой навигации.
 *
 * По утверждённому макету OCTAGON Control 2.0 пункт идёт с контурной иконкой и
 * подписью: набор иконок один на всю админку, поэтому они помогают найти раздел,
 * а не превращаются в шум. Активный раздел — оранжевая заливка с белым текстом;
 * остальные приглушены и подсвечиваются при наведении.
 *
 * Клиентский компонент: активный раздел знает только браузер, в серверном
 * `usePathname` недоступен.
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
          ? 'flex h-[38px] items-center gap-3 rounded-control bg-accent px-3 text-[13px] font-medium text-white'
          : 'flex h-[38px] items-center gap-3 rounded-control px-3 text-[13px] text-white/70 transition-colors hover:bg-white/5 hover:text-white'
      }
    >
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </Link>
  );
}
