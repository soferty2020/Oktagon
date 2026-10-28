import Image from 'next/image';
import { logoutAction } from '@/app/actions';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Icon } from '@/components/icons';
import { MobileNav } from '@/components/mobile-nav';
import { NavLink } from '@/components/nav-link';
import type { CurrentUser } from '@/lib/server/session';

/**
 * Разделы навигации.
 *
 * `requiredPermissions` — права, хотя бы одно из которых открывает раздел. Это
 * только удобство: окончательная проверка всегда на backend (ADR-0006), но
 * ссылка на закрытый раздел заставляла бы тренера искать причину отказа.
 *
 * Подписи — по канону макета (dashboard): «Обзор», «Спортсмены», «Финансы».
 * Раньше в коде были «Главная», «Ученики», «Оплаты» — расхождение с макетом и
 * между разделами.
 */
const NAVIGATION: readonly {
  href: string;
  label: string;
  requiredPermissions?: readonly string[];
}[] = [
  { href: '/', label: 'Обзор' },
  { href: '/athletes', label: 'Спортсмены' },
  // Заявки — работа администратора: тренер их не видит (ADR-0013).
  {
    href: '/trial-requests',
    label: 'Заявки',
    requiredPermissions: ['trial-requests.view'],
  },
  { href: '/groups', label: 'Группы' },
  // Тренеры: карточка правится `branches.manage`, привязка аккаунта — `users.manage`.
  // Ссылка показывается тем, кто видит группы: без этого список тренеров не нужен.
  { href: '/trainers', label: 'Тренеры', requiredPermissions: ['groups.view'] },
  { href: '/halls', label: 'Залы' },
  { href: '/schedule', label: 'Расписание' },
  // Посещаемость: сводка по группе за период. Отдельный раздел, потому что это
  // отчет для тренера и администратора, а не разметка конкретного занятия.
  {
    href: '/attendance',
    label: 'Посещаемость',
    requiredPermissions: ['attendance.view'],
  },
  // Аттестации и соревнования: экзамены и турниры. Отдельные разделы, потому что
  // это события с участниками и результатами, а не свойство карточки спортсмена.
  {
    href: '/attestations',
    label: 'Аттестации',
    requiredPermissions: ['attestations.view'],
  },
  {
    href: '/competitions',
    label: 'Соревнования',
    requiredPermissions: ['competitions.view'],
  },
  {
    href: '/finance',
    label: 'Финансы',
    requiredPermissions: ['payments.view', 'freezes.view'],
  },
  // Новости без `requiredPermissions`: BR-011 — новости и комментарии видны всем
  // пользователям клуба, поэтому раздел не скрывается ни от кого (ADR-0011).
  // Отчёты — агрегатор без новых API: сводка по деньгам и спортивным итогам.
  {
    href: '/reports',
    label: 'Отчёты',
    requiredPermissions: ['payments.view', 'attestations.view'],
  },
  { href: '/news', label: 'Новости' },
  // Чаты требуют `chat.use`: это разрешение на функцию. Конкретная переписка
  // доступна только участникам, и решает это backend (ADR-0011).
  { href: '/chats', label: 'Чаты', requiredPermissions: ['chat.use'] },
  { href: '/users', label: 'Пользователи' },
  // Настройки: хаб со ссылками на существующие разделы и, позже, собственные
  // экраны (docs/26-admin-settings.md). Показывается тем, кому есть что там
  // делать: управление филиалами, сотрудниками или правами. Аудит и финансовые
  // правила внутри дополнительно закрыты ролью SUPERADMIN.
  {
    href: '/settings',
    label: 'Настройки',
    requiredPermissions: ['branches.manage', 'users.manage', 'permissions.manage'],
  },
];

/**
 * Каркас админки по макету: тёмный сайдбар с разделами и светлая шапка с
 * пользователем.
 *
 * Сайдбар тёмный, чтобы рабочий интерфейс отличался от клиентского приложения.
 * Пункты идут без иконок: в макете их нет, а в двадцати строках иконки
 * превращались в шум. Ширина 248px — по макету.
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
      ? 'Руководитель клуба'
      : user.role === 'STAFF'
        ? 'Сотрудник'
        : 'Участник';
  const initial = (user.firstName || user.email).slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 hidden w-[248px] flex-col bg-ink md:flex">
        <div className="px-5 py-5">
          {/* Оригинальный логотип клуба: PNG с прозрачным фоном, вписывается по высоте.
              Раньше здесь была текстовая надпись, потому что оригинального ассета не было. */}
          <Image
            src="/brand/octagon-logo.png"
            alt="OCTAGON — каратэ-клуб"
            width={1100}
            height={307}
            className="h-12 w-auto"
          />
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-6">
          {navigation.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="px-6 py-4 text-[11px] text-white/35">Версия 1.0.0</div>
      </aside>

      <div className="md:pl-[248px]">
        <header className="sticky top-0 z-10 border-b border-line bg-white">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <MobileNav items={navigation} />
              <Breadcrumbs />
            </div>

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
                  className="flex items-center gap-1.5 rounded-control border border-line px-3 py-1.5 text-sm text-ink transition hover:bg-canvas"
                >
                  <Icon name="logout" size={15} />
                  <span className="hidden sm:inline">Выйти</span>
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="px-4 py-4 sm:px-6 sm:py-6">{children}</main>
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
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
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
