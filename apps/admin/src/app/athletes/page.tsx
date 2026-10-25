import { describePermission } from '@/lib/permissions';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateAthleteForm } from './athlete-forms';

export const metadata = {
  title: 'Спортсмены — OCTAGON',
};

interface AthleteView {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  status: string;
  phone: string | null;
  email: string | null;
}

/**
 * Справочник спортсменов (C4).
 *
 * Контакты приходят пустыми, если у пользователя нет права
 * `athletes.contacts.view`: фильтрация выполняется на backend, интерфейс лишь
 * показывает прочерк (docs/15-security.md).
 */
export default async function AthletesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const result = await apiFetch<AthleteView[]>('/athletes', { accessToken });
  const canViewContacts = user.permissions.includes('athletes.contacts.view');
  const canEdit = user.permissions.includes('athletes.edit');

  return (
    <AppShell user={user}>
      <PageHeader
        title="Спортсмены"
        description="Список ограничен зоной доступа текущего пользователя"
      />

      {!canViewContacts ? (
        <div className="mb-4">
          <Notice>Контактные данные скрыты: нет права: {describePermission('athletes.contacts.view')}.</Notice>
        </div>
      ) : null}

      <div className={canEdit ? 'grid gap-6 lg:grid-cols-[2fr_1fr]' : ''}>
        {result.ok && result.data.length === 0 ? (
          <div className="rounded-card border border-line bg-white">
            <EmptyState
              icon="athletes"
              title="Спортсменов пока нет"
              description="Заполните карточку справа: после этого спортсмена можно записать в группу и вести оплаты."
            />
          </div>
        ) : (
          <div className="rounded-card border border-line bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ФИО</th>
                  <th className="px-4 py-3">Дата рождения</th>
                  <th className="px-4 py-3">Телефон</th>
                  <th className="px-4 py-3">Статус</th>
                </tr>
              </thead>
              <tbody>
                {result.ok && result.data.length > 0 ? (
                  result.data.map((athlete) => (
                    <tr key={athlete.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <Link
                          href={`/athletes/${athlete.id}`}
                          className="font-medium text-ink underline decoration-line hover:decoration-accent"
                        >
                          {athlete.lastName} {athlete.firstName}
                          {athlete.middleName ? ` ${athlete.middleName}` : ''}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{athlete.birthDate ?? '—'}</td>
                      <td className="px-4 py-3 text-muted">{athlete.phone ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge value={athlete.status} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-6">
                      <Notice>{result.ok ? 'Спортсмены не найдены.' : describeError(result.error)}</Notice>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {canEdit ? <CreateAthleteForm /> : null}
      </div>
    </AppShell>
  );
}
