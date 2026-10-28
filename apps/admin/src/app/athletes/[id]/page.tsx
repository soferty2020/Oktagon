import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { beltGradeLabel } from '@octagon/contracts';

import { AppShell, Notice } from '@/components/app-shell';
import { BeltBadge } from '@/components/belt-badge';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { archiveAthleteAction, unlinkAccountAction } from '../actions';
import { LinkAccountForm } from '../athlete-forms';
import { CertificationsBlock, type CertificationValues } from '../certifications';
import { Icon, type IconName } from './icons';
import { LinkCodeCard } from './link-code';

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
  hall: { id: string; name: string } | null;
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

/** «с мая 2025» — в строке статуса месяц и год читаются легче полной даты. */
function monthYear(value: string): string {
  const date = new Date(value);
  return `${date.toLocaleDateString('ru-RU', { month: 'long' })} ${date.getFullYear()}`;
}

function statusLabel(status: string): string {
  return { ACTIVE: 'Активен', FROZEN: 'Заморожен', ARCHIVED: 'В архиве' }[status] ?? status;
}

function initials(firstName: string, lastName: string): string {
  return `${lastName.slice(0, 1)}${firstName.slice(0, 1)}`.toUpperCase();
}

/** Ступень числом: «10 кю» — число крупно, «кю» тихо. */
function splitRank(rankLabel: string | null): { number: string; suffix: string } {
  if (!rankLabel) {
    return { number: '—', suffix: '' };
  }

  const match = rankLabel.match(/^(\d+)\s*(.*)$/);

  return match ? { number: match[1], suffix: match[2] } : { number: rankLabel, suffix: '' };
}

