import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { Icon } from '@/components/icons';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

import { DebtRulesForm, type DebtRulesFormValues } from './debt-rules-form';

export const metadata = {
  title: 'Финансовые правила — OCTAGON',
};

interface DebtRulesVersion extends DebtRulesFormValues {
  createdBy: { id: string; email: string } | null;
  createdAt: string;
  isDefault: boolean;
}

/**
 * Финансовые правила клуба (K5, docs/26-admin-settings.md, ADR-0014).
 *
 * Только суперадминистратор: правило меняет расчет задолженности, а это
 * финансовое решение. Значения по умолчанию воспроизводят BR-004.
 */
export default async function DebtRulesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const isSuperAdmin = user.role === 'SUPERADMIN';
  const { accessToken } = await readTokens();

  const [current, versions] = isSuperAdmin
    ? await Promise.all([
        apiFetch<DebtRulesVersion>('/settings/finance/debt-rules', { accessToken }),
        apiFetch<DebtRulesVersion[]>('/settings/finance/debt-rules/versions', { accessToken }),
      ])
    : [null, null];

  const month = new Date().toISOString().slice(0, 7);

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
        title="Финансовые правила"
        description="Как считается задолженность. Каждое изменение — новая версия с предпросмотром."
      />

      {!isSuperAdmin ? (
        <Notice tone="error">
          Раздел доступен только суперадминистратору: финансовое правило не делегируется.
        </Notice>
      ) : !current?.ok ? (
        <Notice tone="error">
          {current ? describeError(current.error) : 'Не удалось загрузить правило.'}
        </Notice>
      ) : (
        <>
          <Notice>
            По умолчанию действует BR-004. Версия {current.data.version} вступила с{' '}
            {current.data.effectiveFrom.slice(0, 7)}. Прошлые месяцы не пересчитываются.
          </Notice>

          <DebtRulesForm current={current.data} defaultMonth={month} />

          {versions?.ok && versions.data.length > 1 ? (
            <section className="mt-6 max-w-3xl rounded-card border border-line bg-white p-5">
              <h2 className="text-sm font-semibold text-ink">История версий</h2>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {versions.data.map((version) => (
                  <li key={version.version} className="flex justify-between gap-3 border-b border-line py-1 last:border-0">
                    <span>
                      v{version.version} · с {version.effectiveFrom.slice(0, 7)}
                      {version.isDefault ? ' · BR-004' : ''}
                    </span>
                    <span className="text-muted">{version.note ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
