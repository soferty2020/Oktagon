import { describePermission } from '@/lib/permissions';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { statusLabel } from '@/components/status-badge';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import {
  ArchiveTrainerForm,
  CreateTrainerForm,
  EditTrainerForm,
  LinkAccountForm,
  UnlinkAccountForm,
} from './trainer-forms';

export const metadata = {
  title: 'Тренеры — OCTAGON',
};

interface TrainerView {
  id: string;
  userId: string | null;
  displayName: string;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
}

interface UserView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
}

interface PaginatedUsers {
  items: UserView[];
}

interface GroupView {
  id: string;
  name: string;
}

/**
 * Тренеры клуба.
 *
 * Раздел показывает то, чего не было видно раньше: **связан ли профиль с
 * аккаунтом**. Это не деталь оформления, а рабочий статус: тренер без аккаунта не
 * попадает в чаты своих групп (состав вычисляется по `TrainerProfile.userId`), не
 * видит расписание и не может отмечать посещаемость. Раньше связать аккаунт можно
 * было только при создании профиля, и на практике связь рвалась: профиль заводили
 * заранее, а сотрудник появлялся позже.
 *
 * Права разделены: карточка правится `branches.manage`, привязка аккаунта —
 * `users.manage`. Интерфейс показывает формы по возможностям пользователя, но
 * окончательно решает backend.
 */
export default async function TrainersPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const canView = user.permissions.includes('groups.view');
  if (!canView) {
    return (
      <AppShell user={user}>
        <PageHeader title="Тренеры" />
        <Notice>Раздел доступен с правом: {describePermission('groups.view')}.</Notice>
      </AppShell>
    );
  }

  const { accessToken } = await readTokens();
  const trainers = await apiFetch<TrainerView[]>('/trainers', { accessToken });

  const canEditCard = user.permissions.includes('branches.manage');
  // Привязка аккаунта — операция с учетной записью, поэтому отдельное право.
  const canManageAccounts = user.permissions.includes('users.manage');

  // Аккаунты нужны только для привязки: список пользователей требует users.manage.
  const users = canManageAccounts
    ? await apiFetch<PaginatedUsers>('/users?perPage=100', { accessToken })
    : null;

  // Группы показываются, чтобы было видно, где тренер занят: без этого решение
  // «снимать ли связь» принималось бы вслепую.
  const groups = user.permissions.includes('groups.view')
    ? await apiFetch<GroupView[]>('/groups', { accessToken })
    : null;

  const freeAccounts = (users?.ok ? users.data.items : [])
    .filter(
      (candidate) =>
        (candidate.role === 'STAFF' || candidate.role === 'SUPERADMIN') &&
        candidate.status === 'ACTIVE',
    )
    // Занятые аккаунты не предлагаются: связь уникальна, и выбор привел бы к отказу.
    .filter(
      (candidate) =>
        !(trainers.ok ? trainers.data : []).some((trainer) => trainer.userId === candidate.id),
    )
    .map((candidate) => ({
      id: candidate.id,
      label: `${candidate.lastName} ${candidate.firstName} — ${candidate.email} (${statusLabel(candidate.role)})`,
    }));

  const list = trainers.ok ? trainers.data : [];

  return (
    <AppShell user={user}>
      <PageHeader title="Тренеры" description="Профили тренеров и их доступ в систему." />

      <div className={`grid gap-6 ${canEditCard ? 'lg:grid-cols-[1.6fr_1fr]' : ''}`}>
        <div className="flex flex-col gap-4">
          {!trainers.ok ? <Notice tone="error">{describeError(trainers.error)}</Notice> : null}

          {trainers.ok && list.length === 0 ? (
            <Notice>
              Тренеров пока нет. {canEditCard ? 'Добавьте первого — форма справа.' : ''}
            </Notice>
          ) : null}

          {list.map((trainer) => (
            <article key={trainer.id} className="rounded-card border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-ink">
                    {trainer.displayName}
                    {!trainer.isActive ? (
                      <span className="ml-2 rounded-full bg-canvas px-2 py-1 text-xs text-muted">
                        неактивен
                      </span>
                    ) : null}
                  </h2>
                  {trainer.phone ? (
                    <p className="mt-1 text-xs text-muted">{trainer.phone}</p>
                  ) : null}
                </div>

                {/* Доступ в систему — главное, что нужно видеть на этой странице. */}
                {trainer.userId ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    аккаунт привязан
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                    без аккаунта: не войдет, не попадет в чаты
                  </span>
                )}
              </div>

              {trainer.bio ? (
                <p className="mt-2 whitespace-pre-line text-sm text-ink">{trainer.bio}</p>
              ) : null}

              {canManageAccounts ? (
                <div className="mt-4 border-t border-line pt-4">
                  {trainer.userId ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xs text-muted">
                        Вход в систему разрешен. Снятие связи не удаляет профиль и историю занятий.
                      </p>
                      <UnlinkAccountForm trainerId={trainer.id} />
                    </div>
                  ) : (
                    <LinkAccountForm trainerId={trainer.id} accounts={freeAccounts} />
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-muted">
                  Привязка аккаунта требует права {describePermission('users.manage')}.
                </p>
              )}

              {canEditCard ? (
                <details className="mt-4 border-t border-line pt-4">
                  <summary className="cursor-pointer text-xs text-muted hover:text-ink">
                    Изменить карточку
                  </summary>
                  <div className="mt-3">
                    <EditTrainerForm trainer={trainer} />
                  </div>
                  <div className="mt-3">
                    <ArchiveTrainerForm trainerId={trainer.id} />
                  </div>
                </details>
              ) : null}
            </article>
          ))}

          {groups?.ok && groups.data.length > 0 ? (
            <section className="rounded-card border border-line bg-white p-5">
              <h2 className="text-sm font-semibold text-ink">Группы клуба</h2>
              <p className="mt-1 text-xs text-muted">
                Тренер назначается на группу в ее карточке. Без аккаунта он не увидит занятия этой
                группы.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {groups.data.map((group) => (
                  <li
                    key={group.id}
                    className="rounded-full bg-canvas px-3 py-1 text-xs text-ink"
                  >
                    {group.name}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {canEditCard ? <CreateTrainerForm /> : null}
      </div>
    </AppShell>
  );
}
