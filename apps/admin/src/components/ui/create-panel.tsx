'use client';

import { useState } from 'react';

import { Drawer } from '@/components/ui/drawer';

/**
 * Универсальная панель создания (#134).
 *
 * По DESIGN.md форма создания не занимает постоянное место рядом со списком:
 * она открывается кнопкой, а список остаётся основным содержимым. Один
 * компонент на все разделы, чтобы поведение и вид кнопки не расходились.
 */
export function CreatePanel({
  title,
  description,
  buttonLabel,
  children,
}: {
  title: string;
  description?: string;
  buttonLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-[13.5px] font-medium text-white hover:opacity-90 md:h-10"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {buttonLabel}
      </button>

      <Drawer
        open={open}
        title={title}
        description={description}
        onClose={() => setOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-control border border-line bg-white text-[13.5px] text-ink-soft hover:bg-canvas"
          >
            Закрыть
          </button>
        }
      >
        {children}
      </Drawer>
    </>
  );
}
