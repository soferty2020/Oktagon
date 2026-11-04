'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { DataTable, type Column } from '@/components/ui/data-table';
import { FiltersBar, FiltersSearch } from '@/components/ui/filters-bar';
import { Drawer } from '@/components/ui/drawer';
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
  /** Действующие привязки аккаунтов; 0 — привязки нет. */
  /** null — старый API без поля: «нет данных», а не «нет привязки». */
  linkedAccountsCount: number | null;
}

interface BoardProps {
  data: { items: AthleteRow[]; total: number; page: number; limit: number };
  groups: { id: string; name: string; hallId: string | null }[];
  halls: { id: string; name: string }[];
  params: { search: string; hallId: string; groupId: string; status: string; hasAccounts: string };
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

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Активен', className: 'bg-success/10 text-success' },
  FROZEN: { label: 'Заморожен', className: 'bg-accent-soft text-accent-text' },
  ARCHIVED: { label: 'Архив', className: 'bg-canvas text-muted' },
};

/** Собирает ссылку с сохранением фильтров; смена условий возвращает на 1-ю страницу. */
function buildHref(
  props: BoardProps,
  patch: Partial<{
    search: string;
    hallId: string;
    groupId: string;
    status: string;
    hasAccounts: string;
    sortBy: string;
    sortOrder: string;
    page: number;
  }>,
) {
  const next = {
    search: props.params.search,
    hallId: props.params.hallId,
    groupId: props.params.groupId,
    status: props.params.status,
    hasAccounts: props.params.hasAccounts,
    sortBy: props.sortBy,
    sortOrder: props.sortOrder,
    page: 1,
    ...patch,
  };
  const query = new URLSearchParams();
  if (next.search) query.set('search', next.search);
  if (next.hallId) query.set('hallId', next.hallId);
  if (next.groupId) query.set('groupId', next.groupId);
  if (next.status) query.set('status', next.status);
  if (next.hasAccounts && next.hasAccounts !== 'all') query.set('hasAccounts', next.hasAccounts);
  query.set('sortBy', next.sortBy);
  query.set('sortOrder', next.sortOrder);
  if (next.page > 1) query.set('page', String(next.page));
  return `/athletes?${query.toString()}`;
}

function formatDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return [day, month, year].join('.');
}

