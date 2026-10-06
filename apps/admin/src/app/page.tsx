import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatAmount } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Обзор — OCTAGON',
};

type Collection = { meta?: { total?: number } };

interface DebtorSummary {
  isDebtor: boolean;
  paidAmount: number;
  expectedAmount: number | null;
}

/**
 * Обзорный экран админки.
 *
 * Показывает состояние справочников и права текущего пользователя: без прав
 * разделы недоступны на backend, и администратору полезно видеть, что именно
 * ему разрешено (ADR-0006).
 *
 * Финансовая сводка показывается только с `payments.view` и только суммами:
 * обзор не должен превращаться в способ увидеть чужие долги без права (BR-010).
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const canViewFinance = user.permissions.includes('payments.view');
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const [branches, groups, athletes, debts] = await Promise.all([
    apiFetch<Collection>('/branches', { accessToken }),
    apiFetch<Collection>('/groups', { accessToken }),
    apiFetch<Collection>('/athletes', { accessToken }),
    canViewFinance
      ? apiFetch<DebtorSummary[]>(`/debts?year=${year}&month=${month}`, { accessToken })
      : Promise.resolve(null),
  ]);

  const sections = [
    { title: 'Филиалы', href: '/branches', result: branches },
    { title: 'Группы', href: '/groups', result: groups },
    { title: 'Спортсмены', href: '/athletes', result: athletes },
  ];

  const debtors = (debts?.ok ? debts.data : []).filter((row) => row.isDebtor);
  const debtTotal = debtors.reduce(
    (sum, row) => sum + Math.max((row.expectedAmount ?? 0) - row.paidAmount, 0),
    0,
  );

  return (
    <AppShell user={user}>
      <PageHeader title="Обзор" description="Справочники клуба и права текущего пользователя" />

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
              <p className="mt-1 text-xs text-red-600">{describeError(section.result.error)}</p>
            ) : null}
          </a>
        ))}
      </div>

      {canViewFinance ? (
        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Финансы текущего месяца</h2>
            <Link href="/finance" className="text-sm text-slate-500 underline hover:text-slate-900">
              Открыть финансы →
            </Link>
          </div>

          {debts && !debts.ok ? (
            <p className="mt-2 text-sm text-red-600">{describeError(debts.error)}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-8">
              <div>
                <p className="text-sm text-slate-500">Должников</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{debtors.length}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Недостает по ожидаемым суммам</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {formatAmount(debtTotal)}
                </p>
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-900">Права пользователя</h2>
        <p className="mt-1 text-sm text-slate-500">
          Роль {user.role}, прав: {user.permissions.length}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {user.permissions.map((code) => (
            <span key={code} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
              {code}
            </span>
          ))}
        </div>
      </section>

      {!branches.ok && !groups.ok && !athletes.ok ? (
        <div className="mt-8">
          <Notice tone="error">
            Не удалось получить данные. Проверьте, что backend API запущен и доступен по адресу из
            API_BASE_URL.
          </Notice>
        </div>
      ) : null}
    </AppShell>
  );
}
