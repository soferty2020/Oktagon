'use client';

import { useActionState } from 'react';

import {
  addSlotAction,
  cancelSessionAction,
  createSessionAction,
  createTemplateAction,
  generateSessionsAction,
  moveSessionAction,
  type ScheduleFormState,
} from '@/app/schedule/actions';

const initialState: ScheduleFormState = {};

const inputClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-slate-600';
const buttonClass =
  'rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60';

const WEEKDAYS = [
  { value: 'MONDAY', label: 'Понедельник' },
  { value: 'TUESDAY', label: 'Вторник' },
  { value: 'WEDNESDAY', label: 'Среда' },
  { value: 'THURSDAY', label: 'Четверг' },
  { value: 'FRIDAY', label: 'Пятница' },
  { value: 'SATURDAY', label: 'Суббота' },
  { value: 'SUNDAY', label: 'Воскресенье' },
] as const;

function StateMessages({ state }: { state: ScheduleFormState }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </>
  );
}

/** Создание шаблона расписания на квартал. */
export function CreateTemplateForm({
  groups,
  defaultYear,
  defaultQuarter,
}: {
  groups: { id: string; name: string }[];
  defaultYear: number;
  defaultQuarter: number;
}) {
  const [state, formAction, pending] = useActionState(createTemplateAction, initialState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5"
    >
      <h2 className="text-sm font-semibold text-slate-900">Расписание на квартал</h2>

      <label className={labelClass}>
        Группа
        <select name="groupId" required className={inputClass} defaultValue="">
          <option value="" disabled>
            выберите группу
          </option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-3">
        <label className={`${labelClass} flex-1`}>
          Год
          <input
            type="number"
            name="year"
            required
            min={2020}
            max={2100}
            defaultValue={defaultYear}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} flex-1`}>
          Квартал
          <select name="quarter" defaultValue={String(defaultQuarter)} className={inputClass}>
            {[1, 2, 3, 4].map((quarter) => (
              <option key={quarter} value={quarter}>
                {quarter}
              </option>
            ))}
          </select>
        </label>
      </div>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : 'Создать расписание'}
      </button>
      <p className="text-xs text-slate-500">
        Расписание на квартал у группы одно: повторное создание будет отклонено.
      </p>
    </form>
  );
}

/** Добавление слота: день недели, локальное время клуба, зал и тренер. */
export function AddSlotForm({
  templateId,
  halls,
  trainers,
}: {
  templateId: string;
  halls: { id: string; name: string }[];
  trainers: { id: string; displayName: string }[];
}) {
  const [state, formAction, pending] = useActionState(addSlotAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="templateId" value={templateId} />

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={labelClass}>
          День недели
          <select name="weekday" required className={inputClass} defaultValue="">
            <option value="" disabled>
              выберите день
            </option>
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Начало
          <input
            type="time"
            name="startTime"
            required
            defaultValue="18:00"
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Окончание
          <input type="time" name="endTime" required defaultValue="19:30" className={inputClass} />
        </label>
        <label className={labelClass}>
          Зал
          <select name="hallId" className={inputClass} defaultValue="">
            <option value="">не назначен</option>
            {halls.map((hall) => (
              <option key={hall.id} value={hall.id}>
                {hall.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Тренер
          <select name="trainerId" className={inputClass} defaultValue="">
            <option value="">не назначен</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.displayName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-slate-500">
        Время указывается по часовому поясу клуба. Слоты внутри одного расписания не должны
        пересекаться.
      </p>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? '…' : 'Добавить слот'}
      </button>
    </form>
  );
}

/**
 * Материализация занятий.
 *
 * Пересоздание удаляет только будущие занятия: прошедшие остаются, иначе
 * потерялась бы посещаемость.
 */
export function GenerateForm({ templateId }: { templateId: string }) {
  const [state, formAction, pending] = useActionState(generateSessionsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="templateId" value={templateId} />

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" name="regenerate" />
        пересоздать занятия квартала (удаляются только будущие)
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? 'Генерация…' : 'Создать занятия из расписания'}
      </button>
    </form>
  );
}

/** Перенос занятия: шаблон при этом не меняется (BR-009). */
export function MoveSessionForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(moveSessionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />

      <div className="grid gap-2 sm:grid-cols-3">
        <label className={labelClass}>
          Новая дата
          <input type="date" name="date" required className={inputClass} />
        </label>
        <label className={labelClass}>
          Начало
          <input type="time" name="startTime" required className={inputClass} />
        </label>
        <label className={labelClass}>
          Окончание
          <input type="time" name="endTime" required className={inputClass} />
        </label>
      </div>

      <label className={labelClass}>
        Причина переноса
        <input name="reason" required maxLength={500} className={inputClass} />
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? '…' : 'Перенести занятие'}
      </button>
      <p className="text-xs text-slate-500">
        Квартальное расписание не изменится: правка касается только этого занятия.
      </p>
    </form>
  );
}

/** Отмена занятия с обязательной причиной. */
export function CancelSessionForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(cancelSessionAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="sessionId" value={sessionId} />

      <label className={labelClass}>
        Причина отмены
        <input name="reason" required maxLength={500} className={inputClass} />
      </label>

      <StateMessages state={state} />

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? '…' : 'Отменить занятие'}
      </button>
    </form>
  );
}

/**
 * Занятие вручную: разовое или задним числом.
 *
 * Нужно клубам, которые начали работать до внедрения системы: иначе прошедшие
 * занятия не попадают в посещаемость, а разовые занятия вне расписания не
 * существуют вовсе. Причина обязательна — по ней в карточке видно, откуда
 * занятие взялось.
 *
 * Зал и тренер необязательны: занятие могло быть без назначенного зала, а
 * тренера могли завести позже. Накладки проверяются только для будущих занятий
 * (в прошлом расписание часто велось иначе), поэтому задним числом можно
 * добавить занятие, пересекающееся с существующим.
 */
export function CreateSessionForm({
  groups,
  halls,
  trainers,
  today,
}: {
  groups: { id: string; name: string }[];
  halls: { id: string; name: string; branchName: string }[];
  trainers: { id: string; name: string }[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createSessionAction, initialState);

  if (groups.length === 0) {
    return (
      <p className="text-xs text-slate-500">
        Сначала создайте группу: занятие всегда принадлежит группе.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>
          Группа
          <select name="groupId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              выберите группу
            </option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Дата
          <input type="date" name="date" required defaultValue={today} className={inputClass} />
        </label>

        <label className={labelClass}>
          Начало
          <input type="time" name="startTime" required className={inputClass} />
        </label>

        <label className={labelClass}>
          Окончание
          <input type="time" name="endTime" required className={inputClass} />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          Зал (необязательно)
          <select name="hallId" defaultValue="" className={inputClass}>
            <option value="">без зала</option>
            {halls.map((hall) => (
              <option key={hall.id} value={hall.id}>
                {hall.branchName} · {hall.name}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Тренер (необязательно)
          <select name="trainerId" defaultValue="" className={inputClass}>
            <option value="">без тренера</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={labelClass}>
        Причина
        <input
          name="reason"
          required
          maxLength={500}
          placeholder="Например: занесение занятий за прошлый месяц"
          className={inputClass}
        />
      </label>

      <p className="text-xs text-slate-500">
        Причина попадет в карточку занятия и в журнал аудита: по ней видно, что занятие добавлено
        вручную, а не пришло из расписания.
      </p>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? 'Добавление…' : 'Добавить занятие'}
      </button>
    </form>
  );
}
