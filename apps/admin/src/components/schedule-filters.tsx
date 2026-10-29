'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

interface Option {
  id: string;
  name: string;
}

/**
 * Фильтры расписания: зал, тренер, группа (#75).
 *
 * Клиентский компонент ради одного: смена селекта сразу перестраивает календарь.
 * Без него пришлось бы добавлять кнопку «Показать», которой в макете нет.
 */
export function ScheduleFilters({
  halls,
  trainers,
  groups,
  value,
}: {
  halls: Option[];
  trainers: Option[];
  groups: Option[];
  value: { hallId?: string; trainerId?: string; groupId?: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const update = (key: 'hallId' | 'trainerId' | 'groupId', next: string) => {
    const params = new URLSearchParams(window.location.search);
    if (next) {
      params.set(key, next);
    } else {
      params.delete(key);
    }
    // Смена фильтра не должна оставлять пользователя в чужом месяце.
    params.delete('anchor');
    startTransition(() => router.push(`/schedule?${params.toString()}`));
  };

  return (
    <div className={`flex flex-wrap items-end gap-3 ${pending ? 'opacity-70' : ''}`}>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Зал
        <select
          className="h-9 min-w-[150px] rounded-md border border-line bg-white px-2 text-sm text-ink"
          defaultValue={value.hallId ?? ''}
          onChange={(event) => update('hallId', event.target.value)}
        >
          <option value="">Все залы</option>
          {halls.map((hall) => (
            <option key={hall.id} value={hall.id}>
              {hall.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Тренер
        <select
          className="h-9 min-w-[150px] rounded-md border border-line bg-white px-2 text-sm text-ink"
          defaultValue={value.trainerId ?? ''}
          onChange={(event) => update('trainerId', event.target.value)}
        >
          <option value="">Все тренеры</option>
          {trainers.map((trainer) => (
            <option key={trainer.id} value={trainer.id}>
              {trainer.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Группа
        <select
          className="h-9 min-w-[150px] rounded-md border border-line bg-white px-2 text-sm text-ink"
          defaultValue={value.groupId ?? ''}
          onChange={(event) => update('groupId', event.target.value)}
        >
          <option value="">Все группы</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
