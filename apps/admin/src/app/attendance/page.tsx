import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Посещаемость — OCTAGON',
};

interface GroupView {
  id: string;
  name: string;
  isActive: boolean;
}

interface GroupMemberView {
  athleteId: string;
  firstName: string;
  lastName: string;
  status: string;
}

interface GroupDetails extends GroupView {
  members: GroupMemberView[];
}

interface AthleteAttendanceSummary {
  athleteId: string;
  total: number;
  present: number;
  absent: number;
  excused: number;
  unmarked: number;
}

/**
 * Сводка посещаемости группы за период.
 *
 * API `/attendance/summary` умел это с самого начала, но экрана не было: цифры
 * существовали только для того, кто дергал API вручную. Тренеру и администратору
 * нужен ответ на вопрос «кто ходит, а кто пропадает» — по нему принимают решения
 * о продлении и о разговоре с родителем.
 *
 * Процент считается от **отмеченных** занятий: занятие без отметки означает, что
 * посещаемость не подтверждена, и включать его в знаменатель значило бы занижать
 * показатель тому, кого забыли отметить.
 */
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ groupId?: string; from?: string; to?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!user.permissions.includes('attendance.view')) {
    return (
      <AppShell user={user}>
        <PageHeader title="Посещаемость" />
        <Notice>Раздел доступен с правом «attendance.view».</Notice>
      </AppShell>
    );
  }

  const { groupId, from, to } = await searchParams;
  const { accessToken } = await readTokens();

  const groupsResult = await apiFetch<GroupView[]>('/groups', { accessToken });
  const groups = groupsResult.ok ? groupsResult.data.filter((group) => group.isActive) : [];

  // Период по умолчанию — текущий месяц по часовому поясу клуба.
  const defaults = currentMonthRange();

  const selectedGroupId = groupId ?? groups[0]?.id ?? '';
  const rangeFrom = from ?? defaults.from;
  const rangeTo = to ?? defaults.to;

  const groupDetails = selectedGroupId
    ? await apiFetch<GroupDetails>(`/groups/${selectedGroupId}`, { accessToken })
    : null;

  const summary = selectedGroupId
    ? await apiFetch<AthleteAttendanceSummary[]>(
        `/attendance/summary?groupId=${selectedGroupId}&from=${rangeFrom}&to=${rangeTo}`,
        { accessToken },
      )
    : null;

  // Имена: сводка отдает только идентификаторы, потому что считает по занятиям.
  const nameById = new Map(
    (groupDetails?.ok ? groupDetails.data.members : []).map((member) => [
      member.athleteId,
      `${member.lastName} ${member.firstName}`,
    ]),
  );

  const rows = (summary?.ok ? summary.data : [])
    .map((row) => ({
      ...row,
      name: nameById.get(row.athleteId) ?? 'спортсмен вне текущего состава',
      marked: row.total - row.unmarked,
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));

  const totals = rows.reduce(
    (accumulator, row) => ({
      total: accumulator.total + row.total,
      present: accumulator.present + row.present,
      absent: accumulator.absent + row.absent,
      excused: accumulator.excused + row.excused,
      unmarked: accumulator.unmarked + row.unmarked,
      marked: accumulator.marked + row.marked,
    }),
    { total: 0, present: 0, absent: 0, excused: 0, unmarked: 0, marked: 0 },
  );

  const selectedGroupName = groups.find((group) => group.id === selectedGroupId)?.name;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Посещаемость"
        description="Сводка по группе за период: кто ходит, кто пропускает и где нет отметок."
      />

      <div className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <form action="/attendance" className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-col gap-1 text-xs font-medium text-slate-600">
            Группа
            <select
              name="groupId"
              defaultValue={selectedGroupId}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            >
              {groups.length === 0 ? <option value="">групп нет</option> : null}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            С
            <input
              type="date"
              name="from"
              defaultValue={rangeFrom}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            По
            <input
              type="date"
              name="to"
              defaultValue={rangeTo}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
          </label>

          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Показать
          </button>
        </form>

        {/* Быстрые периоды: чаще всего нужен текущий или прошлый месяц. */}
        {selectedGroupId ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              href={periodHref(selectedGroupId, currentMonthRange())}
              className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200"
            >
              Текущий месяц
            </Link>
            <Link
              href={periodHref(selectedGroupId, previousMonthRange())}
              className="rounded-full bg-slate-100 px-3 py-1 text-slate-700 hover:bg-slate-200"
            >
              Прошлый месяц
            </Link>
          </div>
        ) : null}
      </div>

      {!groupsResult.ok ? <Notice tone="error">{describeError(groupsResult.error)}</Notice> : null}

      {groupsResult.ok && groups.length === 0 ? (
        <Notice>Активных групп нет: сначала создайте группу и добавьте в нее спортсменов.</Notice>
      ) : null}

      {summary && !summary.ok ? <Notice tone="error">{describeError(summary.error)}</Notice> : null}

      {summary?.ok && rows.length === 0 ? (
        <Notice>
          За период нет занятий с составом группы. Сводка строится по занятиям: если их не было или
          расписание не сформировано, считать нечего.
        </Notice>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Спортсмен</th>
                <th className="px-4 py-3 text-right">Занятий</th>
                <th className="px-4 py-3 text-right">Был</th>
                <th className="px-4 py-3 text-right">Не был</th>
                <th className="px-4 py-3 text-right">Уважительная</th>
                <th className="px-4 py-3 text-right">Без отметки</th>
                <th className="px-4 py-3 text-right">Посещаемость</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.athleteId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.total}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{row.present}</td>
                  <td className="px-4 py-3 text-right text-red-700">{row.absent}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{row.excused}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{row.unmarked}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">
                    {percentage(row.present, row.marked)}
                  </td>
                </tr>
              ))}

              <tr className="bg-slate-50 text-xs text-slate-600">
                <td className="px-4 py-3 font-medium">Итого по группе</td>
                <td className="px-4 py-3 text-right">{totals.total}</td>
                <td className="px-4 py-3 text-right">{totals.present}</td>
                <td className="px-4 py-3 text-right">{totals.absent}</td>
                <td className="px-4 py-3 text-right">{totals.excused}</td>
                <td className="px-4 py-3 text-right">{totals.unmarked}</td>
                <td className="px-4 py-3 text-right font-medium">
                  {percentage(totals.present, totals.marked)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {selectedGroupName ? (
        <p className="mt-3 text-xs text-slate-500">
          Группа «{selectedGroupName}», период {rangeFrom} — {rangeTo}. Процент считается от
          отмеченных занятий: занятие без отметки не занижает показатель, а показывается отдельно.
        </p>
      ) : null}
    </AppShell>
  );
}

