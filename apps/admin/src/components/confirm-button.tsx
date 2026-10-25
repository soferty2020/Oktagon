'use client';

import { useRef, useState } from 'react';

import { secondaryButtonClass } from '@/components/ui';

/**
 * Кнопка опасного действия с подтверждением.
 *
 * Заменяет `confirm()`: браузерный диалог нельзя оформить, он блокирует вкладку и
 * выглядит чужим на фоне остального интерфейса. Здесь — модалка в стиле макета
 * (`state-cancel-confirm`): заголовок, пояснение с последствиями, «Оставить» и
 * красная кнопка действия.
 *
 * Кнопка остаётся `type="button"`: подтверждение вызывает `requestSubmit()` у
 * формы, в которой она стоит. Так действие по-прежнему уходит в серверный action,
 * но только после согласия.
 */
export function ConfirmButton({
  confirmTitle,
  confirmText,
  confirmLabel,
  className,
  children,
}: {
  confirmTitle: string;
  confirmText: string;
  confirmLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const confirm = () => {
    setOpen(false);
    buttonRef.current?.form?.requestSubmit();
  };

  return (
    <>
      <button ref={buttonRef} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-lg">
            <h2 id="confirm-title" className="text-lg font-semibold text-ink">
              {confirmTitle}
            </h2>
            <p className="mt-2 text-sm text-muted">{confirmText}</p>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setOpen(false)}
              >
                Оставить
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-control bg-danger px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
                onClick={confirm}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
