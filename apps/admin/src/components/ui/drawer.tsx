'use client';

import { useEffect } from 'react';

/**
 * Панель создания и правки.
 *
 * Десктоп: выезжает справа на 420 px с затемнением 32 % (#0E0E10). Мобильный:
 * форма на весь экран — уменьшать панель до ширины телефона не нужно. Закрытие
 * по Esc и по фону; если есть несохранённые изменения, закрытие спрашивает
 * подтверждение, чтобы введённые данные не пропадали молча.
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
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      if (dirty && !window.confirm('Закрыть без сохранения? Изменения будут потеряны.')) {
        return;
      }
      onClose();
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, dirty, onClose]);

  function requestClose() {
    if (dirty && !window.confirm('Закрыть без сохранения? Изменения будут потеряны.')) {
      return;
    }
    onClose();
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
            className="ml-auto flex h-8 w-8 flex-none items-center justify-center rounded-control border border-line text-muted transition-colors hover:bg-canvas hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" role="img">`n              <title>Закрыть</title>
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
