import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
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
          <Notice>Контактные данные скрыты: нет права «athletes.contacts.view».</Notice>
        </div>
      ) : null}

      <div className={canEdit ? 'grid gap-6 lg:grid-cols-[2fr_1fr]' : ''}>
        <div className="rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                  <tr key={athlete.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/athletes/${athlete.id}`}
                        className="font-medium text-slate-900 underline decoration-slate-300 hover:decoration-slate-900"
                      >
                        {athlete.lastName} {athlete.firstName}
                        {athlete.middleName ? ` ${athlete.middleName}` : ''}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{athlete.birthDate ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{athlete.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                        {athlete.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-6">
                    <Notice>
                      {result.ok
                        ? 'Спортсменов пока нет либо они вне вашей зоны доступа.'
                        : describeError(result.error)}
                    </Notice>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canEdit ? <CreateAthleteForm /> : null}
      </div>
    </AppShell>
  );
}
