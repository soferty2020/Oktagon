import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice } from '@/components/app-shell';
import { Icon, type IconName } from '@/components/icons';
import { getCurrentUser } from '@/lib/server/session';

export const metadata = {
  title: 'Настройки — OCTAGON',
};

/**
 * Категория настроек.
 *
 * `href` — ссылка на существующий раздел или собственный экран. `status` —
 * состояние категории, чтобы неработающая ссылка не выглядела сломанной.
 */
interface SettingsCategory {
  title: string;
  description: string;
  icon: IconName;
  href?: string;
  /** Дополнительных экранов еще нет: категория показана как запланированная. */
  pending?: string;
  /** Видна только суперадминистратору (docs/26-admin-settings.md). */
  superadminOnly?: boolean;
  /** Права, хотя бы одно из которых открывает категорию. */
  requiredPermissions?: readonly string[];
}

/**
 * Хаб настроек (K2).
 *
 * Не дублирует CRUD: филиалы, сотрудники и права остаются в своих разделах, здесь
 * только вход в них. Это прямое требование задачи — «reuse existing screens
 * instead of duplicating CRUD».
 *
 * Состав и ограничения — по `docs/26-admin-settings.md`: секреты и инфраструктура
 * в админку не попадают, финансовые правила и журнал действий доступны только
 * суперадминистратору.
 */
const CATEGORIES: readonly SettingsCategory[] = [
  {
    title: 'Клуб',
    description: 'Название, контакты и часовой пояс клуба.',
    icon: 'settings',
    pending: 'K1',
    superadminOnly: true,
  },
  {
    title: 'Филиалы и залы',
    description: 'Адреса, контакты и залы: управление в операционном разделе.',
    icon: 'halls',
    href: '/branches',
    requiredPermissions: ['branches.manage'],
  },
  {
    title: 'Сотрудники и права',
    description: 'Роли, индивидуальные права и приглашения.',
    icon: 'users',
    href: '/users',
    requiredPermissions: ['users.manage', 'permissions.manage'],
  },
  {
    title: 'Спортивные справочники',
    description: 'Каталог поясов: фиксированный, только просмотр.',
    icon: 'belt',
    pending: 'K3',
  },
  {
    title: 'Финансовые правила',
    description: 'Правила расчёта задолженности. Действует BR-004 до утверждения новых.',
    icon: 'sliders',
    pending: 'K5',
    superadminOnly: true,
  },
  {
    title: 'Журнал действий',
    description: 'Кто и что изменил: фильтры и значения до/после.',
    icon: 'shield',
    pending: 'K6',
    superadminOnly: true,
  },
  {
    title: 'Система',
    description: 'Безопасные общие параметры. Секреты и инфраструктура — вне админки.',
    icon: 'lock',
    pending: 'K1',
    superadminOnly: true,
  },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const isSuperAdmin = user.role === 'SUPERADMIN';

  const visible = CATEGORIES.filter((category) => {
    if (category.superadminOnly && !isSuperAdmin) {
      return false;
    }
    if (category.requiredPermissions) {
      return category.requiredPermissions.some((code) => user.permissions.includes(code));
    }
    return true;
  });

  // Сотрудник без прав на управление не должен попадать в раздел даже по прямой
  // ссылке: категорий у него не осталось бы, и экран выглядел бы пустым.
  if (visible.length === 0) {
    return (
      <AppShell user={user}>
        <Notice tone="error">
          Раздел доступен администраторам клуба: нужны права на управление филиалами,
          сотрудниками или правами доступа.
        </Notice>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <p className="mb-5 text-sm text-muted">
        Общие параметры клуба и входы в существующие разделы. Данные и права сотрудников
        редактируются там, где и раньше — здесь только навигация.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((category) => (
          <CategoryCard key={category.title} category={category} />
        ))}
      </div>

      {!isSuperAdmin ? (
        <p className="mt-6 text-xs text-muted">
          Финансовые правила и журнал действий доступны только суперадминистратору —
          независимо от индивидуальных прав.
        </p>
      ) : null}
    </AppShell>
  );
}

function CategoryCard({ category }: { category: SettingsCategory }) {
  const content = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <Icon name={category.icon} size={18} />
        </span>
        {category.pending ? (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted">
            скоро
          </span>
        ) : (
          <Icon name="chevron" size={16} className="text-muted" />
        )}
      </div>

      <p className="text-sm font-semibold text-ink">{category.title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">{category.description}</p>
    </>
  );

  if (!category.href) {
    return (
      <div className="rounded-card border border-dashed border-line bg-white/60 p-5">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={category.href}
      className="rounded-card border border-line bg-white p-5 transition hover:border-accent/40"
    >
      {content}
    </Link>
  );
}
