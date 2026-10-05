import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { archiveBranchAction } from './actions';
import { BranchForm } from './branch-form';

export const metadata = {
  title: 'Филиалы — OCTAGON',
};

interface BranchView {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  isActive: boolean;
}

/** Справочник филиалов (C1): список, создание, архивирование. */
export default async function BranchesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const result = await apiFetch<BranchView[]>('/branches', { accessToken });

  const canManage = user.permissions.includes('branches.manage');

  return (
    <AppShell user={user}>
      <PageHeader
        title="Филиалы"
        description="Структура клуба: филиалы и их залы"
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3">Адрес</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {result.ok && result.data.length > 0 ? (
                result.data.map((branch) => (
                  <tr key={branch.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-900">{branch.name}</td>
                    <td className="px-4 py-3 text-slate-600">{branch.address ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{branch.phone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          branch.isActive
                            ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                            : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500'
                        }
                      >
                        {branch.isActive ? 'активен' : 'неактивен'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canManage && branch.isActive ? (
                        <form action={archiveBranchAction}>
                          <input type="hidden" name="branchId" value={branch.id} />
                          <button
                            type="submit"
                            className="text-xs text-slate-500 underline hover:text-red-700"
                          >
                            Архивировать
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <Notice>
                      {result.ok
                        ? 'Филиалов пока нет: создайте первый в форме справа.'
                        : describeError(result.error)}
                    </Notice>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canManage ? (
          <BranchForm />
        ) : (
          <Notice>
            Раздел доступен только для просмотра: нет права «branches.manage».
          </Notice>
        )}
      </div>
    </AppShell>
  );
}
