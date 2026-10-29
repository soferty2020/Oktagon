import { describePermission } from '@/lib/permissions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { ScheduleCalendar, type CalendarView } from '@/components/schedule-calendar';
import { ScheduleFilters } from '@/components/schedule-filters';
import { apiFetch, describeError } from '@/lib/api/client';
import {
  addDays,
  type CalendarEvent,
  clubDate,
  clubTime,
  expandTemplateSlots,
  groupColor,
  monthRange,
  startOfWeek,
  type TemplateForCalendar,
  todayInClub,
  WEEKDAY_LABELS,
  type WeekdayName,
} from '@/lib/schedule/calendar';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateTemplateForm } from './schedule-forms';

export const metadata = {
  title: 'Расписание — OCTAGON',
};

interface HallView {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

interface GroupView {
  id: string;
  name: string;
  description: string | null;
  hallId: string | null;
  hallName: string | null;
  isActive: boolean;
}

interface TrainerView {
  id: string;
  displayName: string;
  isActive: boolean;
}

interface TemplateSlotView {
  id: string;
  weekday: string;
  startTime: string;
  endTime: string;
  hallId: string | null;
  hallName: string | null;
  trainerId: string | null;
  trainerName: string | null;
}

interface ScheduleTemplateView extends TemplateForCalendar {
  year: number;
  quarter: number;
  slots: TemplateSlotView[];
}

interface SessionView {
  id: string;
  groupId: string;
  groupName: string;
  hallId: string | null;
  hallName: string | null;
  trainerName: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
  fromTemplate: boolean;
}

/** Текущий квартал: подставляется в форму создания по умолчанию. */
function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

/**
 * Расписание: календарь регулярных занятий и квартальные шаблоны (#75).
 *
 * Экран собран по макету: KPI-карточки, панель создания расписания, фильтры,
 * сетка месяца и блок «Расписание по залам». Календарь показывает регулярность
 * из слотов, а не материализованные занятия: слот повторяется каждую неделю, и
 * именно он отвечает на вопрос «как выглядит расписание группы».
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    anchor?: string;
    hallId?: string;
    trainerId?: string;
    groupId?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;
  const view: CalendarView = params.view === 'week' ? 'week' : 'month';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.anchor ?? '')
    ? (params.anchor as string)
    : todayInClub();
  const hallFilter = params.hallId;
  const trainerFilter = params.trainerId;
  const groupFilter = params.groupId;

  const from =
    view === 'week' ? startOfWeek(anchor) : startOfWeek(monthRange(...anchorMonth(anchor)).from);
  const to = view === 'week' ? addDays(from, 6) : addDays(from, 41);

  const { accessToken } = await readTokens();
  const canEdit = user.permissions.includes('schedule.edit');

  const [templates, groups, halls, trainers, sessions] = await Promise.all([
    apiFetch<ScheduleTemplateView[]>('/schedule-templates', { accessToken }),
    apiFetch<GroupView[]>('/groups', { accessToken }),
    apiFetch<HallView[]>('/halls', { accessToken }),
    apiFetch<TrainerView[]>('/trainers?isActive=true', { accessToken }),
    apiFetch<SessionView[]>(
      `/training-sessions?from=${from}T00:00:00.000Z&to=${addDays(to, 1)}T00:00:00.000Z`,
      { accessToken },
    ),
  ]);

  const { year, quarter } = currentQuarter();
  const hallList = halls.ok ? halls.data.filter((hall) => hall.isActive) : [];
  const groupList = groups.ok ? groups.data.filter((group) => group.isActive) : [];
  const templateList = templates.ok ? templates.data : [];
  const activeGroupIds = new Set(groupList.map((group) => group.id));

  const groupOptions = groupList.map((group) => ({
    id: group.id,
    name: group.name,
    hallName: group.hallName,
  }));

  // Фильтры применяются к слотам: группа и зал слота, либо тренер слота.
  const visibleTemplates = templateList.filter((template) => {
    if (!activeGroupIds.has(template.groupId)) return false;
    if (groupFilter && template.groupId !== groupFilter) return false;
    if (!hallFilter && !trainerFilter) return true;

    return template.slots.some(
      (slot) =>
        (!hallFilter || slot.hallId === hallFilter) &&
        (!trainerFilter || slot.trainerId === trainerFilter),
    );
  });

  const events: CalendarEvent[] = expandTemplateSlots(visibleTemplates, from, to).filter(
    (event) =>
      (!hallFilter || event.hallId === hallFilter) &&
      (!trainerFilter || event.trainerId === trainerFilter),
  );

  // Разовые занятия (задним числом) тоже видны: они не входят в регулярность.
  if (sessions.ok) {
    for (const session of sessions.data) {
      if (session.status === 'CANCELLED' || session.fromTemplate) continue;
      if (!activeGroupIds.has(session.groupId)) continue;
      if (groupFilter && session.groupId !== groupFilter) continue;
      if (hallFilter && session.hallId !== hallFilter) continue;

      events.push({
        id: session.id,
        kind: 'session',
        date: clubDate(session.startsAt),
        startTime: clubTime(session.startsAt),
        endTime: clubTime(session.endsAt),
        title: session.groupName,
        groupId: session.groupId,
        hallId: session.hallId,
        hallName: session.hallName,
        trainerId: null,
        trainerName: session.trainerName,
        status: null,
        href: `/schedule/sessions/${session.id}/attendance`,
      });
    }
  }

  const weekStart = startOfWeek(todayInClub());
  const weekEvents = expandTemplateSlots(visibleTemplates, weekStart, addDays(weekStart, 6));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Расписание"
        description="Календарь занятий и управление квартальными шаблонами"
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_2.2fr]">
        <KpiCard icon="halls" label="Залы" value={hallList.length} />
        <KpiCard
          icon="groups"
          label="Групп в расписании"
          value={new Set(visibleTemplates.map((template) => template.groupId)).size}
        />
        <KpiCard icon="calendar" label="Занятий на этой неделе" value={weekEvents.length} />

        {canEdit ? (
          <CreateTemplateForm
            groups={groupOptions}
            defaultQuarter={quarter}
            defaultYear={year}
          />
        ) : (
          <Notice>
            Раздел доступен только для просмотра: нет права {describePermission('schedule.edit')}.
          </Notice>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <ScheduleFilters
          groups={groupList.map((group) => ({ id: group.id, name: group.name }))}
          halls={hallList.map((hall) => ({ id: hall.id, name: hall.name }))}
          trainers={(trainers.ok ? trainers.data : []).map((trainer) => ({
            id: trainer.id,
            name: trainer.displayName,
          }))}
          value={{ hallId: hallFilter, trainerId: trainerFilter, groupId: groupFilter }}
        />
      </div>

      <div className="mt-4">
        <ScheduleCalendar
          anchor={anchor}
          baseHref="/schedule"
          events={events}
          keepParams={{ hallId: hallFilter, trainerId: trainerFilter, groupId: groupFilter }}
          view={view}
        />
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Расписание по залам</h2>
            <p className="mt-1 text-sm text-muted">
              Группы и регулярные занятия в каждом зале
            </p>
          </div>
          <Link className="text-sm text-muted hover:text-ink" href="/halls">
            Все залы →
          </Link>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {hallList.length === 0 ? (
            <Notice>
              {halls.ok ? 'Залов пока нет: создайте зал в разделе «Залы».' : describeError(halls.error)}
            </Notice>
          ) : (
            hallList.map((hall) => (
              <HallCard
                groups={groupList.filter((group) => group.hallId === hall.id)}
                hall={hall}
                key={hall.id}
                templates={templateList.filter((template) =>
                  groupList.some(
                    (group) => group.id === template.groupId && group.hallId === hall.id,
                  ),
                )}
              />
            ))
          )}
        </div>
      </section>

      {!sessions.ok ? <Notice tone="error">{describeError(sessions.error)}</Notice> : null}
    </AppShell>
  );
}

/** KPI-карточка в шапке экрана. */
function KpiCard({
  icon,
  label,
  value,
}: {
  icon: 'halls' | 'groups' | 'calendar';
  label: string;
  value: number;
}) {
  const paths = {
    halls: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6',
    groups: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.9M16.5 4.1a3.5 3.5 0 0 1 0 6.8',
    calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  } as const;

  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-white px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
        <svg
          aria-hidden
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          viewBox="0 0 24 24"
        >
          <path d={paths[icon]} />
        </svg>
      </span>
      <div>
        <p className="text-xl font-semibold leading-none text-ink">{value}</p>
        <p className="mt-1 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

/** Карточка зала: адрес и группы с их регулярными занятиями. */
function HallCard({
  hall,
  groups,
  templates,
}: {
  hall: HallView;
  groups: GroupView[];
  templates: ScheduleTemplateView[];
}) {
  return (
    <article className="rounded-card border border-line bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <div>
          <div className="mb-3 flex h-24 items-center justify-center rounded-lg bg-gradient-to-br from-[#F3E7D9] to-[#E8D5C0] text-[#A08A78]">
            <svg
              aria-hidden
              className="h-9 w-9"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.4}
              viewBox="0 0 24 24"
            >
              <path d="M4 21V7l8-4 8 4v14M9 21v-6h6v6" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-ink">{hall.name}</h3>
          {hall.address ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted">
              <svg
                aria-hidden
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                viewBox="0 0 24 24"
              >
                <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {hall.address}
            </p>
          ) : null}
          <span className="mt-2 inline-flex rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
            {groups.length} {groups.length === 1 ? 'группа' : 'групп'}
          </span>
        </div>

        <div className="flex flex-col divide-y divide-line">
          {groups.length === 0 ? (
            <p className="py-2 text-sm text-muted">В зале пока нет групп</p>
          ) : (
            groups.map((group) => {
              const template = templates.find((item) => item.groupId === group.id);
              const color = groupColor(group.id);

              return (
                <div
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  key={group.id}
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <span
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color.dot }}
                    />
                    <div className="min-w-0">
                      <Link
                        className="text-sm font-medium text-ink underline decoration-transparent hover:decoration-line"
                        href={template ? `/schedule/${template.id}` : `/groups/${group.id}`}
                      >
                        {group.name}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {group.description ?? 'Без описания'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted">
                    <span className="text-ink">{slotSummary(template?.slots ?? [])}</span>
                    <span>{template?.slots[0]?.trainerName ?? 'тренер не назначен'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={
                        template?.publishedAt
                          ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700'
                          : 'rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700'
                      }
                    >
                      {template?.publishedAt ? 'Активно' : 'Черновик'}
                    </span>
                    <Link
                      className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-canvas"
                      href={`/schedule/sessions?groupId=${group.id}`}
                    >
                      Занятия
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Дни и время группы одной строкой: «Пн, Ср, Пт · 18:30–19:30».
 *
 * Если время у слотов разное, перечисляем по дням: «Пн 18:30–19:30, Сб 10:00».
 */
function slotSummary(slots: TemplateSlotView[]): string {
  if (slots.length === 0) {
    return 'расписание не задано';
  }

  const byRange = new Map<string, string[]>();
  for (const slot of slots) {
    const range = `${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`;
    const days = byRange.get(range) ?? [];
    days.push(WEEKDAY_LABELS[slot.weekday as WeekdayName] ?? slot.weekday);
    byRange.set(range, days);
  }

  return [...byRange.entries()]
    .map(([range, days]) => `${days.join(', ')} · ${range}`)
    .join('; ');
}

/** Год и месяц из `YYYY-MM-DD` — для `monthRange`. */
function anchorMonth(anchor: string): [number, number] {
  const [year, month] = anchor.split('-').map(Number);
  return [year ?? 2026, month ?? 1];
}
