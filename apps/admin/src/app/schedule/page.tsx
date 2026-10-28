import { describePermission } from '@/lib/permissions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { ScheduleCalendar, type CalendarView } from '@/components/schedule-calendar';
import { apiFetch, describeError } from '@/lib/api/client';
import {
  addDays,
  type CalendarEvent,
  clubDate,
  clubTime,
  expandDraftSlots,
  monthRange,
  startOfWeek,
  todayInClub,
  type TemplateForCalendar,
} from '@/lib/schedule/calendar';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateTemplateForm } from './schedule-forms';

export const metadata = {
  title: 'Расписание — OCTAGON',
};

interface ScheduleTemplateView {
  id: string;
  groupId: string;
  groupName: string;
  year: number;
  quarter: number;
  validFrom: string;
  validTo: string;
  publishedAt: string | null;
  slots: {
    id: string;
    weekday: string;
    startTime: string;
    endTime: string;
    hallName: string | null;
    trainerName: string | null;
  }[];
}

interface SessionView {
  id: string;
  groupName: string;
  hallName: string | null;
  trainerName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
}

interface GroupView {
  id: string;
  name: string;
  hallName: string | null;
  isActive: boolean;
}

/** Текущий квартал: подставляется в форму создания по умолчанию. */
function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

/**
 * Расписание: календарь и квартальные шаблоны (эпик D).
 *
 * Шаблон — это регулярность на квартал, а не отдельные занятия. Занятия
 * создаются материализацией и живут отдельно, поэтому правка занятия не
 * переписывает расписание (BR-009).
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; anchor?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { view: rawView, anchor: rawAnchor } = await searchParams;
  const view: CalendarView = rawView === 'week' ? 'week' : 'month';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(rawAnchor ?? '') ? (rawAnchor as string) : todayInClub();

  // Календарь тянет соседние дни: месяц показываем сеткой с хвостами недель.
  const from = view === 'week' ? startOfWeek(anchor) : startOfWeek(monthRange(...anchorMonth(anchor)).from);
  const to = view === 'week' ? addDays(from, 6) : addDays(from, 41);

  const { accessToken } = await readTokens();
  const canEdit = user.permissions.includes('schedule.edit');

  const [templates, groups, sessions] = await Promise.all([
    apiFetch<ScheduleTemplateView[]>('/schedule-templates', { accessToken }),
    apiFetch<GroupView[]>('/groups', { accessToken }),
    // API занятий — `/training-sessions`, а не `/schedule/sessions`: второе —
    // маршрут админки, а не API.
    apiFetch<SessionView[]>(
      `/training-sessions?from=${from}T00:00:00.000Z&to=${addDays(to, 1)}T00:00:00.000Z`,
      { accessToken },
    ),
  ]);

  const { year, quarter } = currentQuarter();
  const groupOptions = (groups.ok ? groups.data : [])
    .filter((group) => group.isActive)
    .map((group) => ({
      id: group.id,
      name: group.name,
      hallName: group.hallName,
    }));

  const events: CalendarEvent[] = [];

  if (sessions.ok) {
    for (const session of sessions.data) {
      // Отменённое занятие в календаре не показываем: отмена — это решение, что
      // занятия не будет, и оно не должно выглядеть как действующее. История
      // отмены остаётся в списке занятий и в журнале.
      if (session.status === 'CANCELLED') {
        continue;
      }

      events.push({
        id: session.id,
        kind: 'session',
        date: clubDate(session.startsAt),
        startTime: clubTime(session.startsAt),
        endTime: clubTime(session.endsAt),
        title: session.groupName,
        hallName: session.hallName,
        trainerName: session.trainerName,
        status: session.status,
        href: `/schedule/sessions/${session.id}/attendance`,
      });
    }
  }

  // Черновики шаблонов видно в календаре с пометкой (#72): планировщику нужно
  // понимать, что получится после публикации, не публикуя вслепую.
  if (templates.ok) {
    events.push(...expandDraftSlots(templates.data as TemplateForCalendar[], from, to));
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Расписание"
        description="Календарь занятий и квартальные шаблоны группы"
      />

      <div className="mb-6">
        <ScheduleCalendar
          anchor={anchor}
          baseHref="/schedule"
          events={events}
          view={view}
        />
      </div>

      <div className={canEdit ? 'grid gap-6 lg:grid-cols-[2fr_1fr]' : ''}>
        <div className="flex flex-col gap-3">
          {templates.ok && templates.data.length > 0 ? (
            templates.data.map((template) => (
              <article
                key={template.id}
                className="rounded-card border border-line bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/schedule/${template.id}`}
                      className="font-medium text-ink underline decoration-line hover:decoration-accent"
                    >
                      {template.groupName}
                    </Link>
                    <p className="mt-1 text-xs text-muted">
                      {template.quarter} квартал {template.year} · {template.validFrom} —{' '}
                      {template.validTo} · слотов: {template.slots.length}
                    </p>
                  </div>
                  <span
                    className={
                      template.publishedAt
                        ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                        : 'rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700'
                    }
                  >
                    {template.publishedAt ? 'опубликовано' : 'черновик'}
                  </span>
                </div>
                <div className="mt-3">
                  <Link
                    href={`/schedule/sessions?groupId=${template.groupId}`}
                    className="text-xs text-muted underline hover:text-ink"
                  >
                    Занятия группы
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <Notice>
              {templates.ok
                ? 'Расписаний пока нет: создайте шаблон на квартал.'
                : describeError(templates.error)}
            </Notice>
          )}

          {!sessions.ok ? <Notice tone="error">{describeError(sessions.error)}</Notice> : null}

          <div>
            <Link
              href="/schedule/sessions"
              className="text-sm text-muted underline hover:text-ink"
            >
              Список занятий →
            </Link>
          </div>
        </div>

        {canEdit ? (
          <CreateTemplateForm
            groups={groupOptions}
            defaultYear={year}
            defaultQuarter={quarter}
          />
        ) : (
          <Notice>Раздел доступен только для просмотра: нет права: {describePermission('schedule.edit')}.</Notice>
        )}
      </div>
    </AppShell>
  );
}

/** Год и месяц из `YYYY-MM-DD` — для `monthRange`. */
function anchorMonth(anchor: string): [number, number] {
  const [year, month] = anchor.split('-').map(Number);
  return [year ?? 2026, month ?? 1];
}
