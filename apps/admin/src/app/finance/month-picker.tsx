import { CURRENT_YEAR } from './finance-shared';
import { MONTH_NAMES } from '@/lib/money';

const inputClass =
  'rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500';

/**
 * Выбор расчетного месяца.
 *
 * Обычная GET-форма, а не клиентский компонент: выбранный месяц должен попадать
 * в адрес страницы, чтобы ссылку на конкретный месяц можно было передать
 * коллеге. Тот же прием используется в остальных фильтрах админки.
 */
export function MonthPicker({ year, month }: { year: number; month: number }) {
  const years: number[] = [];
  for (let value = CURRENT_YEAR - 3; value <= CURRENT_YEAR + 1; value += 1) {
    years.push(value);
  }

  return (
    <form action="/finance" className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Месяц
        <select name="month" defaultValue={String(month)} className={inputClass}>
          {MONTH_NAMES.map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
        Год
        <select name="year" defaultValue={String(year)} className={inputClass}>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
      >
        Показать
      </button>
    </form>
  );
}
