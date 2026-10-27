import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { beltGradeLabel } from '@octagon/contracts';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { archiveAthleteAction, unlinkAccountAction } from '../actions';
import { LinkAccountForm } from '../athlete-forms';
import { CertificationsBlock, type CertificationValues } from '../certifications';

export const metadata = {
  title: 'Спортсмен — OCTAGON',
};

interface AthleteDetails {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  gender: string;
  status: string;
  rank: string | null;
  rankLabel: string | null;
  beltGrade: string;
  beltAwardedAt: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  group: { id: string; name: string } | null;
  trainer: { id: string; displayName: string } | null;
  branch: { id: string; name: string } | null;
  linkedAccounts: { userId: string; email: string; relation: string; isPrimary: boolean }[];
}

interface UserView {
  id: string;
  email: string;
  isActive: boolean;
}

const TABS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'attestations', label: 'Аттестации' },
  { key: 'payments', label: 'Оплаты' },
  { key: 'attendance', label: 'Посещаемость' },
  { key: 'history', label: 'История' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  return (
    { ACTIVE: 'Активен', FROZEN: 'Заморожен', ARCHIVED: 'В архиве' }[status] ?? status
  );
}

/**
 * Карточка спортсмена (#60).
 *
 * Просмотр и правка разделены: карточка показывает данные, редактирование — на
 * отдельном экране. Раньше форма была открыта всегда, блок аттестаций стоял выше
 * профиля, а «Сохранить» висело под длинным списком — понять, что это за человек
 * и что с ним происходит, было трудно.
 */
