import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/api/client';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@octagon/contracts';

import { auditActionLabel, auditEntityLabel } from '@/lib/audit-labels';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Журнал действий — OCTAGON',
};

interface AuditRecord {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; email: string; firstName: string; lastName: string } | null;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditPage {
  items: AuditRecord[];
  nextCursor: string | null;
  total: number;
}

const PAGE_SIZE = 50;

/**
 * Журнал действий (K6, docs/26-admin-settings.md).
 *
 * Только чтение: кнопок изменения и удаления нет, и на backend таких эндпоинтов
 * тоже нет — журнал, который можно править, журналом не является.
 *
 * Доступ проверяет backend по роли. Страница дополнительно скрывает содержимое от
 * не-суперадминистратора, чтобы не показывать пустую таблицу вместо причины.
 */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    cursor?: string;
  }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const isSuperAdmin = user.role === 'SUPERADMIN';
  const params = await searchParams;
  const { accessToken } = await readTokens();

  const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (params.action) query.set('action', params.action);
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.cursor) query.set('cursor', params.cursor);

  const result = isSuperAdmin
    ? await apiFetch<AuditPage>(`/audit?${query.toString()}`, { accessToken })
    : null;

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-ink"
        >
          <Icon name="chevron" size={14} className="rotate-180" />
          Настройки
        </Link>
      </div>

      <PageHeader
        title="Журнал действий"
        description="Кто и что изменил. Записи не редактируются и не удаляются."
      />

      {!isSuperAdmin ? (
        <Notice tone="error">
          Раздел доступен только суперадминистратору: право просмотра аудита не делегируется.
        </Notice>
      ) : (
        <>
          <form
            method="GET"
            className="mb-4 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-4"
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Действие</span>
              <select
                name="action"
                defaultValue={params.action ?? ''}
                className="min-w-52 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">Любое</option>
                {AUDIT_ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {auditActionLabel(action)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Сущность</span>
              <select
                name="entityType"
                defaultValue={params.entityType ?? ''}
                className="min-w-44 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">Любая</option>
                {AUDIT_ENTITY_TYPES.map((entity) => (
                  <option key={entity} value={entity}>
                    {auditEntityLabel(entity)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">С даты</span>
              <input
                type="date"
                name="from"
                defaultValue={params.from?.slice(0, 10) ?? ''}
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">По дату</span>
              <input
                type="date"
                name="to"
                defaultValue={params.to?.slice(0, 10) ?? ''}
                className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </label>

            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
            >
              Показать
            </button>

            <Link href="/settings/audit" className="px-2 py-2 text-sm text-muted hover:text-ink">
              Сбросить
            </Link>
          </form>

          {!result?.ok ? (
            <Notice tone="error">
              {result ? describeError(result.error) : 'Не удалось загрузить журнал.'}
            </Notice>
          ) : result.data.items.length === 0 ? (
            <Notice>Записей за выбранный период нет.</Notice>
          ) : (
            <>
              <div className="overflow-hidden rounded-card border border-line bg-white">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Время</th>
                      <th>Кто</th>
                      <th>Действие</th>
                      <th>Сущность</th>
                      <th>IP</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.items.map((record) => (
                      <tr key={record.id}>
                        <td className="whitespace-nowrap text-muted">
                          {formatDateTime(record.createdAt)}
                        </td>
                        <td>
                          {record.actor
                            ? `${record.actor.firstName} ${record.actor.lastName}`.trim() ||
                              record.actor.email
                            : 'система'}
                        </td>
                        <td>
                          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs">
                            {auditActionLabel(record.action)}
                          </span>
                        </td>
                        <td className="text-muted">
                          {auditEntityLabel(record.entityType)}
                          {record.entityId ? ` · ${record.entityId.slice(0, 8)}…` : ''}
                        </td>
                        <td className="text-muted">{record.ipAddress ?? '—'}</td>
                        <td>
                          <details>
                            <summary className="cursor-pointer text-xs text-accent">
                              до/после
                            </summary>
                            <div className="mt-2 grid gap-2 text-xs">
                              <div>
                                <p className="mb-1 font-medium text-muted">Было</p>
                                <pre className="max-w-md overflow-x-auto rounded bg-canvas p-2">
                                  {formatJson(record.before)}
                                </pre>
                              </div>
                              <div>
                                <p className="mb-1 font-medium text-muted">Стало</p>
                                <pre className="max-w-md overflow-x-auto rounded bg-canvas p-2">
                                  {formatJson(record.after)}
                                </pre>
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm text-muted">
                <span>Всего записей: {result.data.total}</span>
                {result.data.nextCursor ? (
                  <Link
                    href={`/settings/audit?${nextPageQuery(params, result.data.nextCursor)}`}
                    className="text-accent hover:underline"
                  >
                    Следующая страница →
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}

/** Ссылка на следующую страницу сохраняет все фильтры, меняя только курсор. */
function nextPageQuery(
  params: { action?: string; entityType?: string; from?: string; to?: string },
  cursor: string,
): string {
  const query = new URLSearchParams({ cursor });
  if (params.action) query.set('action', params.action);
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  return query.toString();
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  });
}

/** Значения приходят уже с маской; форматируем только для читаемости. */
function formatJson(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return JSON.stringify(value, null, 2);
}
