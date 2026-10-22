import { logoutAction } from '@/app/actions';
import { Icon, type IconName } from '@/components/icons';
import { NavLink } from '@/components/nav-link';
import { SectionTitle } from '@/components/section-title';
import type { CurrentUser } from '@/lib/server/session';

/**
 * Разделы навигации.
 *
 * `requiredPermissions` — права, хотя бы одно из которых открывает раздел. Это
 * только удобство: окончательная проверка всегда на backend (ADR-0006), но
 * ссылка на закрытый раздел заставляла бы тренера искать причину отказа.
 */
const NAVIGATION: readonly {
  href: string;
  label: string;
  icon: IconName;
  requiredPermissions?: readonly string[];
}[] = [
  { href: '/', label: 'Главная', icon: 'home' },
  { href: '/athletes', label: 'Ученики', icon: 'athletes' },
  { href: '/groups', label: 'Группы', icon: 'groups' },
  // Тренеры: карточка правится `branches.manage`, привязка аккаунта — `users.manage`.
  // Ссылка показывается тем, кто видит группы: без этого список тренеров не нужен.
  { href: '/trainers', label: 'Тренеры', icon: 'trainers', requiredPermissions: ['groups.view'] },
  { href: '/branches', label: 'Филиалы и залы', icon: 'halls' },
  { href: '/schedule', label: 'Расписание', icon: 'schedule' },
  // Посещаемость: сводка по группе за период. Отдельный раздел, потому что это
  // отчет для тренера и администратора, а не разметка конкретного занятия.
  {
    href: '/attendance',
    label: 'Посещаемость',
    icon: 'attendance',
    requiredPermissions: ['attendance.view'],
  },
  {
    href: '/finance',
    label: 'Оплаты',
    icon: 'finance',
    requiredPermissions: ['payments.view', 'freezes.view'],
  },
  // Новости без `requiredPermissions`: BR-011 — новости и комментарии видны всем
  // пользователям клуба, поэтому раздел не скрывается ни от кого (ADR-0011).
  { href: '/news', label: 'Новости', icon: 'news' },
  // Чаты требуют `chat.use`: это разрешение на функцию. Конкретная переписка
  // доступна только участникам, и решает это backend (ADR-0011).
  { href: '/chats', label: 'Чаты', icon: 'chats', requiredPermissions: ['chat.use'] },
  { href: '/users', label: 'Пользователи', icon: 'users' },
];

/**
 * Каркас админки по макету: тёмный сайдбар с разделами и светлая шапка с
 * пользователем.
 *
 * Сайдбар тёмный, чтобы рабочий интерфейс отличался от клиентского приложения;
 * активный раздел выделяется оранжевым — тем же акцентом, что в мобильном.
 */
export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const navigation = NAVIGATION.filter(
    (item) =>
      !item.requiredPermissions ||
      item.requiredPermissions.some((code) => user.permissions.includes(code)),
  );

  const displayName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const roleLabel =
    user.role === 'SUPERADMIN'
      ? 'Администратор'
      : user.role === 'STAFF'
        ? 'Сотрудник'
        : 'Участник';
  const initial = (user.firstName || user.email).slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink md:flex">
        <div className="flex items-center gap-2 px-6 py-6">
          <span className="text-lg font-extrabold tracking-[0.18em] text-white">OCTAGON</span>
          <span className="mb-0.5 h-[3px] w-6 rounded bg-accent" />
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-6">
          {navigation.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
        </nav>

        <div className="px-6 py-4 text-[11px] text-white/35">Версия 1.0.0</div>
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-10 border-b border-line bg-white">
          <div className="flex h-16 items-center justify-between gap-4 px-6">
            <SectionTitle />

            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-3 sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                  {initial}
                </span>
                <div className="leading-tight">
                  <p className="text-sm font-medium text-ink">{displayName}</p>
                  <p className="text-xs text-muted">{roleLabel}</p>
                </div>
              </div>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-card border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-canvas"
                >
                  <Icon name="logout" size={15} />
                  Выйти
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

/** Заголовок раздела с необязательным описанием и действиями. */
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
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
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
      ? 'border-danger/25 bg-danger/5 text-danger'
      : 'border-line bg-white text-muted';

  return (
    <div className={`rounded-card border px-4 py-3 text-sm ${classes}`} role="status">
      {children}
    </div>
  );
}