/**
 * Реестр спортсменов: серверные поиск, фильтры, сортировка и пагинация.
 *
 * Состояние живёт в URL, а не в памяти вкладки: ссылка на карточку возвращает в
 * список с теми же условиями, и страницу можно переслать. Порядок строк считает
 * API — `DataTable` в серверном режиме строки не переставляет.
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
  const hasFilters = Boolean(
    params.search ||
      params.hallId ||
      params.groupId ||
      params.status ||
      // `all` — не фильтр: иначе «Сбросить» появляется на пустых условиях.
      (params.hasAccounts && params.hasAccounts !== 'all'),
  );

  const columns: Column<AthleteRow>[] = [
    {
      key: 'lastName',
      header: 'ФИО',
      sortValue: (row) => row.lastName,
      render: (row) => (
        <Link href={`/athletes/${row.id}`} className="font-medium text-ink hover:text-accent-text">
          {row.lastName} {row.firstName}
          {row.middleName ? (
            <span className="block text-[11.5px] font-normal text-muted">{row.middleName}</span>
          ) : null}
        </Link>
      ),
    },
    {
      key: 'birthDate',
      header: 'Дата рождения',
      sortValue: (row) => row.birthDate ?? '',
      render: (row) =>
        row.birthDate ? (
          <span className="text-ink-soft">{formatDate(row.birthDate)}</span>
        ) : (
          <span className="text-muted">Не указано</span>
        ),
    },
    {
      key: 'group',
      header: 'Группа',
      render: (row) =>
        row.groupName ? (
          <span className="text-ink-soft">{row.groupName}</span>
        ) : (
          <span className="text-muted">Не указано</span>
        ),
    },
    {
      key: 'rank',
      header: 'Ступень / пояс',
      render: (row) => (
        <>
          <span className="text-ink-soft">{row.rankLabel ?? '—'}</span>
          <span className="block text-[11.5px] text-muted">{BELT[row.beltGrade] ?? row.beltGrade}</span>
        </>
      ),
    },
    {
      key: 'accounts',
      header: 'Аккаунты',
      render: (row) => {
        const count = row.linkedAccountsCount;
        if (count === null || count === undefined) {
          return <span className="text-muted">Нет данных</span>;
        }
        if (count === 0) {
          return <span className="text-muted">Нет привязки</span>;
        }
        if (count === 1) {
          return <span className="text-ink-soft">Привязан</span>;
        }
        return <span className="text-ink-soft">{count} аккаунта</span>;
      },
    },
    {
      key: 'status',
      header: 'Статус',
      sortValue: (row) => row.status,
      render: (row) => {
        const status = STATUS_LABEL[row.status] ?? {
          label: row.status,
          className: 'bg-canvas text-muted',
        };
        return (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Link
          href={`/athletes/${row.id}`}
          className="inline-flex h-8 items-center rounded-control border border-line bg-white px-3 text-xs text-ink-soft hover:bg-canvas"
        >
          Открыть
        </Link>
      ),
    },
  ];

  function onSortChange(key: string, direction: 'asc' | 'desc') {
    router.push(buildHref(props, { sortBy: key, sortOrder: direction, page: 1 }));
  }

  return (
    <>
      <div className="mt-4">
        <FiltersBar>
          <form
            className="contents"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(buildHref(props, { search: search.trim(), page: 1 }));
            }}
          >
            <FiltersSearch
              value={search}
              onChange={setSearch}
              placeholder="Поиск по фамилии, имени или отчеству"
            />
          </form>

          <select
            aria-label="Фильтр по залу"
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[140px]"
            value={params.hallId}
            onChange={(event) =>
              router.push(buildHref(props, { hallId: event.target.value, groupId: '', page: 1 }))
            }
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
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[150px]"
            value={params.groupId}
            onChange={(event) =>
              router.push(buildHref(props, { groupId: event.target.value, page: 1 }))
            }
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
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[132px]"
            value={params.status}
            onChange={(event) =>
              router.push(buildHref(props, { status: event.target.value, page: 1 }))
            }
          >
            <option value="">Все статусы</option>
            <option value="ACTIVE">Активные</option>
            <option value="FROZEN">Замороженные</option>
            <option value="ARCHIVED">Архивные</option>
          </select>

          <select
            aria-label="Фильтр по привязке аккаунтов"
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[150px]"
            value={params.hasAccounts}
            onChange={(event) =>
              router.push(buildHref(props, { hasAccounts: event.target.value, page: 1 }))
            }
          >
            <option value="all">Все аккаунты</option>
            <option value="linked">С привязкой</option>
            <option value="unlinked">Без привязки</option>
          </select>

          {hasFilters ? (
            <Link
              href="/athletes"
              className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-white px-3 text-[13px] text-ink-soft hover:bg-canvas sm:h-10"
            >
              Сбросить
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 text-[13.5px] font-medium text-white hover:opacity-90 sm:ml-auto sm:h-10"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Новый спортсмен
          </button>
        </FiltersBar>
      </div>

      <div className="mt-3">
        <DataTable
          columns={columns}
          rows={data.items}
          getRowKey={(row) => row.id}
          sort={{ key: sortBy, direction: sortOrder }}
          sortMode="server"
          onSortChange={onSortChange}
          caption="Реестр спортсменов"
          empty={
            hasFilters ? (
              <span>
                По выбранным условиям никого нет.{' '}
                <Link className="text-accent-text underline" href="/athletes">
                  Сбросить фильтры
                </Link>
              </span>
            ) : (
              'В реестре пока нет спортсменов — добавьте первого.'
            )
          }
          footer={
            <>
              <span>
                Показано {data.items.length ? (data.page - 1) * data.limit + 1 : 0}–
                {(data.page - 1) * data.limit + data.items.length} из {data.total}
              </span>
              {pages > 1 ? (
                <span className="flex items-center gap-1.5">
                  <Link
                    aria-label="Предыдущая страница"
                    href={buildHref(props, { page: Math.max(1, data.page - 1) })}
                    aria-disabled={data.page === 1}
                    className={`inline-flex h-8 items-center rounded-control border border-line px-2.5 ${
                      data.page === 1 ? 'pointer-events-none opacity-50' : 'bg-white hover:bg-canvas'
                    }`}
                  >
                    ‹
                  </Link>
                  <span className="px-1 text-ink-soft">
                    {data.page} / {pages}
                  </span>
                  <Link
                    aria-label="Следующая страница"
                    href={buildHref(props, { page: Math.min(pages, data.page + 1) })}
                    aria-disabled={data.page === pages}
                    className={`inline-flex h-8 items-center rounded-control border border-line px-2.5 ${
                      data.page === pages ? 'pointer-events-none opacity-50' : 'bg-white hover:bg-canvas'
                    }`}
                  >
                    ›
                  </Link>
                </span>
              ) : null}
            </>
          }
        />
      </div>

      <Drawer
        open={drawerOpen}
        title="Новый спортсмен"
        description="Заполните поля и сохраните карточку."
        onClose={() => setDrawerOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-control border border-line bg-white text-[13.5px] text-ink-soft hover:bg-canvas"
          >
            Отмена
          </button>
        }
      >
        <CreateAthleteForm />
      </Drawer>
    </>
  );
}