/**
 * Карточка спортсмена (#60, утверждённый макет).
 *
 * Профиль — витрина: имя, статус, ступень и пояс видны сразу, без формы.
 * Группа, тренер и филиал живут только в шапке: в теле они не повторяются,
 * иначе одни и те же данные читаются дважды на одном экране.
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
  const rank = splitRank(person.rankLabel);

  return (
    <AppShell user={user}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link className="text-sm text-muted hover:text-ink" href="/athletes">
          ← Все спортсмены
        </Link>
        <span className="text-sm text-muted">{fullName}</span>
      </div>

      <ProfileHero athlete={person} canEdit={canEdit} fullName={fullName} rank={rank} />

      <nav className="mt-6 flex flex-wrap gap-1 rounded-xl bg-[#F1EFEC] p-1">
        {TABS.map((item) => (
          <Link
            className={
              item.key === activeTab
                ? 'rounded-lg bg-white px-4 py-2 text-sm font-medium text-ink shadow-sm'
                : 'rounded-lg px-4 py-2 text-sm text-muted hover:text-ink'
            }
            href={`/athletes/${person.id}?tab=${item.key}`}
            key={item.key}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          {activeTab === 'profile' ? (
            <>
              <ContactsCard athlete={person} />
              <HistoryCard history={history} />
            </>
          ) : null}

          {activeTab === 'attestations' ? (
            <CertificationsBlock
              athleteId={person.id}
              certifications={history}
              canEdit={canEdit}
            />
          ) : null}

          {activeTab === 'payments' ? (
            <section className="rounded-card border border-line bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Оплаты и задолженность</h2>
              {canViewFinance ? (
                <>
                  <p className="mt-2 text-sm text-muted">
                    Периоды, поступления и долг по спортсмену — в финансовом разделе.
                  </p>
                  <Link
                    className={`${secondaryButtonClass} mt-4 inline-flex`}
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
            <section className="rounded-card border border-line bg-white p-6">
              <h2 className="text-base font-semibold text-ink">Посещаемость</h2>
              <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                История занятий появится, когда API начнёт отдавать её по спортсмену.
                Сейчас посещаемость ведётся по занятиям и группам.
              </p>
              <Link className={`${secondaryButtonClass} mt-4 inline-flex`} href="/attendance">
                Открыть посещаемость
              </Link>
            </section>
          ) : null}

          {activeTab === 'history' ? <HistoryCard history={history} /> : null}
        </div>

        <aside className="space-y-6">
          <AccountsCard
            accounts={person.linkedAccounts}
            athleteId={person.id}
            availableUsers={availableUsers}
            canEdit={canEdit}
            canViewUsers={canViewUsers}
          />

          <section className="rounded-card border border-line bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Действия</h2>
            <div className="mt-4 flex flex-col gap-3">
              {canEdit ? (
                <ActionLink href={`/athletes/${person.id}/edit`} icon="pencil" label="Изменить профиль" />
              ) : null}
              {canEdit ? (
                <ActionLink
                  href={`/athletes/${person.id}?tab=attestations#add-certification`}
                  icon="plus"
                  label="Добавить аттестацию"
                />
              ) : null}
              <ActionLink href="/competitions" icon="trophy" label="Назначить на соревнование" />
              {canEdit ? (
                <ActionLink
                  href="/athletes/link-requests"
                  icon="group"
                  label="Заявки на привязку"
                />
              ) : null}
            </div>
          </section>

          {canEdit ? <LinkCodeCard athleteId={person.id} /> : null}

          {canEdit && person.status !== 'ARCHIVED' ? (
            <section className="rounded-card border border-[#F6DADA] bg-[#FDF3F3] p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[#8A2B2B]">
                <Icon className="h-4 w-4" name="archive" />
                Архивирование
              </h2>
              <p className="mt-2 text-xs text-[#A05A5A]">
                Карточка уйдёт из справочников, история сохранится.
              </p>
              <form action={archiveAthleteAction} className="mt-4">
                <input name="athleteId" type="hidden" value={person.id} />
                <button
                  className="rounded-lg border border-[#E3B4B4] bg-white px-4 py-2 text-xs text-[#8A2B2B] hover:bg-[#FDF3F3]"
                  type="submit"
                >
                  В архив
                </button>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}

/** Шапка профиля: имя, статус, группа, ступень и пояс. */
function ProfileHero({
  athlete,
  canEdit,
  fullName,
  rank,
}: {
  athlete: AthleteDetails;
  canEdit: boolean;
  fullName: string;
  rank: { number: string; suffix: string };
}) {
  return (
    <section className="relative overflow-hidden rounded-[18px] border border-warm-edge bg-warm p-7">
      {/* Мягкие круги: тёплый фон не должен быть плоской заливкой. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-72 h-64 w-64 rounded-full bg-[#FFF1E4]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 top-24 h-52 w-52 rounded-full bg-[#FFEBD9]"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-5">
          <span className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full bg-accent-warm text-2xl font-bold text-accent-text">
            {initials(athlete.firstName, athlete.lastName)}
          </span>

          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight text-ink">{fullName}</h1>

            <p className="mt-2 flex items-center gap-2 text-sm text-[#5A5A62]">
              <span
                className={`h-2 w-2 rounded-full ${
                  athlete.status === 'ACTIVE' ? 'bg-success' : 'bg-warning'
                }`}
              />
              {statusLabel(athlete.status)}, с {monthYear(athlete.createdAt)}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {/* Плашка ведёт туда, где это меняется: группа — в раздел групп,
                  зал — в залы. «Не в группе» открывает форму привязки с уже
                  выбранным спортсменом (#68). */}
              <Chip
                action={athlete.group ? undefined : 'Привязать'}
                href={athlete.group ? `/groups/${athlete.group.id}` : `/groups?assign=${athlete.id}`}
                icon="group"
                label={athlete.group?.name ?? 'Не в группе'}
              />
              <Chip
                action={athlete.hall ? undefined : 'Выбрать'}
                href={athlete.hall ? `/halls#hall-${athlete.hall.id}` : '/halls'}
                icon="pin"
                label={athlete.hall?.name ?? 'Зал не назначен'}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-5">
          <div className="flex items-start gap-8">
            <div>
              <p className="text-xs text-[#8A7A6A]">Ступень</p>
              <p className="mt-1 flex items-baseline gap-1">
                <span className="text-[56px] font-bold leading-none text-accent">
                  {rank.number}
                </span>
                {rank.suffix ? (
                  <span className="text-lg font-medium text-[#A08A78]">{rank.suffix}</span>
                ) : null}
              </p>
            </div>

            <div>
              <p className="text-xs text-[#8A7A6A]">Пояс</p>
              <div className="mt-2">
                {/* Цвет бейджа — цвет пояса, а не акцент темы (#73). */}
                <BeltBadge code={athlete.beltGrade} />
              </div>
            </div>
          </div>

          {canEdit ? (
            <div className="flex gap-3">
              <Link
                className="rounded-[10px] border border-[#E2D5C8] bg-white px-6 py-2.5 text-[13px] font-medium text-ink hover:bg-white/70"
                href={`/athletes/${athlete.id}/edit`}
              >
                Изменить
              </Link>
              <Link
                className="rounded-[10px] bg-accent px-6 py-2.5 text-[13px] font-medium text-white hover:bg-accent/90"
                href={`/athletes/${athlete.id}?tab=attestations#add-certification`}
              >
                + Аттестация
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Плашка с фактом (группа, зал) — и ссылкой туда, где факт меняется (#68).
 *
 * Плашка без значения — не тупик: рядом с ней действие («Привязать»,
 * «Выбрать»), и клик открывает форму привязки, а не справочник.
 */
function Chip({
  icon,
  label,
  href,
  action,
}: {
  icon: IconName;
  label: string;
  href?: string;
  action?: string;
}) {
  const className =
    'inline-flex items-center gap-3 rounded-full border border-line bg-white py-2 pl-3.5 pr-4 text-xs text-[#3A3A42]';

  const content = (
    <>
      <Icon className="h-4 w-4 text-[#8A8A92]" name={icon} />
      {label}
      {action ? <span className="text-accent-text">{action}</span> : null}
    </>
  );

  if (!href) {
    return <span className={className}>{content}</span>;
  }

  return (
    <Link className={`${className} transition-colors hover:border-accent`} href={href}>
      {content}
    </Link>
  );
}

/** Контакты: строки с иконками. Группа, тренер и филиал здесь не повторяются. */
function ContactsCard({ athlete }: { athlete: AthleteDetails }) {
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'calendar', label: 'Дата рождения', value: formatDate(athlete.birthDate) },
    { icon: 'phone', label: 'Телефон', value: athlete.phone ?? 'Не указан' },
    { icon: 'mail', label: 'Почта', value: athlete.email ?? 'Не указана' },
  ];

  return (
    <section className="rounded-card border border-line bg-white p-6">
      <h2 className="text-base font-semibold text-ink">Контакты</h2>
      <p className="mt-1 text-xs text-muted">Как связаться с родителем</p>

      <dl className="mt-4">
        {rows.map((row, index) => (
          <div
            className={`flex items-center gap-4 py-4 ${
              index < rows.length - 1 ? 'border-b border-line' : ''
            }`}
            key={row.label}
          >
            <Icon className="h-[18px] w-[18px] shrink-0 text-[#8A8A92]" name={row.icon} />
            <div className="min-w-0 flex-1">
              <dt className="text-xs text-muted">{row.label}</dt>
              <dd className="mt-1 text-[15px] font-medium text-ink">{row.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** История ступеней: таймлайн, текущая ступень отмечена. */
function HistoryCard({ history }: { history: CertificationValues[] }) {
  return (
    <section className="rounded-card border border-line bg-white p-6">
      <h2 className="text-base font-semibold text-ink">История ступеней</h2>
      <p className="mt-1 text-xs text-muted">От белого пояса до текущей ступени</p>

      {history.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Аттестаций пока нет — после первой здесь появится путь.
        </p>
      ) : (
        <ol className="mt-5">
          {history.map((item, index) => (
            <li className="relative flex gap-4 pb-6 last:pb-0" key={item.id}>
              <span className="relative flex w-3 flex-col items-center">
                <span
                  className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${
                    index === 0 ? 'bg-accent' : 'bg-line'
                  }`}
                />
                {index < history.length - 1 ? (
                  <span className="mt-1 w-px flex-1 bg-line" />
                ) : null}
              </span>

              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1 pb-1">
                <span className="text-[15px] font-semibold text-ink">
                  {item.rankLabel ?? item.stageLabel}
                </span>
                <span className="text-[13px] text-muted">
                  {beltGradeLabel(item.beltGrade) ?? item.beltGrade}
                </span>
                <span className="text-[13px] text-muted">{formatDate(item.certifiedOn)}</span>
                {index === 0 ? (
                  <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-text">
                    сейчас
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function AccountsCard({
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
    <section className="rounded-card border border-line bg-white p-6">
      <h2 className="text-base font-semibold text-ink">Связанные аккаунты</h2>

      {accounts.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Аккаунтов нет.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {accounts.map((account) => (
            <li
              className="flex items-start justify-between gap-3 rounded-lg border-l-[3px] border-accent bg-[#FAFAFB] px-3 py-3"
              key={account.userId}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{account.email}</p>
                <p className="mt-1 text-xs text-muted">
                  {account.relation}
                  {account.isPrimary ? ', основной' : ''}
                </p>
              </div>
              {canEdit ? (
                <form action={unlinkAccountAction}>
                  <input name="athleteId" type="hidden" value={athleteId} />
                  <input name="userId" type="hidden" value={account.userId} />
                  <button className="text-xs text-muted underline hover:text-red-700" type="submit">
                    Снять
                  </button>
                </form>
              ) : null}
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
            <p className="text-xs text-muted">Свободных аккаунтов нет.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ActionLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  return (
    <Link
      className="flex items-center gap-3 text-[13px] text-[#2A2A32] hover:text-accent-text"
      href={href}
    >
      <Icon className="h-[17px] w-[17px] text-muted" name={icon} />
      {label}
    </Link>
  );
}
