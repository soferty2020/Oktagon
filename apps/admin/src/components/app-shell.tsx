import Link from 'next/link';

import { logoutAction } from '@/app/actions';
import type { CurrentUser } from '@/lib/server/session';

const NAVIGATION = [
  { href: '/', label: 'Обзор' },
  { href: '/branches', label: 'Филиалы' },
  { href: '/groups', label: 'Группы' },
  { href: '/athletes', label: 'Спортсмены' },
  { href: '/schedule', label: 'Расписание' },
  { href: '/users', label: 'Пользователи' },
] as const;

/** Каркас страницы админки: шапка с пользователем и навигация по разделам. */
export function AppShell({
  user,
  children,
}: {
  user: CurrentUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="text-sm font-semibold tracking-wide text-slate-900">OCTAGON</span>
            <nav className="flex items-center gap-4">
              {NAVIGATION.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-slate-600 hover:text-slate-900"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">
              {user.firstName} {user.lastName} · {user.role}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

/** Заголовок раздела с необязательным описанием. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

/** Сообщение об ошибке или пустом состоянии. */
export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error';
  children: React.ReactNode;
}) {
  const classes =
    tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-slate-200 bg-white text-slate-600';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${classes}`} role="status">
      {children}
    </div>
  );
}
