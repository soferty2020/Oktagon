'use client';

import { fieldClass } from '@/components/ui';

import { useActionState } from 'react';

import { RANKS, beltGradeLabel } from '@octagon/contracts';

import {
  cancelCertificationAction,
  createCertificationAction,
  type AthleteFormState,
} from './actions';

const initialState: AthleteFormState = {};

const inputClass = fieldClass;
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';

/** Аттестация, пришедшая из API. */
export interface CertificationValues {
  id: string;
  certifiedOn: string;
  beltGrade: string;
  rank: string | null;
  rankLabel: string | null;
  stageKind: string;
  stageNumber: number;
  stageLabel: string;
  note: string | null;
  createdBy: { id: string; email: string } | null;
}

/**
 * Аттестации спортсмена (K8).
 *
 * Пояс в карточке — текущее состояние, здесь — история: когда, на какую ступень
 * и какой пояс. Создание меняет текущий пояс, отмена пересчитывает его по
 * предыдущей аттестации.
 */
export function CertificationsBlock({
  athleteId,
  certifications,
  canEdit,
}: {
  athleteId: string;
  certifications: CertificationValues[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(createCertificationAction, initialState);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="mt-6 rounded-card border border-line bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">Аттестации</h2>
      <p className="mt-1 text-xs text-muted">
        Ступень и пояс, присвоенные на аттестации. Текущий пояс в карточке
        пересчитывается по последней записи.
      </p>

      {certifications.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Аттестаций пока нет.</p>
      ) : (
        <table className="table-base mt-3">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Ступень</th>
              <th>Пояс</th>
              <th>Кто записал</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {certifications.map((certification) => (
              <tr key={certification.id}>
                <td className="whitespace-nowrap">{formatDate(certification.certifiedOn)}</td>
                <td>{certification.rankLabel ?? certification.stageLabel}</td>
                <td>{beltGradeLabel(certification.beltGrade) ?? certification.beltGrade}</td>
                <td className="text-muted">{certification.createdBy?.email ?? '—'}</td>
                <td>
                  {canEdit ? (
                    <form action={cancelCertificationAction}>
                      <input type="hidden" name="athleteId" value={athleteId} />
                      <input type="hidden" name="certificationId" value={certification.id} />
                      <button type="submit" className="text-xs text-muted hover:text-red-600">
                        отменить
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit ? (
        <form action={formAction} className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
          <input type="hidden" name="athleteId" value={athleteId} />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className={labelClass}>
              Дата аттестации
              <input
                type="date"
                name="certifiedOn"
                required
                max={today}
                defaultValue={today}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Ступень
              <select name="rank" defaultValue="kyu-10" required className={inputClass}>
                {RANKS.map((rank) => (
                  <option key={rank.id} value={rank.id}>
                    {rank.label} — {rank.beltLabel}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-muted">
                Пояс определится из ступени: кю-10 — оранжевый, кю-8 — синий, даны — чёрный.
              </span>
            </label>

            <label className={labelClass}>
              Примечание
              <input name="note" maxLength={500} className={inputClass} />
            </label>
          </div>

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

          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {pending ? 'Сохранение…' : 'Присвоить ступень'}
          </button>
        </form>
      ) : null}
    </section>
  );
}

/** Дата без времени: аттестация — событие дня. */
function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
