import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
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
  slots: { id: string }[];
}

interface GroupView {
  id: string;
  name: string;
  isActive: boolean;
}

/** Текущий квартал: подставляется в форму создания по умолчанию. */
function currentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

/**
 * Расписание: квартальные шаблоны (эпик D).
 *
 * Шаблон — это регулярность на квартал, а не отдельные занятия. Занятия
 * создаются материализацией и живут отдельно, поэтому правка занятия не
 * переписывает расписание (BR-009).
 */
export default async function SchedulePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const canEdit = user.permissions.includes('schedule.edit');

  const [templates, groups] = await Promise.all([
    apiFetch<ScheduleTemplateView[]>('/schedule-templates', { accessToken }),
    apiFetch<GroupView[]>('/groups', { accessToken }),
  ]);

  const { year, quarter } = currentQuarter();
  const groupOptions = (groups.ok ? groups.data : [])
    .filter((group) => group.isActive)
    .map((group) => ({ id: group.id, name: group.name }));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Расписание"
        description="Квартальные шаблоны: регулярность группы на четверть года"
      />

      <div className={canEdit ? 'grid gap-6 lg:grid-cols-[2fr_1fr]' : ''}>
        <div className="flex flex-col gap-3">
          {templates.ok && templates.data.length > 0 ? (
            templates.data.map((template) => (
              <article
                key={template.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/schedule/${template.id}`}
                      className="font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-900"
                    >
                      {template.groupName}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
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
                    className="text-xs text-slate-500 underline hover:text-slate-900"
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

          <div>
            <Link
              href="/schedule/sessions"
              className="text-sm text-slate-600 underline hover:text-slate-900"
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
          <Notice>Раздел доступен только для просмотра: нет права «schedule.edit».</Notice>
        )}
      </div>
    </AppShell>
  );
}
