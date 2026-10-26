import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { fieldClass, secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateEventForm } from './forms';

export const metadata = {
  title: 'Аттестации — OCTAGON',
};

interface EventView {
  id: string;
  title: string;
  scheduledAt: string;
  location: string | null;
  status: string;
  participantsCount: number;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  PLANNED: 'Запланировано',
  IN_PROGRESS: 'Идёт',
  COMPLETED: 'Завершено',
  PUBLISHED: 'Опубликовано',
  CANCELLED: 'Отменено',
};

/** Классы бейджа: общий StatusBadge знает только статусы спортсменов и платежей. */
const STATUS_CLASSES: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-700',
  PLANNED: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  COMPLETED: 'bg-green-100 text-green-800',
  PUBLISHED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

/** Формат даты без библиотек: «15 ноября 2026, 10:00». */
function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Аттестации (#40).
 *
 * Список и создание на одной странице: мероприятий у клуба немного, и отдельный
 * экран «создать» заставлял бы возвращаться назад ради одного действия.
 */
export default async function AttestationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const canManage = user.permissions.includes('attestations.manage');
  const canView = user.permissions.includes('attestations.view');

  if (!canView) {
    return (
      <AppShell user={user}>
        <PageHeader title="Аттестации" />
        <Notice tone="info">{describePermission('attestations.view')}</Notice>
      </AppShell>
    );
  }

  const { accessToken } = await readTokens();
  const events = accessToken
    ? await apiFetch<EventView[]>('/api/v1/certification-events', { accessToken })
    : null;

  const rows = events?.ok ? events.data : [];
  const active = rows.filter((event) => !['CANCELLED', 'PUBLISHED'].includes(event.status));
  const archive = rows.filter((event) => ['CANCELLED', 'PUBLISHED'].includes(event.status));

  return (
    <AppShell user={user}>
      <PageHeader
        title="Аттестации"
        description="Экзамены, допуск и присвоение ступеней"
      />

      {!events?.ok && events ? <Notice tone="info">{describeError(events.error)}</Notice> : null}

      {canManage ? (
        <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Новое мероприятие</h2>
          <CreateEventForm />
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Мероприятий пока нет"
          description={
            canManage
              ? 'Создайте первое мероприятие — в нём появятся участники и результаты.'
              : 'Когда тренер создаст мероприятие, оно появится здесь.'
          }
        />
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Активные
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-neutral-600">Нет активных мероприятий.</p>
            ) : (
              <EventTable events={active} />
            )}
          </section>

          {archive.length > 0 ? (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
                Архив
              </h2>
              <EventTable events={archive} />
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function EventTable({ events }: { events: EventView[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-neutral-200 text-neutral-500">
          <tr>
            <th className="px-4 py-3 font-medium">Мероприятие</th>
            <th className="px-4 py-3 font-medium">Дата</th>
            <th className="px-4 py-3 font-medium">Место</th>
            <th className="px-4 py-3 font-medium">Участники</th>
            <th className="px-4 py-3 font-medium">Статус</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr className="border-b border-neutral-100 last:border-0" key={event.id}>
              <td className="px-4 py-3 font-medium">{event.title}</td>
              <td className="px-4 py-3 text-neutral-600">{formatMoment(event.scheduledAt)}</td>
              <td className="px-4 py-3 text-neutral-600">{event.location ?? '—'}</td>
              <td className="px-4 py-3 text-neutral-600">{event.participantsCount}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUS_CLASSES[event.status] ?? STATUS_CLASSES.DRAFT
                  }`}
                >
                  {STATUS_LABELS[event.status] ?? event.status}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Link className={secondaryButtonClass} href={`/attestations/${event.id}`}>
                  Открыть
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
