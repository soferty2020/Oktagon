import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { cancelAbsenceAction } from './actions';
import { MarkForm, ReportAbsenceForm } from './attendance-forms';

export const metadata = {
  title: 'Посещаемость — OCTAGON',
};

interface SessionAttendanceView {
  sessionId: string;
  groupId: string;
  groupName: string;
  startsAt: string;
  endsAt: string;
  status: string;
  markedCount: number;
  roster: {
    athleteId: string;
    firstName: string;
    lastName: string;
    attendance: { status: string; comment: string | null } | null;
    plannedAbsence: { reason: string | null; reportedAt: string } | null;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  PRESENT: 'присутствовал',
  ABSENT: 'отсутствовал',
  EXCUSED: 'по уважительной причине',
};

/**
 * Посещаемость занятия (эпик E).
 *
 * Список приходит с backend уже ограниченным составом группы на дату занятия:
 * зачисленные позже и выбывшие раньше в него не попадают, поэтому здесь
 * дополнительная фильтрация не нужна и вредна.
 */
export default async function SessionAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const result = await apiFetch<SessionAttendanceView>(
    `/training-sessions/${id}/attendance`,
    { accessToken },
  );

  if (!result.ok) {
    if (result.error.status === 404) {
      notFound();
    }
    return (
      <AppShell user={user}>
        <PageHeader title="Посещаемость" />
        <Notice tone="error">{describeError(result.error)}</Notice>
      </AppShell>
    );
  }

  const canEdit = user.permissions.includes('attendance.edit');
  const data = result.data;
  const total = data.roster.length;
  const pending = total - data.markedCount;
  const withAbsence = data.roster.filter((entry) => entry.plannedAbsence !== null);

  return (
    <AppShell user={user}>
      <PageHeader
        title={`Посещаемость: ${data.groupName}`}
        description={`${formatLocal(data.startsAt)} — ${formatLocal(data.endsAt, true)} · отмечено ${data.markedCount} из ${total}`}
        actions={
          <Link
            href="/schedule/sessions"
            className="text-sm text-slate-500 hover:text-slate-900"
          >
            ← Все занятия
          </Link>
        }
      />

      {pending > 0 ? (
        <div className="mb-4">
          <Notice>Не отмечено спортсменов: {pending}</Notice>
        </div>
      ) : null}

      {withAbsence.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-800">
            Предупреждения об отсутствии ({withAbsence.length}): это слова родителя, итог
            подтверждает тренер
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {withAbsence.map((entry) => (
              <li
                key={entry.athleteId}
                className="flex items-center justify-between gap-2 text-xs text-amber-900"
              >
                <span>
                  {entry.lastName} {entry.firstName}
                  {entry.plannedAbsence?.reason ? ` — ${entry.plannedAbsence.reason}` : ''}
                </span>
                {canEdit ? (
                  <form action={cancelAbsenceAction}>
                    <input type="hidden" name="sessionId" value={data.sessionId} />
                    <input type="hidden" name="athleteId" value={entry.athleteId} />
                    <button type="submit" className="underline hover:text-amber-700">
                      отменить
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-2">Спортсмен</th>
              <th className="py-2">Статус</th>
              <th className="py-2 text-right">Отметка</th>
            </tr>
          </thead>
          <tbody>
            {total === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-sm text-slate-500">
                  На дату занятия в группе не было спортсменов. Если это неожиданно,
                  проверьте состав группы: журнал строится по членству на дату занятия.
                </td>
              </tr>
            ) : (
              data.roster.map((entry) => (
                <tr key={entry.athleteId} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 font-medium text-slate-900">
                    {entry.lastName} {entry.firstName}
                    {entry.plannedAbsence ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                        предупредил
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-slate-600">
                    {entry.attendance ? STATUS_LABELS[entry.attendance.status] : 'не отмечен'}
                    {entry.attendance?.comment ? (
                      <span className="block text-xs text-slate-400">
                        {entry.attendance.comment}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2">
                    {canEdit ? (
                      <MarkForm
                        sessionId={data.sessionId}
                        athleteId={entry.athleteId}
                        current={entry.attendance?.status ?? null}
                      />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {canEdit ? (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Сообщить о планируемом отсутствии
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Обычно это делает родитель из приложения. Предупреждение не заменяет отметку: итог
            ставит тренер.
          </p>
          <div className="mt-4">
            <ReportAbsenceForm
              sessionId={data.sessionId}
              athletes={data.roster
                .filter((entry) => entry.plannedAbsence === null)
                .map((entry) => ({
                  id: entry.athleteId,
                  name: `${entry.lastName} ${entry.firstName}`,
                }))}
            />
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function formatLocal(iso: string, timeOnly = false): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (timeOnly) {
    return time;
  }
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${time}`;
}
