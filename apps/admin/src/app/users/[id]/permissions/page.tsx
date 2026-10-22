import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { PERMISSIONS, describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { revokePermissionAction } from '../../actions';
import { GrantPermissionForm } from '../../permission-form';

export const metadata = {
  title: 'Права пользователя — OCTAGON',
};

interface GrantView {
  code: string;
  grantedAt: string;
  expiresAt: string | null;
  grantedById: string | null;
}

interface UserPermissionsView {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  scopeAllGroups: boolean;
  rolePermissions: string[];
  grants: GrantView[];
  effective: string[];
}

/**
 * Права пользователя (B5, ADR-0006).
 *
 * Права роли и индивидуальные выдачи показаны раздельно: отозвать можно только
 * выданное лично, а право роли отзывается сменой роли. Если это смешать,
 * администратор будет искать кнопку отзыва там, где ее не должно быть.
 */
export default async function UserPermissionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const permissions = await apiFetch<UserPermissionsView>(`/users/${id}/permissions`, {
    accessToken,
  });

  if (!permissions.ok) {
    if (permissions.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={currentUser}>
        <PageHeader title="Права пользователя" />
        <Notice tone="error">{describeError(permissions.error)}</Notice>
      </AppShell>
    );
  }

  const data = permissions.data;
  const labels = Object.fromEntries(
    PERMISSIONS.map((code) => [code, describePermission(code)]),
  );

  // Выдавать лично можно только то, чего нет ни в роли, ни в выдачах.
  const effectiveSet = new Set(data.effective);
  const available = PERMISSIONS.filter((code) => !effectiveSet.has(code));

  return (
    <AppShell user={currentUser}>
      <PageHeader
        title={`${data.lastName} ${data.firstName}`}
        description={`${data.email} · роль ${data.role} · доступ: ${
          data.scopeAllGroups ? 'все группы' : 'только назначенные'
        }`}
        actions={
          <Link href="/users" className="text-sm text-muted hover:text-ink">
            ← Все пользователи
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">
            Права роли ({data.rolePermissions.length})
          </h2>
          <p className="mt-1 text-xs text-muted">
            Определяются ролью и не отзываются по отдельности.
          </p>
          <ul className="mt-3 flex flex-col gap-1">
            {data.rolePermissions.length === 0 ? (
              <li className="text-sm text-muted">
                Роль не дает прав: доступ определяется только ресурсами
              </li>
            ) : (
              data.rolePermissions.map((code) => (
                <li key={code} className="text-sm text-ink">
                  {labels[code] ?? code}
                  <span className="ml-2 text-xs text-muted">{code}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">
            Выдано лично ({data.grants.length})
          </h2>
          <p className="mt-1 text-xs text-muted">
            Эти права можно отозвать, не меняя роль.
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {data.grants.length === 0 ? (
              <li className="text-sm text-muted">Индивидуальных прав нет</li>
            ) : (
              data.grants.map((grant) => (
                <li
                  key={grant.code}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-ink">
                    {labels[grant.code] ?? grant.code}
                    <span className="ml-2 text-xs text-muted">{grant.code}</span>
                    {grant.expiresAt ? (
                      <span className="ml-2 text-xs text-muted">
                        до {grant.expiresAt.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="ml-2 text-xs text-muted">бессрочно</span>
                    )}
                  </span>
                  <form action={revokePermissionAction}>
                    <input type="hidden" name="userId" value={data.userId} />
                    <input type="hidden" name="code" value={grant.code} />
                    <button
                      type="submit"
                      className="text-xs text-muted underline hover:text-red-700"
                    >
                      Отозвать
                    </button>
                  </form>
                </li>
              ))
            )}
          </ul>

          <div className="mt-4 border-t border-line pt-4">
            <GrantPermissionForm userId={data.userId} available={available} labels={labels} />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">
          Итоговый набор прав ({data.effective.length})
        </h2>
        <p className="mt-1 text-xs text-muted">
          Роль плюс действующие индивидуальные выдачи; именно это проверяет backend.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.effective.map((code) => (
            <span
              key={code}
              className="rounded-full bg-canvas px-3 py-1 text-xs text-ink"
            >
              {labels[code] ?? code}
            </span>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
