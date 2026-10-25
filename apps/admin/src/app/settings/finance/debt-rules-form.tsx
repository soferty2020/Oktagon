'use client';

import { fieldClass } from '@/components/ui';

import { useActionState } from 'react';

import {
  previewDebtRulesAction,
  saveDebtRulesAction,
  type DebtRulesFormState,
} from './actions';

const initialState: DebtRulesFormState = {};

const inputClass = fieldClass;
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const buttonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60';

/** Значения действующей версии, приходящие с сервера. */
export interface DebtRulesFormValues {
  version: number;
  effectiveFrom: string;
  useFullyPaidMark: boolean;
  noTrainingPolicy: string;
  freezePolicy: string;
  expectedMissing: string;
  partialTolerance:
    | { kind: 'NONE' }
    | { kind: 'FIXED'; amount: number }
    | { kind: 'PERCENT'; percent: number };
  note: string | null;
}

/**
 * Форма правил долга (K5, ADR-0014).
 *
 * Сначала «Проверить»: без предпросмотра не видно, кто станет должником. Только
 * после этого «Сохранить» создает новую версию. Откат — новая версия с прежними
 * значениями: удалять версии нельзя.
 */
export function DebtRulesForm({
  current,
  defaultMonth,
}: {
  current: DebtRulesFormValues;
  defaultMonth: string;
}) {
  const [saveState, saveAction, saving] = useActionState(saveDebtRulesAction, initialState);
  const [previewState, previewAction, previewing] = useActionState(
    previewDebtRulesAction,
    initialState,
  );

  const tolerance = current.partialTolerance;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <form
        action={previewAction}
        className="flex flex-col gap-4 rounded-card border border-line bg-white p-5"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Правило расчета</h2>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
            версия {current.version} · с {current.effectiveFrom.slice(0, 7)}
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="useFullyPaidMark"
            defaultChecked={current.useFullyPaidMark}
            className="size-4"
          />
          Учитывать ручную отметку «полностью оплачен»
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Нет тренировок в месяце
            <select
              name="noTrainingPolicy"
              defaultValue={current.noTrainingPolicy}
              className={inputClass}
            >
              <option value="EXEMPT">не должник</option>
              <option value="DEBTOR">должник</option>
            </select>
          </label>

          <label className={labelClass}>
            Заморозка
            <select name="freezePolicy" defaultValue={current.freezePolicy} className={inputClass}>
              <option value="EXEMPT_MONTH">освобождает от долга</option>
              <option value="NONE">не освобождает</option>
            </select>
          </label>

          <label className={labelClass}>
            Ожидаемая сумма не задана
            <select
              name="expectedMissing"
              defaultValue={current.expectedMissing}
              className={inputClass}
            >
              <option value="DEBTOR">считать должником</option>
              <option value="NOT_DEBTOR">не считать</option>
            </select>
          </label>

          <label className={labelClass}>
            Допустимая недоплата
            <select name="toleranceKind" defaultValue={tolerance.kind} className={inputClass}>
              <option value="NONE">нет</option>
              <option value="FIXED">сумма</option>
              <option value="PERCENT">процент</option>
            </select>
          </label>

          <label className={labelClass}>
            Сумма допуска, ₽
            <input
              type="number"
              name="toleranceAmount"
              min={0}
              step={100}
              defaultValue={tolerance.kind === 'FIXED' ? tolerance.amount : 0}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Процент допуска
            <input
              type="number"
              name="tolerancePercent"
              min={0}
              max={100}
              step={0.5}
              defaultValue={tolerance.kind === 'PERCENT' ? tolerance.percent : 0}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Действует с месяца
            <input
              type="month"
              name="effectiveFrom"
              defaultValue={defaultMonth}
              className={inputClass}
            />
          </label>

          <label className={labelClass}>
            Комментарий
            <input
              name="note"
              maxLength={500}
              defaultValue={current.note ?? ''}
              className={inputClass}
            />
          </label>
        </div>

        {saveState.error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {saveState.error}
          </p>
        ) : null}
        {saveState.success ? (
          <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {saveState.success}
          </p>
        ) : null}
        {previewState.error ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {previewState.error}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={previewing} className={buttonClass}>
            {previewing ? 'Проверка…' : 'Проверить'}
          </button>
          <button
            type="submit"
            formAction={saveAction}
            disabled={saving}
            className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accent disabled:opacity-60"
          >
            {saving ? 'Сохранение…' : 'Сохранить версию'}
          </button>
        </div>
      </form>

      {previewState.preview ? (
        <div className="rounded-card border border-line bg-white p-5">
          <h3 className="text-sm font-semibold text-ink">Что изменится</h3>
          <p className="mt-1 text-xs text-muted">
            Должников: {previewState.preview.debtorsBefore} →{' '}
            <strong>{previewState.preview.debtorsAfter}</strong> · задолженность:{' '}
            {formatMoney(previewState.preview.debtBefore)} →{' '}
            <strong>{formatMoney(previewState.preview.debtAfter)}</strong>
          </p>

          {previewState.preview.changed.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Статусы не изменятся.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {previewState.preview.changed.map((entry) => (
                <li key={entry.athleteId} className="flex justify-between gap-3">
                  <span>{entry.name}</span>
                  <span className="text-muted">
                    {entry.wasDebtor ? 'должник' : 'не должник'} →{' '}
                    {entry.willBeDebtor ? 'должник' : 'не должник'}
                    {entry.outstanding !== null ? ` · ${formatMoney(entry.outstanding)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Сумма в тенге; `null` означает «есть должники без ожидаемой суммы». */
function formatMoney(value: number | null): string {
  if (value === null) {
    return 'есть должники без суммы';
  }
  return `${value.toLocaleString('ru-RU')} ₽`;
}
