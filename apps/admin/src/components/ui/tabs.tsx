'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type TabItem = {
  href: string;
  label: string;
};

/**
 * Вкладки карточки.
 *
 * На мобильном прокручиваются горизонтально и не обрезаются без возможности
 * навигации: у края видна тень-подсказка, что дальше есть пункты. Активная
 * вкладка подчёркнута акцентом; повтор данных между шапкой и вкладками запрещён.
 */
export function Tabs({ items, ariaLabel }: { items: readonly TabItem[]; ariaLabel?: string }) {
  const pathname = usePathname();

  return (
    <div className="relative">
      <nav
        aria-label={ariaLabel ?? 'Разделы карточки'}
        className="flex gap-5 overflow-x-auto border-b border-line [-ms-overflow-style:none] [scrollbar-width:thin]"
      >
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'flex-none border-b-2 border-accent py-2.5 text-[13px] font-medium text-ink'
                  : 'flex-none border-b-2 border-transparent py-2.5 text-[13px] text-muted transition-colors hover:text-ink'
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {/* Подсказка, что вкладки продолжаются вправо: без неё последняя вкладка
          выглядит обрезанной, и непонятно, что список прокручивается. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-white via-white/80 to-transparent sm:hidden"
      />
    </div>
  );
}
