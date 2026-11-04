'use client';

import { useEffect, useRef } from 'react';

/**
 * Панель создания и правки.
 *
 * Десктоп: выезжает справа на 420 px с затемнением 32 % (#0E0E10). Мобильный:
 * форма на весь экран — уменьшать панель до ширины телефона не нужно.
 *
 * Поведение диалога: фокус уходит в первое поле панели, Tab не выпускает его в
 * фон, Esc и клик по затемнению закрывают, при закрытии фокус возвращается на
 * элемент, который открыл панель. Если есть несохранённые изменения, закрытие
 * спрашивает подтверждение — иначе введённые данные пропадут молча.
 *
 * Полей не содержит: форма приходит снаружи, компонент отвечает только за
 * поведение панели.
 */
export function Drawer({
  open,
  title,
  description,
  onClose,
  footer,
  dirty = false,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  footer: React.ReactNode;
  dirty?: boolean;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Свежие значения без перезапуска эффекта: иначе фокус сбрасывался бы при
  // каждом изменении dirty, то есть при каждом вводе в форме.
  const dirtyRef = useRef(dirty);
  const onCloseRef = useRef(onClose);
  dirtyRef.current = dirty;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      return;
    }

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusable = panel
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(
            'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], button:not([disabled])',
          ),
        ).filter((element) => element.offsetParent !== null)
      : [];

    // Начальный фокус — первое поле: кнопка закрытия первой в DOM, но ввод
    // с неё начинать бессмысленно.
    const firstField = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    );
    (firstField ?? focusable[0])?.focus();

    const askAndClose = () => {
      if (dirtyRef.current && !window.confirm('Закрыть без сохранения? Изменения будут потеряны.')) {
        return;
      }
      onCloseRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        askAndClose();
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
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  function requestClose() {
    if (dirtyRef.current && !window.confirm('Закрыть без сохранения? Изменения будут потеряны.')) {
      return;
    }
    onCloseRef.current();
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Закрыть панель"
        onClick={requestClose}
        className="absolute inset-0 bg-ink/32"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-0 flex flex-col bg-white sm:inset-y-0 sm:left-auto sm:w-[420px] sm:shadow-[-24px_0_60px_rgba(14,14,16,0.12)]"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Закрыть"
            className="ml-auto flex h-11 w-11 flex-none items-center justify-center rounded-control border border-line text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <title>Закрыть</title>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <div className="flex gap-2.5 border-t border-line px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}
