'use client';

import Image from 'next/image';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Icon, type IconName } from '@/components/icons';

/**
 * Мобильное меню админки.
 *
 * Сайдбар скрыт на узких экранах (`hidden md:flex`), и до этого на телефоне не
 * было навигации вообще: оставалась только шапка с крошками. Здесь та же
 * навигация выезжает поверх страницы; ссылки ведут те же, что и в сайдбаре.
 *
 * Поведение диалога: Esc закрывает, Tab ходит по пунктам панели и не выпускает
 * фокус в фон, при закрытии фокус возвращается на кнопку «Меню» — иначе после
 * закрытия он остаётся на исчезнувшем элементе, и клавиатурная навигация ломается.
 */
export function MobileNav({
  items,
}: {
  items: readonly { href: string; label: string; icon: IconName }[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const panel = panelRef.current;
    const focusable = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
        ).filter((element) => element.offsetParent !== null)
      : [];

    focusable[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== 'Tab' || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-control border border-line bg-white text-ink transition-colors hover:bg-canvas md:hidden"
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
            ref={panelRef}
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
                className="flex h-11 items-center px-2 text-sm text-white/70 transition-colors hover:text-white"
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
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'mb-1 flex h-11 items-center gap-3 rounded-control bg-accent px-3 text-[13px] font-medium text-white'
                        : 'mb-1 flex h-11 items-center gap-3 rounded-control px-3 text-[13px] text-white/70 transition-colors hover:bg-white/5 hover:text-white'
                    }
                  >
                    <Icon name={item.icon} size={17} />
                    <span>{item.label}</span>
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
