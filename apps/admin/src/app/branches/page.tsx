import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { BranchForm } from './branch-form';
import { ArchiveBranchForm, CreateHallForm, HallRow } from './hall-forms';

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

interface HallView {
  id: string;
  branchId: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
}

/**
 * Справочник филиалов и залов (C1).
 *
 * Залы показаны под своим филиалом: раньше их можно было только выбрать в
 * расписании, а создать, переименовать или закрыть — нет, хотя API это умеет.
 * Существовал разрыв: зал, заведенный с ошибкой, нельзя было исправить из
 * интерфейса вообще.
 *
 * Правка зала включает перенос в другой филиал: это исправление ошибки при
 * заведении. Занятия при переносе не меняют филиал — он берется из первичной
 * группы, поэтому отчеты по филиалам не искажаются.
 */
export default async function BranchesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const result = await apiFetch<BranchView[]>('/branches', { accessToken });

  const canManage = user.permissions.includes('branches.manage');

  // Залы запрашиваются для каждого филиала: отдельного «списка всех залов» в API
  // нет, а филиалов в клубе немного.
  const hallsByBranch = new Map<string, HallView[]>();
  if (result.ok) {
    const lists = await Promise.all(
      result.data.map(async (branch) => {
        const halls = await apiFetch<HallView[]>(`/branches/${branch.id}/halls`, { accessToken });
        return { branchId: branch.id, halls: halls.ok ? halls.data : [] };
      }),
    );
    for (const list of lists) {
      hallsByBranch.set(list.branchId, list.halls);
    }
  }

  const branches = result.ok ? result.data : [];
  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));

  return (
    <AppShell user={user}>
      <PageHeader title="Филиалы" description="Структура клуба: филиалы и их залы" />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {!result.ok ? <Notice tone="error">{describeError(result.error)}</Notice> : null}

          {result.ok && branches.length === 0 ? (
            <Notice>Филиалов пока нет: создайте первый в форме справа.</Notice>
          ) : null}

          {branches.map((branch) => {
            const halls = hallsByBranch.get(branch.id) ?? [];

            return (
              <section key={branch.id} className="rounded-card border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">{branch.name}</h2>
                    <p className="mt-1 text-xs text-muted">
                      {[branch.address, branch.phone].filter(Boolean).join(' · ') || 'без адреса'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={
                        branch.isActive
                          ? 'rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                          : 'rounded-full bg-canvas px-2 py-1 text-xs text-muted'
                      }
                    >
                      {branch.isActive ? 'активен' : 'неактивен'}
                    </span>

                    {canManage && branch.isActive ? (
                      <ArchiveBranchForm branchId={branch.id} branchName={branch.name} />
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-line pt-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
                    Залы {halls.length > 0 ? `(${halls.length})` : ''}
                  </h3>

                  {halls.length === 0 ? (
                    <p className="mt-2 text-xs text-muted">
                      Залов нет. Зал нужен, чтобы указывать место занятия в расписании.
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-2">
                      {halls.map((hall) => (
                        <HallRow key={hall.id} hall={hall} branches={branchOptions} />
                      ))}
                    </div>
                  )}

                  {/* Создание зала требует того же права, что и правка филиала. */}
                  {canManage && branch.isActive ? <CreateHallForm branchId={branch.id} /> : null}
                  {canManage && !branch.isActive ? (
                    <p className="mt-3 text-xs text-muted">
                      Филиал неактивен: залы в нем не создаются.
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>

        {canManage ? (
          <BranchForm />
        ) : (
          <Notice>Раздел доступен только для просмотра: нет права «branches.manage».</Notice>
        )}
      </div>
    </AppShell>
  );
}
