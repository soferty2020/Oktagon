import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { InviteForm } from './invite-form';

export const metadata = {
  title: 'Приглашения — OCTAGON',
};

interface UserInviteView {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Приглашения пользователей (B3, docs/05-user-stories.md).
 *
 * Доступен с правом `users.manage`: приглашение — это выдача доступа, и
 * отдельного права на просмотр приглашений в каталоге нет
 * (docs/04-roles-permissions.md).
 *
 * Письмо не отправляется: провайдер доставки не выбран
 * (docs/25-open-questions.md). Экран не делает вид, что приглашение «ушло» — он
 * отдает ссылку и говорит, что передать ее нужно вручную. Так администратор не
 * ждет письма, которого не будет.
 */
export default async function InvitesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const canManage = user.permissions.includes('users.manage');
  if (!canManage) {
    return (
      <AppShell user={user}>
        <PageHeader title="Приглашения" />
        <Notice>
          Раздел доступен с правом «users.manage»: приглашение выдает доступ в систему.
        </Notice>
      </AppShell>
    );
  }

  const { accessToken } = await readTokens();
  const invites = await apiFetch<UserInviteView[]>('/users/invites', { accessToken });
  const pending = invites.ok ? invites.data : [];

  return (
    <AppShell user={user}>
      <PageHeader
        title="Приглашения"
        description="Саморегистрации нет: пользователь попадает в систему по приглашению администратора."
        actions={
          <Link href="/users" className="text-sm text-muted hover:text-ink">
            ← Пользователи
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <InviteForm />

        <section className="rounded-card border border-line bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Действующие приглашения</h2>
            <p className="text-xs text-muted">Использованные и истекшие не показываются</p>
          </div>

          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Действует до</th>
                <th className="px-4 py-3">Создано</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6">
                    <Notice>
                      {invites.ok
                        ? 'Действующих приглашений нет. Создайте приглашение — ссылка появится здесь и ее нужно передать вручную.'
                        : describeError(invites.error)}
                    </Notice>
                  </td>
                </tr>
              ) : (
                pending.map((invite) => (
                  <tr key={invite.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{invite.email}</td>
                    <td className="px-4 py-3 text-muted">{invite.role}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatMoment(invite.expiresAt)}
                      {isExpiringSoon(invite.expiresAt) ? (
                        <span className="ml-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                          скоро истекает
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatMoment(invite.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {pending.length > 0 ? (
            <p className="border-t border-line px-4 py-3 text-xs text-muted">
              Ссылку с токеном получить повторно нельзя: в базе хранится только ее хеш. Если ссылка
              потеряна, создайте приглашение заново — предыдущее будет погашено.
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

/** Момент UTC в виде «01.04.2026 18:00». */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/**
 * Приглашение истекает в ближайшие сутки.
 *
 * Подсветка нужна потому, что ссылку передают вручную и не сразу: если срок
 * кончается, администратору проще выписать новую, чем ждать отказа.
 */
function isExpiringSoon(iso: string): boolean {
  const expires = new Date(iso).getTime();
  if (Number.isNaN(expires)) {
    return false;
  }
  return expires - Date.now() < 24 * 3600 * 1000;
}
