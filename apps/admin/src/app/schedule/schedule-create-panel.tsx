'use client';

import { useState } from 'react';

import { Drawer } from '@/components/ui/drawer';
import { CreateTemplateForm } from './schedule-forms';

/**
 * Создание квартального расписания в панели (#UAT п.3).
 *
 * Раньше форма всегда занимала четверть первого экрана, и на телефоне до
 * календаря приходилось прокручивать форму и KPI. Теперь форма открывается
 * кнопкой, а календарь остаётся основным содержимым.
 */
export function ScheduleCreatePanel({
  groups,
  defaultQuarter,
  defaultYear,
}: {
  groups: { id: string; name: string; hallName: string | null }[];
  defaultQuarter: number;
  defaultYear: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-[13.5px] font-medium text-white hover:opacity-90 md:h-10"
      >
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Квартальное расписание
      </button>

      <Drawer
        open={open}
        title="Создать квартальное расписание"
        description="Занятия создаются по выбранной группе на квартал."
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
        <CreateTemplateForm groups={groups} defaultQuarter={defaultQuarter} defaultYear={defaultYear} inPanel />
      </Drawer>
    </>
  );
}
