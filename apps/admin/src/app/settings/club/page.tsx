import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

import { ClubProfileForm, type ClubProfileFormValues } from './club-profile-form';

export const metadata = {
  title: 'Профиль клуба — OCTAGON',
};

/**
 * Профиль клуба (K1, docs/26-admin-settings.md).
 *
 * Только безопасные параметры: название, логотип, контакты и часовой пояс.
 * Секреты и инфраструктура здесь не показываются и не редактируются — документ
 * прямо выводит их за пределы админки.
 *
 * Доступ закрыт на backend по роли (SuperadminGuard). Если сотрудник откроет
 * адрес напрямую, он увидит сообщение об отказе, а не пустую форму.
 */
export default async function ClubProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const isSuperAdmin = user.role === 'SUPERADMIN';
  const { accessToken } = await readTokens();

  const result = isSuperAdmin
    ? await apiFetch<ClubProfileFormValues>('/settings/club', { accessToken })
    : null;

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-ink"
        >
          <Icon name="chevron" size={14} className="rotate-180" />
          Настройки
        </Link>
      </div>

      <PageHeader
        title="Профиль клуба"
        description="Название, контакты и часовой пояс. Изменения записываются в журнал действий."
      />

      {!isSuperAdmin ? (
        <Notice tone="error">
          Раздел доступен только суперадминистратору: право не делегируется индивидуальными
          grants.
        </Notice>
      ) : !result?.ok ? (
        <Notice tone="error">
          {result ? describeError(result.error) : 'Не удалось загрузить профиль клуба.'}
        </Notice>
      ) : (
        <ClubProfileForm profile={result.data} />
      )}
    </AppShell>
  );
}
