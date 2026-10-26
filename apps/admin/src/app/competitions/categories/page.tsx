import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { EmptyState } from '@/components/empty-state';
import { secondaryButtonClass } from '@/components/ui';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateCategoryForm, RenameCategoryForm, ToggleCategoryButton } from './forms';

export const metadata = {
  title: 'Категории соревнований — OCTAGON',
};

interface CategoryView {
  id: string;
  competitionId: string | null;
  discipline: string;
  name: string;
  ageFrom: number | null;
  ageTo: number | null;
  weightFrom: number | string | null;
  weightTo: number | string | null;
  beltFrom: string | null;
  beltTo: string | null;
  isActive: boolean;
}

interface CompetitionView {
  id: string;
  title: string;
}

/** Возраст и вес одной строкой: «12–13 лет · до 45 кг». */
function describeLimits(category: CategoryView): string {
  const parts: string[] = [];

  if (category.ageFrom || category.ageTo) {
    parts.push(
      category.ageFrom && category.ageTo
        ? `${category.ageFrom}–${category.ageTo} лет`
        : category.ageFrom
          ? `с ${category.ageFrom} лет`
          : `до ${category.ageTo} лет`,
    );
  }

  if (category.weightFrom || category.weightTo) {
    const from = category.weightFrom === null ? null : Number(category.weightFrom);
    const to = category.weightTo === null ? null : Number(category.weightTo);

    if (from && to) {
      parts.push(`${from}–${to} кг`);
    } else if (from) {
      parts.push(`от ${from} кг`);
    } else if (to) {
      parts.push(`до ${to} кг`);
    }
  }

  if (category.beltFrom || category.beltTo) {
    parts.push(`ступени ${category.beltFrom ?? '…'} — ${category.beltTo ?? '…'}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Без ограничений';
}

/**
 * Справочник категорий (#43).
 *
 * Без него турнир создать можно, а заявку — нет: список категорий пуст. Поэтому
 * экран стоит рядом с соревнованиями, а не в настройках.
 */
export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ discipline?: string }>;
}) {
  const params = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!user.permissions.includes('competitions.view')) {
    return (
      <AppShell user={user}>
        <PageHeader title="Категории" />
        <Notice tone="info">{describePermission('competitions.view')}</Notice>
      </AppShell>
    );
  }

  const canManage = user.role === 'SUPERADMIN';
  const { accessToken } = await readTokens();

  const [categoriesResult, competitionsResult] = await Promise.all([
    accessToken
      ? apiFetch<CategoryView[]>('/api/v1/competitions/categories', { accessToken })
      : Promise.resolve(null),
    accessToken ? apiFetch<CompetitionView[]>('/api/v1/competitions', { accessToken }) : Promise.resolve(null),
  ]);

  const categories = categoriesResult?.ok ? categoriesResult.data : [];
  const competitions = (competitionsResult?.ok ? competitionsResult.data : []).map((item) => ({
    id: item.id,
    title: item.title,
  }));

  const discipline = params.discipline === 'KATA' || params.discipline === 'KUMITE'
    ? params.discipline
    : null;
  const visible = discipline
    ? categories.filter((category) => category.discipline === discipline)
    : categories;

  const common = visible.filter((category) => category.competitionId === null);
  const perCompetition = visible.filter((category) => category.competitionId !== null);

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link className="text-sm text-neutral-600 hover:text-neutral-900" href="/competitions">
          ← Соревнования
        </Link>
      </div>

      <PageHeader
        title="Категории"
        description="Кумитэ и ката: общий справочник клуба и категории конкретных турниров"
      />

      {!categoriesResult?.ok && categoriesResult ? (
        <Notice tone="info">{describeError(categoriesResult.error)}</Notice>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          className={params.discipline ? secondaryButtonClass : 'rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white'}
          href="/competitions/categories"
        >
          Все
        </Link>
        <Link
          className={params.discipline === 'KUMITE' ? 'rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white' : secondaryButtonClass}
          href="/competitions/categories?discipline=KUMITE"
        >
          Кумитэ
        </Link>
        <Link
          className={params.discipline === 'KATA' ? 'rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white' : secondaryButtonClass}
          href="/competitions/categories?discipline=KATA"
        >
          Ката
        </Link>
      </div>

      {canManage ? (
        <section className="mb-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Новая категория</h2>
          <CreateCategoryForm competitions={competitions} />
        </section>
      ) : (
        <Notice tone="info">
          Справочник категорий меняет руководитель клуба. Здесь можно посмотреть, в каких категориях
          проводятся турниры.
        </Notice>
      )}

      {categories.length === 0 ? (
        <EmptyState
          title="Категорий пока нет"
          description={
            canManage
              ? 'Добавьте первую категорию — без неё заявку на турнир оформить нельзя.'
              : 'Когда руководитель заведёт категории, они появятся здесь.'
          }
        />
      ) : (
        <div className="space-y-8">
          <CategoryGroup
            canManage={canManage}
            categories={common}
            title="Общий справочник"
          />
          {perCompetition.length > 0 ? (
            <CategoryGroup
              canManage={canManage}
              categories={perCompetition}
              title="Категории турниров"
            />
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

function CategoryGroup({
  title,
  categories,
  canManage,
}: {
  title: string;
  categories: CategoryView[];
  canManage: boolean;
}) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      <div className="space-y-3">
        {categories.map((category) => (
          <article
            className="rounded-xl border border-neutral-200 bg-white p-4"
            key={category.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {category.name}{' '}
                  <span className="text-sm font-normal text-neutral-500">
                    · {category.discipline === 'KATA' ? 'ката' : 'кумитэ'}
                  </span>
                  {!category.isActive ? (
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      снята
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-neutral-600">{describeLimits(category)}</p>
              </div>

              {canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ToggleCategoryButton id={category.id} isActive={category.isActive} />
                </div>
              ) : null}
            </div>

            {canManage ? (
              <div className="mt-3 border-t border-neutral-100 pt-3">
                <RenameCategoryForm id={category.id} name={category.name} />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