/**
 * Процент посещаемости от отмеченных занятий.
 *
 * Если отмеченных нет, процент не определен — «0%» здесь был бы неверным выводом:
 * это не «никто не ходил», а «посещаемость не отмечали».
 */
function percentage(present: number, marked: number): string {
  if (marked === 0) {
    return '—';
  }
  return `${Math.round((present / marked) * 100)}%`;
}

function periodHref(groupId: string, range: { from: string; to: string }): string {
  return `/attendance?groupId=${groupId}&from=${range.from}&to=${range.to}`;
}

/** Первое число текущего месяца и первое число следующего по часовому поясу клуба. */
function currentMonthRange(): { from: string; to: string } {
  const today = clubToday();
  const [year, month] = today.split('-').map(Number);
  return { from: `${today.slice(0, 7)}-01`, to: monthRangeEnd(year, month) };
}

/** Первое число прошлого месяца и первое число текущего. */
function previousMonthRange(): { from: string; to: string } {
  const today = clubToday();
  const [year, month] = today.split('-').map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return {
    from: `${previousYear}-${String(previousMonth).padStart(2, '0')}-01`,
    to: `${today.slice(0, 7)}-01`,
  };
}

/** Первый день следующего месяца: `to` в API исключающий. */
function monthRangeEnd(year: number, month: number): string {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
}

/** Сегодняшняя дата по часовому поясу клуба в формате YYYY-MM-DD. */
function clubToday(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: process.env.CLUB_TIMEZONE ?? 'Asia/Almaty',
  }).format(new Date());
}
