'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { CreateAthleteForm } from './athlete-forms';

export interface AthleteRow {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  status: string;
  groupName: string | null;
  rankLabel: string | null;
  beltGrade: string;
  phone: string | null;
}

interface BoardProps {
  data: { items: AthleteRow[]; total: number; page: number; limit: number };
  groups: { id: string; name: string; hallId: string | null }[];
  halls: { id: string; name: string }[];
  params: { search: string; hallId: string; groupId: string; status: string };
  sortBy: 'lastName' | 'birthDate' | 'status';
  sortOrder: 'asc' | 'desc';
}

const BELT: Record<string, string> = {
  WHITE: 'белый',
  ORANGE: 'оранжевый',
  ORANGE_BLUE_STRIPE: 'оранжевый с синей',
  BLUE: 'синий',
  BLUE_YELLOW_STRIPE: 'синий с жёлтой',
  YELLOW: 'жёлтый',
  YELLOW_GREEN_STRIPE: 'жёлтый с зелёной',
  GREEN: 'зелёный',
  GREEN_BROWN_STRIPE: 'зелёный с коричневой',
  BROWN: 'коричневый',
  BROWN_GOLD_STRIPE: 'коричневый с золотой',
  BLACK: 'чёрный',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Активен',
  FROZEN: 'Заморожен',
  ARCHIVED: 'Архив',
};

function buildHref(
  current: BoardProps,
  patch: Partial<{ search: string; hallId: string; groupId: string; status: string; sortBy: string; sortOrder: string; page: number }>,
) {
  const next = {
    search: current.params.search,
    hallId: current.params.hallId,
    groupId: current.params.groupId,
    status: current.params.status,
    sortBy: current.sortBy,
    sortOrder: current.sortOrder,
    page: 1,
    ...patch,
  };
  const query = new URLSearchParams();
  if (next.search) query.set('search', next.search);
  if (next.hallId) query.set('hallId', next.hallId);
  if (next.groupId) query.set('groupId', next.groupId);
  if (next.status) query.set('status', next.status);
  query.set('sortBy', next.sortBy);
  query.set('sortOrder', next.sortOrder);
  if (next.page > 1) query.set('page', String(next.page));
  return `/athletes?${query.toString()}`;
}

/**
 * Таблица реестра: сортировка и пагинация — ссылками, поэтому состояние живёт
 * в URL, а не в памяти вкладки. Смена сортировки и фильтров возвращает на
 * первую страницу.
 */