export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = TABS.some((item) => item.key === tab) ? (tab as TabKey) : 'profile';

  const { accessToken } = await readTokens();
  const canEdit = user.permissions.includes('athletes.edit');
  const canViewUsers = user.permissions.includes('users.manage');
  const canViewFinance = user.permissions.includes('payments.view');

  const [athlete, users, certifications] = await Promise.all([
    apiFetch<AthleteDetails>(`/athletes/${id}`, { accessToken }),
    canEdit && canViewUsers
      ? apiFetch<{ data: UserView[] } | UserView[]>('/users', { accessToken })
      : null,
    apiFetch<CertificationValues[]>(`/athletes/${id}/certifications`, { accessToken }),
  ]);

  if (!athlete.ok) {
    if (athlete.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Спортсмен" />
        <Notice tone="error">{describeError(athlete.error)}</Notice>
      </AppShell>
    );
  }

  const person = athlete.data;
  const allUsers: UserView[] = users?.ok
    ? Array.isArray(users.data)
      ? users.data
      : (users.data.data ?? [])
    : [];
  const linkedUserIds = new Set(person.linkedAccounts.map((account) => account.userId));
  const availableUsers = allUsers
    .filter((candidate) => candidate.isActive && !linkedUserIds.has(candidate.id))
    .map((candidate) => ({ id: candidate.id, email: candidate.email }));

  const history = certifications.ok ? certifications.data : [];
  const fullName = `${person.lastName} ${person.firstName}${
    person.middleName ? ` ${person.middleName}` : ''
  }`;

  return (
    <AppShell user={user}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link className="text-sm text-muted hover:text-ink" href="/athletes">
          ← Все спортсмены
        </Link>
        <span className="text-xs text-muted">Карточка · ID {person.id.slice(0, 8)}</span>
      </div>

      {/* Шапка: кто это и где занимается — до всяких форм. */}
      <section className="rounded-card border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink">{fullName}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <StatusBadge status={person.status} />
              <span>·</span>
              <span>{person.rankLabel ?? 'ступень не определена'}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEdit ? (
              <Link className={secondaryButtonClass} href={`/athletes/${person.id}/edit`}>
                Изменить
              </Link>
            ) : null}
            {canEdit ? (
              <Link
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
                href={`/athletes/${person.id}?tab=attestations#add-certification`}
              >
                + Аттестация
              </Link>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Fact label="Спортивная ступень" value={person.rankLabel ?? 'Не определена'} />
          <Fact
            label="Текущий пояс"
            value={beltGradeLabel(person.beltGrade) ?? person.beltGrade}
          />
          <Fact label="Группа" value={person.group?.name ?? 'Не назначена'} />
          <Fact label="Тренер" value={person.trainer?.displayName ?? 'Не назначен'} />
          <Fact label="Филиал" value={person.branch?.name ?? 'Не назначен'} />
        </dl>
      </section>

      {/* Вкладки: ссылки, а не состояние клиента — работают без JS и открываются по ссылке. */}
      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((item) => (
          <Link
            className={
              item.key === activeTab
                ? 'border-b-2 border-accent px-3 py-2 text-sm font-medium text-ink'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-ink'
            }
            href={`/athletes/${person.id}?tab=${item.key}`}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {activeTab === 'profile' ? (
            <ProfileTab athlete={person} canEdit={canEdit} history={history} />
          ) : null}

          {activeTab === 'attestations' ? (
            <CertificationsBlock
              athleteId={person.id}
              certifications={history}
              canEdit={canEdit}
            />
          ) : null}

          {activeTab === 'payments' ? (
            <section className="rounded-card border border-line bg-white p-5">
              <h2 className="text-sm font-semibold text-ink">Оплаты и задолженность</h2>
              {canViewFinance ? (
                <>
                  <p className="mt-1 text-sm text-muted">
                    Периоды, поступления и долг по этому спортсмену — в финансовом разделе.
                    Там же отметка оплаты и заморозки.
                  </p>
                  <Link
                    className={`${secondaryButtonClass} mt-3 inline-flex`}
                    href={`/finance/athletes/${person.id}`}
                  >
                    Открыть оплаты
                  </Link>
                </>
              ) : (
                <Notice tone="info">{describePermission('payments.view')}</Notice>
              )}
            </section>
          ) : null}

          {activeTab === 'attendance' ? (
            <section className="rounded-card border border-line bg-white p-5">
              <h2 className="text-sm font-semibold text-ink">Посещаемость</h2>
              <EmptyState
                title="Отдельной истории по спортсмену пока нет"
                description="Посещаемость ведётся по занятиям и группам. Сводка доступна в разделе «Посещаемость»."
                action={{ href: '/attendance', label: 'Перейти к посещаемости' }}
              />
            </section>
          ) : null}

          {activeTab === 'history' ? (
            <HistoryTab history={history} />
          ) : null}
        </div>

        {/* Правая колонка: на узком экране уходит под основное содержание. */}
        <aside className="space-y-6">
          <LinkedAccountsCard
            athleteId={person.id}
            accounts={person.linkedAccounts}
            availableUsers={availableUsers}
            canEdit={canEdit}
            canViewUsers={canViewUsers}
          />

          <section className="rounded-card border border-line bg-white p-5">
            <h2 className="text-sm font-semibold text-ink">Быстрые действия</h2>
            <div className="mt-3 flex flex-col gap-2">
              {canEdit ? (
                <Link className="text-sm text-accent hover:underline" href={`/athletes/${person.id}/edit`}>
                  Изменить профиль
                </Link>
              ) : null}
              {canEdit ? (
                <Link
                  className="text-sm text-accent hover:underline"
                  href={`/athletes/${person.id}?tab=attestations#add-certification`}
                >
                  Добавить аттестацию
                </Link>
              ) : null}
              <Link className="text-sm text-accent hover:underline" href="/competitions">
                Соревнования
              </Link>
            </div>
          </section>

          {canEdit && person.status !== 'ARCHIVED' ? (
            <section className="rounded-card border border-red-100 bg-red-50/40 p-5">
              <h2 className="text-sm font-semibold text-ink">Опасное действие</h2>
              <p className="mt-1 text-xs text-muted">
                Карточка исчезнет из справочников, статус станет «В архиве», история сохранится.
              </p>
              <form action={archiveAthleteAction} className="mt-3">
                <input type="hidden" name="athleteId" value={person.id} />
                <button
                  className="rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                  type="submit"
                >
                  Архивировать
                </button>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}

function ProfileTab({
  athlete,
  canEdit,
  history,
}: {
  athlete: AthleteDetails;
  canEdit: boolean;
  history: CertificationValues[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-card border border-line bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Основные данные</h2>
          {canEdit ? (
            <Link className="text-sm text-accent hover:underline" href={`/athletes/${athlete.id}/edit`}>
              Изменить
            </Link>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Fact label="ФИО" value={`${athlete.lastName} ${athlete.firstName} ${athlete.middleName ?? ''}`.trim()} />
          <Fact label="Дата рождения" value={formatDate(athlete.birthDate)} />
          <Fact label="Телефон" value={athlete.phone ?? 'Не указан'} />
          <Fact label="Электронная почта" value={athlete.email ?? 'Не указана'} />
          <Fact label="Статус" value={statusLabel(athlete.status)} />
          <Fact label="Филиал" value={athlete.branch?.name ?? 'Не назначен'} />
          <Fact label="Группа" value={athlete.group?.name ?? 'Не назначена'} />
          <Fact label="Тренер" value={athlete.trainer?.displayName ?? 'Не назначен'} />
        </dl>

        {athlete.notes ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-xs uppercase tracking-wide text-muted">Заметки клуба</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{athlete.notes}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Спортивный статус</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Fact label="Текущая ступень" value={athlete.rankLabel ?? 'Не определена'} />
          <Fact
            label="Текущий пояс"
            value={beltGradeLabel(athlete.beltGrade) ?? athlete.beltGrade}
          />
        </div>

        <div className="mt-5">
          <p className="text-xs uppercase tracking-wide text-muted">История спортивного роста</p>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Аттестаций пока нет.</p>
          ) : (
            <ol className="mt-2 space-y-2">
              {history.slice(0, 5).map((item) => (
                <li className="flex flex-wrap items-center gap-2 text-sm" key={item.id}>
                  <span className="text-muted">{formatDate(item.certifiedOn)}</span>
                  <span className="font-medium text-ink">
                    {item.rankLabel ?? item.stageLabel}
                  </span>
                  <span className="text-muted">
                    · {beltGradeLabel(item.beltGrade) ?? item.beltGrade}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  );
}

function HistoryTab({ history }: { history: CertificationValues[] }) {
  if (history.length === 0) {
    return (
      <section className="rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">История</h2>
        <EmptyState
          title="Событий пока нет"
          description="Здесь появятся аттестации и изменения ступени. Сейчас их нет."
        />
      </section>
    );
  }

  return (
    <section className="rounded-card border border-line bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">История спортивного роста</h2>
      <table className="mt-3 w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2">Дата</th>
            <th className="py-2">Ступень</th>
            <th className="py-2">Пояс</th>
            <th className="py-2">Примечание</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item) => (
            <tr className="border-b border-line last:border-0" key={item.id}>
              <td className="py-2">{formatDate(item.certifiedOn)}</td>
              <td className="py-2 font-medium">{item.rankLabel ?? item.stageLabel}</td>
              <td className="py-2 text-muted">{beltGradeLabel(item.beltGrade) ?? item.beltGrade}</td>
              <td className="py-2 text-muted">{item.note ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LinkedAccountsCard({
  athleteId,
  accounts,
  availableUsers,
  canEdit,
  canViewUsers,
}: {
  athleteId: string;
  accounts: AthleteDetails['linkedAccounts'];
  availableUsers: { id: string; email: string }[];
  canEdit: boolean;
  canViewUsers: boolean;
}) {
  return (
    <section className="rounded-card border border-line bg-white p-5">
      <h2 className="text-sm font-semibold text-ink">Связанные аккаунты</h2>
      <p className="mt-1 text-xs text-muted">
        Через аккаунт родитель видит спортсмена в приложении.
      </p>

      {accounts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Связанных аккаунтов нет.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {accounts.map((account) => (
            <li className="text-sm" key={account.userId}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-ink">{account.email}</p>
                  <p className="text-xs text-muted">
                    {account.relation}
                    {account.isPrimary ? ' · основной' : ''}
                  </p>
                </div>
                {canEdit ? (
                  <form action={unlinkAccountAction}>
                    <input type="hidden" name="athleteId" value={athleteId} />
                    <input type="hidden" name="userId" value={account.userId} />
                    <button className="text-xs text-muted underline hover:text-red-700" type="submit">
                      Снять
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <div className="mt-4 border-t border-line pt-4">
          {!canViewUsers ? (
            <p className="text-xs text-muted">
              Чтобы связать аккаунт, нужен доступ к списку пользователей (
              {describePermission('users.manage')}).
            </p>
          ) : availableUsers.length > 0 ? (
            <LinkAccountForm athleteId={athleteId} users={availableUsers} />
          ) : (
            <p className="text-xs text-muted">
              Свободных аккаунтов нет: все активные пользователи уже связаны.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'FROZEN'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-neutral-100 text-neutral-600';

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}
