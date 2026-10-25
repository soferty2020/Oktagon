'use client';

import Image from 'next/image';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon } from '@/components/icons';

/**
 * Мобильное меню админки.
 *
 * Сайдбар скрыт на узких экранах (`hidden md:flex`), и до этого на телефоне не
 * было навигации вообще: оставалась только шапка с крошками. Здесь та же
 * навигация выезжает поверх страницы; ссылки ведут те же, что и в сайдбаре.
 *
 * Панель закрывается по клику на ссылку и по затемнению: на телефоне ожидание
 * отдельного «крестика» раздражает. `aria-expanded` и роль диалога нужны
 * скринридеру, `overflow-hidden` на body — чтобы фон не прокручивался под меню.
 */
export function MobileNav({
  items,
}: {
  items: readonly { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-control text-ink transition hover:bg-canvas md:hidden"
        aria-label="Открыть меню"
        aria-expanded={open}
      >
        <Icon name="menu" size={20} />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/40"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          />

          <div
            className="absolute inset-y-0 left-0 flex w-[264px] flex-col bg-ink"
            role="dialog"
            aria-modal="true"
            aria-label="Разделы"
          >
            <div className="flex items-center justify-between px-5 py-5">
              <Image
                src="/brand/octagon-logo.png"
                alt="OCTAGON — каратэ-клуб"
            width={1100}
            height={307}
                className="h-8 w-auto"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-white/70 transition hover:text-white"
              >
                Закрыть
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 pb-6">
              {items.map((item) => {
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={
                      active
                        ? 'mb-1 block rounded-control border-l-2 border-accent bg-white/10 px-4 py-2.5 text-sm font-medium text-white'
                        : 'mb-1 block rounded-control border-l-2 border-transparent px-4 py-2.5 text-sm text-white/70 transition hover:bg-white/5'
                    }
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
