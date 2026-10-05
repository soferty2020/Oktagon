import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Обзор — OCTAGON',
};

type Collection = { meta?: { total?: number } };

/**
 * Обзорный экран админки.
 *
 * Показывает состояние справочников и права текущего пользователя: без прав
 * разделы недоступны на backend, и администратору полезно видеть, что именно
 * ему разрешено (ADR-0006).
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const [branches, groups, athletes] = await Promise.all([
    apiFetch<Collection>('/branches', { accessToken }),
    apiFetch<Collection>('/groups', { accessToken }),
    apiFetch<Collection>('/athletes', { accessToken }),
  ]);

  const sections = [
    { title: 'Филиалы', href: '/branches', result: branches },
    { title: 'Группы', href: '/groups', result: groups },
    { title: 'Спортсмены', href: '/athletes', result: athletes },
  ];

  return (
    <AppShell user={user}>
      <PageHeader
        title="Обзор"
        description="Справочники клуба и права текущего пользователя"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300"
          >
            <p className="text-sm text-slate-500">{section.title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {section.result.ok ? (section.result.data.meta?.total ?? '—') : '—'}
            </p>
            {!section.result.ok ? (
              <p className="mt-1 text-xs text-red-600">
                {describeError(section.result.error)}
              </p>
            ) : null}
          </a>
        ))}
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Права пользователя</h2>
        <p className="mt-1 text-sm text-slate-500">
          Роль {user.role}, прав: {user.permissions.length}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.permissions.map((code) => (
            <span
              key={code}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
            >
              {code}
            </span>
          ))}
        </div>
      </section>

      {!branches.ok && !groups.ok && !athletes.ok ? (
        <div className="mt-8">
          <Notice tone="error">
            Не удалось получить данные. Проверьте, что backend API запущен и доступен
            по адресу из API_BASE_URL.
          </Notice>
        </div>
      ) : null}
    </AppShell>
  );
}