export function AthletesBoard(props: BoardProps) {
  const router = useRouter();
  const { data, groups, halls, params, sortBy, sortOrder } = props;
  const [search, setSearch] = useState(params.search);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pages = Math.max(1, Math.ceil(data.total / data.limit));
  const visibleGroups = params.hallId
    ? groups.filter((group) => group.hallId === params.hallId)
    : groups;

  const sortState = (column: string) => {
    if (sortBy !== column) return 'none' as const;
    return sortOrder === 'asc' ? ('ascending' as const) : ('descending' as const);
  };

  const arrow = (column: string) => {
    if (sortBy !== column) return '↕';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    router.push(buildHref(props, { search: search.trim(), page: 1 }));
  };

  const rows = useMemo(() => data.items, [data.items]);

  return (
    <>
      <section className="mt-6 rounded-card border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex min-w-[220px] flex-1 items-center gap-2" onSubmit={submitSearch}>
            <input
              aria-label="Поиск по фамилии, имени или отчеству"
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus-visible:border-accent"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по фамилии, имени или отчеству"
              value={search}
            />
          </form>

          <select
            aria-label="Фильтр по залу"
            className="h-10 min-w-[140px] rounded-lg border border-line bg-white px-2 text-sm"
            onChange={(event) =>
              router.push(buildHref(props, { hallId: event.target.value, groupId: '', page: 1 }))
            }
            value={params.hallId}
          >
            <option value="">Все залы</option>
            {halls.map((hall) => (
              <option key={hall.id} value={hall.id}>
                {hall.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Фильтр по группе"
            className="h-10 min-w-[150px] rounded-lg border border-line bg-white px-2 text-sm"
            onChange={(event) => router.push(buildHref(props, { groupId: event.target.value, page: 1 }))}
            value={params.groupId}
          >
            <option value="">Все группы</option>
            {visibleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Фильтр по статусу"
            className="h-10 min-w-[132px] rounded-lg border border-line bg-white px-2 text-sm"
            onChange={(event) => router.push(buildHref(props, { status: event.target.value, page: 1 }))}
            value={params.status}
          >
            <option value="">Все статусы</option>
            <option value="ACTIVE">Активные</option>
            <option value="FROZEN">Замороженные</option>
            <option value="ARCHIVED">Архивные</option>
          </select>

          {params.search || params.hallId || params.groupId || params.status ? (
            <Link
              className="grid h-10 place-items-center rounded-lg border border-line bg-white px-3 text-sm"
              href="/athletes"
            >
              Сбросить
            </Link>
          ) : null}

          <button
            className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent/90"
            onClick={() => setDrawerOpen(true)}
            type="button"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Новый спортсмен
          </button>
        </div>
      </section>

      <section className="mt-4 rounded-card border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm text-ink">Найдено: {data.total} спортсменов</p>
          <p className="text-xs text-muted">{data.limit} на странице</p>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-ink">
              {params.search || params.hallId || params.groupId || params.status
                ? 'По выбранным условиям спортсменов нет'
                : 'В реестре пока нет спортсменов'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {params.search
                ? 'Измените запрос или сбросьте фильтры.'
                : 'Добавьте первого спортсмена кнопкой «Новый спортсмен».'}
            </p>
          </div>
        ) : (
          <>
            <table className="hidden w-full border-collapse text-left md:table">
              <thead>
                <tr className="border-b border-line bg-[#fbfbfc] text-xs text-muted">
                  <th aria-sort={sortState('lastName')} className="px-4 py-2 font-medium">
                    <Link
                      className={`inline-flex items-center gap-1.5 ${sortBy === 'lastName' ? 'text-ink' : ''}`}
                      href={buildHref(props, {
                        sortBy: 'lastName',
                        sortOrder: sortBy === 'lastName' && sortOrder === 'asc' ? 'desc' : 'asc',
                        page: 1,
                      })}
                    >
                      ФИО
                      <span className={sortBy === 'lastName' ? 'text-accent-text' : 'text-muted'}>{arrow('lastName')}</span>
                    </Link>
                  </th>
                  <th aria-sort={sortState('birthDate')} className="px-4 py-2 font-medium">
                    <Link
                      className={`inline-flex items-center gap-1.5 ${sortBy === 'birthDate' ? 'text-ink' : ''}`}
                      href={buildHref(props, {
                        sortBy: 'birthDate',
                        sortOrder: sortBy === 'birthDate' && sortOrder === 'asc' ? 'desc' : 'asc',
                        page: 1,
                      })}
                    >
                      Дата рождения
                      <span className={sortBy === 'birthDate' ? 'text-accent-text' : 'text-muted'}>{arrow('birthDate')}</span>
                    </Link>
                  </th>
                  <th className="px-4 py-2 font-medium">Группа</th>
                  <th className="px-4 py-2 font-medium">Ступень / пояс</th>
                  <th aria-sort={sortState('status')} className="px-4 py-2 font-medium">
                    <Link
                      className={`inline-flex items-center gap-1.5 ${sortBy === 'status' ? 'text-ink' : ''}`}
                      href={buildHref(props, {
                        sortBy: 'status',
                        sortOrder: sortBy === 'status' && sortOrder === 'asc' ? 'desc' : 'asc',
                        page: 1,
                      })}
                    >
                      Статус
                      <span className={sortBy === 'status' ? 'text-accent-text' : 'text-muted'}>{arrow('status')}</span>
                    </Link>
                  </th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((athlete) => {
                  const status = athlete.status;
                  return (
                    <tr className="border-b border-line last:border-0" key={athlete.id}>
                      <td className="px-4 py-3">
                        <Link className="text-sm font-medium text-ink hover:text-accent-text" href={`/athletes/${athlete.id}`}>
                          {athlete.lastName} {athlete.firstName}
                        </Link>
                        {athlete.middleName ? (
                          <p className="text-xs text-muted">{athlete.middleName}</p>
                        ) : null}
                      </td>
                      <td className={`px-4 py-3 text-sm ${athlete.birthDate ? 'text-ink-soft' : 'text-muted'}`}>
                        {athlete.birthDate ? formatDate(athlete.birthDate) : 'Не указано'}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">
                        {athlete.groupName ?? 'Не указано'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {athlete.rankLabel ?? '—'}
                        <p className="text-xs text-muted">{BELT[athlete.beltGrade] ?? athlete.beltGrade}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            status === 'ACTIVE'
                              ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                              : 'rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted'
                          }
                        >
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-canvas"
                            href={`/athletes/${athlete.id}`}
                          >
                            Открыть
                          </Link>
                          <Link
                            aria-label={`Изменить: ${athlete.lastName}`}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-canvas hover:text-ink"
                            href={`/athletes/${athlete.id}`}
                          >
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                              <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinejoin="round" />
                              <path d="M13 5l4 4" strokeLinecap="round" />
                            </svg>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Мобильный вид: карточки. */}
            <div className="divide-y divide-line md:hidden">
              {rows.map((athlete) => (
                <Link className="block px-4 py-3" href={`/athletes/${athlete.id}`} key={athlete.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-ink">
                      {athlete.lastName} {athlete.firstName}
                    </span>
                    <span className="shrink-0 text-xs text-muted">
                      {STATUS_LABEL[athlete.status] ?? athlete.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {athlete.rankLabel ?? '—'}, {BELT[athlete.beltGrade] ?? athlete.beltGrade}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {athlete.birthDate ? formatDate(athlete.birthDate) : 'Дата рождения не указана'}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}

        {data.total > data.limit ? (
          <nav className="flex items-center justify-between border-t border-line px-4 py-3" aria-label="Страницы">
            <span className="text-xs text-muted">
              Показано {(data.page - 1) * data.limit + 1}–{Math.min(data.page * data.limit, data.total)} из {data.total}
            </span>
            <div className="flex items-center gap-1">
              {data.page > 1 ? (
                <Link
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-xs"
                  href={buildHref(props, { page: data.page - 1 })}
                >
                  ‹
                </Link>
              ) : null}
              {Array.from({ length: pages }, (_, index) => index + 1)
                .filter((number) => Math.abs(number - data.page) < 3 || number === 1 || number === pages)
                .map((number) => (
                  <Link
                    className={`grid h-8 w-8 place-items-center rounded-lg border text-xs ${
                      number === data.page
                        ? 'border-accent bg-accent font-medium text-white'
                        : 'border-line text-muted'
                    }`}
                    href={buildHref(props, { page: number })}
                    key={number}
                  >
                    {number}
                  </Link>
                ))}
              {data.page < pages ? (
                <Link
                  className="grid h-8 w-8 place-items-center rounded-lg border border-line text-xs"
                  href={buildHref(props, { page: data.page + 1 })}
                >
                  ›
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </section>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            aria-label="Закрыть панель"
            className="absolute inset-0 bg-[#0e0e10]/32"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />
          <aside className="relative flex h-full w-full max-w-[460px] flex-col bg-white shadow-2xl">
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Новый спортсмен</h2>
                <p className="mt-1 text-xs text-muted">Заполните поля и сохраните карточку.</p>
              </div>
              <button
                aria-label="Закрыть"
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-canvas"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <CreateAthleteForm />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return [day, month, year].join('.');
}
