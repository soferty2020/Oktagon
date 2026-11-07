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
  /** Р”РµР№СЃС‚РІСѓСЋС‰РёРµ РїСЂРёРІСЏР·РєРё Р°РєРєР°СѓРЅС‚РѕРІ; 0 вЂ” РїСЂРёРІСЏР·РєРё РЅРµС‚. */
  /** null вЂ” СЃС‚Р°СЂС‹Р№ API Р±РµР· РїРѕР»СЏ: В«РЅРµС‚ РґР°РЅРЅС‹С…В», Р° РЅРµ В«РЅРµС‚ РїСЂРёРІСЏР·РєРёВ». */
  linkedAccountsCount: number | null;
}

interface BoardProps {
  data: { items: AthleteRow[]; total: number; page: number; limit: number };
  groups: { id: string; name: string; hallId: string | null }[];
  halls: { id: string; name: string }[];
  params: { search: string; hallId: string; groupId: string; status: string; hasAccounts: string };
  sortBy: 'lastName' | 'birthDate' | 'status';
  sortOrder: 'asc' | 'desc';
  /** Р•СЃС‚СЊ Р»Рё РїСЂР°РІРѕ thletes.edit: Р±РµР· РЅРµРіРѕ РєРЅРѕРїРєР° СЃРѕР·РґР°РЅРёСЏ РЅРµ РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ. */
  canEdit: boolean;
}

const BELT: Record<string, string> = {
  WHITE: 'Р±РµР»С‹Р№',
  ORANGE: 'РѕСЂР°РЅР¶РµРІС‹Р№',
  ORANGE_BLUE_STRIPE: 'РѕСЂР°РЅР¶РµРІС‹Р№ СЃ СЃРёРЅРµР№',
  BLUE: 'СЃРёРЅРёР№',
  BLUE_YELLOW_STRIPE: 'СЃРёРЅРёР№ СЃ Р¶С‘Р»С‚РѕР№',
  YELLOW: 'Р¶С‘Р»С‚С‹Р№',
  YELLOW_GREEN_STRIPE: 'Р¶С‘Р»С‚С‹Р№ СЃ Р·РµР»С‘РЅРѕР№',
  GREEN: 'Р·РµР»С‘РЅС‹Р№',
  GREEN_BROWN_STRIPE: 'Р·РµР»С‘РЅС‹Р№ СЃ РєРѕСЂРёС‡РЅРµРІРѕР№',
  BROWN: 'РєРѕСЂРёС‡РЅРµРІС‹Р№',
  BROWN_GOLD_STRIPE: 'РєРѕСЂРёС‡РЅРµРІС‹Р№ СЃ Р·РѕР»РѕС‚РѕР№',
  BLACK: 'С‡С‘СЂРЅС‹Р№',
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'РђРєС‚РёРІРµРЅ', className: 'bg-success/10 text-success' },
  FROZEN: { label: 'Р—Р°РјРѕСЂРѕР¶РµРЅ', className: 'bg-accent-soft text-accent-text' },
  ARCHIVED: { label: 'РђСЂС…РёРІ', className: 'bg-canvas text-muted' },
};

/** РЎРѕР±РёСЂР°РµС‚ СЃСЃС‹Р»РєСѓ СЃ СЃРѕС…СЂР°РЅРµРЅРёРµРј С„РёР»СЊС‚СЂРѕРІ; СЃРјРµРЅР° СѓСЃР»РѕРІРёР№ РІРѕР·РІСЂР°С‰Р°РµС‚ РЅР° 1-СЋ СЃС‚СЂР°РЅРёС†Сѓ. */
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
 * Р РµРµСЃС‚СЂ СЃРїРѕСЂС‚СЃРјРµРЅРѕРІ: СЃРµСЂРІРµСЂРЅС‹Рµ РїРѕРёСЃРє, С„РёР»СЊС‚СЂС‹, СЃРѕСЂС‚РёСЂРѕРІРєР° Рё РїР°РіРёРЅР°С†РёСЏ.
 *
 * РЎРѕСЃС‚РѕСЏРЅРёРµ Р¶РёРІС‘С‚ РІ URL, Р° РЅРµ РІ РїР°РјСЏС‚Рё РІРєР»Р°РґРєРё: СЃСЃС‹Р»РєР° РЅР° РєР°СЂС‚РѕС‡РєСѓ РІРѕР·РІСЂР°С‰Р°РµС‚ РІ
 * СЃРїРёСЃРѕРє СЃ С‚РµРјРё Р¶Рµ СѓСЃР»РѕРІРёСЏРјРё, Рё СЃС‚СЂР°РЅРёС†Сѓ РјРѕР¶РЅРѕ РїРµСЂРµСЃР»Р°С‚СЊ. РџРѕСЂСЏРґРѕРє СЃС‚СЂРѕРє СЃС‡РёС‚Р°РµС‚
 * API вЂ” `DataTable` РІ СЃРµСЂРІРµСЂРЅРѕРј СЂРµР¶РёРјРµ СЃС‚СЂРѕРєРё РЅРµ РїРµСЂРµСЃС‚Р°РІР»СЏРµС‚.
 */
export function AthletesBoard(props: BoardProps) {
  const router = useRouter();
  const { data, groups, halls, params, sortBy, sortOrder, canEdit } = props;
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
      // `all` вЂ” РЅРµ С„РёР»СЊС‚СЂ: РёРЅР°С‡Рµ В«РЎР±СЂРѕСЃРёС‚СЊВ» РїРѕСЏРІР»СЏРµС‚СЃСЏ РЅР° РїСѓСЃС‚С‹С… СѓСЃР»РѕРІРёСЏС….
      (params.hasAccounts && params.hasAccounts !== 'all'),
  );

  const columns: Column<AthleteRow>[] = [
    {
      key: 'lastName',
      header: 'Р¤РРћ',
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
      header: 'Р”Р°С‚Р° СЂРѕР¶РґРµРЅРёСЏ',
      sortValue: (row) => row.birthDate ?? '',
      render: (row) =>
        row.birthDate ? (
          <span className="text-ink-soft">{formatDate(row.birthDate)}</span>
        ) : (
          <span className="text-muted">РќРµ СѓРєР°Р·Р°РЅРѕ</span>
        ),
    },
    {
      key: 'group',
      header: 'Р“СЂСѓРїРїР°',
      render: (row) =>
        row.groupName ? (
          <span className="text-ink-soft">{row.groupName}</span>
        ) : (
          <span className="text-muted">РќРµ СѓРєР°Р·Р°РЅРѕ</span>
        ),
    },
    {
      key: 'rank',
      header: 'РЎС‚СѓРїРµРЅСЊ / РїРѕСЏСЃ',
      render: (row) => (
        <>
          <span className="text-ink-soft">{row.rankLabel ?? 'вЂ”'}</span>
          <span className="block text-[11.5px] text-muted">{BELT[row.beltGrade] ?? row.beltGrade}</span>
        </>
      ),
    },
    {
      key: 'accounts',
      header: 'РђРєРєР°СѓРЅС‚С‹',
      render: (row) => {
        const count = row.linkedAccountsCount;
        if (count === null || count === undefined) {
          return <span className="text-muted">РќРµС‚ РґР°РЅРЅС‹С…</span>;
        }
        if (count === 0) {
          return <span className="text-muted">РќРµС‚ РїСЂРёРІСЏР·РєРё</span>;
        }
        if (count === 1) {
          return <span className="text-ink-soft">РџСЂРёРІСЏР·Р°РЅ</span>;
        }
        return <span className="text-ink-soft">{count} Р°РєРєР°СѓРЅС‚Р°</span>;
      },
    },
    {
      key: 'status',
      header: 'РЎС‚Р°С‚СѓСЃ',
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
          РћС‚РєСЂС‹С‚СЊ
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
              placeholder="РџРѕРёСЃРє РїРѕ С„Р°РјРёР»РёРё, РёРјРµРЅРё РёР»Рё РѕС‚С‡РµСЃС‚РІСѓ"
            />
          </form>

          <select
            aria-label="Р¤РёР»СЊС‚СЂ РїРѕ Р·Р°Р»Сѓ"
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[140px]"
            value={params.hallId}
            onChange={(event) =>
              router.push(buildHref(props, { hallId: event.target.value, groupId: '', page: 1 }))
            }
          >
            <option value="">Р’СЃРµ Р·Р°Р»С‹</option>
            {halls.map((hall) => (
              <option key={hall.id} value={hall.id}>
                {hall.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Р¤РёР»СЊС‚СЂ РїРѕ РіСЂСѓРїРїРµ"
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[150px]"
            value={params.groupId}
            onChange={(event) =>
              router.push(buildHref(props, { groupId: event.target.value, page: 1 }))
            }
          >
            <option value="">Р’СЃРµ РіСЂСѓРїРїС‹</option>
            {visibleGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Р¤РёР»СЊС‚СЂ РїРѕ СЃС‚Р°С‚СѓСЃСѓ"
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[132px]"
            value={params.status}
            onChange={(event) =>
              router.push(buildHref(props, { status: event.target.value, page: 1 }))
            }
          >
            <option value="">Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹</option>
            <option value="ACTIVE">РђРєС‚РёРІРЅС‹Рµ</option>
            <option value="FROZEN">Р—Р°РјРѕСЂРѕР¶РµРЅРЅС‹Рµ</option>
            <option value="ARCHIVED">РђСЂС…РёРІРЅС‹Рµ</option>
          </select>

          <select
            aria-label="Р¤РёР»СЊС‚СЂ РїРѕ РїСЂРёРІСЏР·РєРµ Р°РєРєР°СѓРЅС‚РѕРІ"
            className="h-11 rounded-control border border-line bg-white px-3 text-[13px] sm:h-10 sm:min-w-[150px]"
            value={params.hasAccounts}
            onChange={(event) =>
              router.push(buildHref(props, { hasAccounts: event.target.value, page: 1 }))
            }
          >
            <option value="all">Р’СЃРµ Р°РєРєР°СѓРЅС‚С‹</option>
            <option value="linked">РЎ РїСЂРёРІСЏР·РєРѕР№</option>
            <option value="unlinked">Р‘РµР· РїСЂРёРІСЏР·РєРё</option>
          </select>

          {hasFilters ? (
            <Link
              href="/athletes"
              className="inline-flex h-11 items-center justify-center rounded-control border border-line bg-white px-3 text-[13px] text-ink-soft hover:bg-canvas sm:h-10"
            >
              РЎР±СЂРѕСЃРёС‚СЊ
            </Link>
          ) : null}

          {canEdit ? (
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
          ) : null}
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
          caption="Р РµРµСЃС‚СЂ СЃРїРѕСЂС‚СЃРјРµРЅРѕРІ"
          empty={
            hasFilters ? (
              <span>
                РџРѕ РІС‹Р±СЂР°РЅРЅС‹Рј СѓСЃР»РѕРІРёСЏРј РЅРёРєРѕРіРѕ РЅРµС‚.{' '}
                <Link className="text-accent-text underline" href="/athletes">
                  РЎР±СЂРѕСЃРёС‚СЊ С„РёР»СЊС‚СЂС‹
                </Link>
              </span>
            ) : (
              'Р’ СЂРµРµСЃС‚СЂРµ РїРѕРєР° РЅРµС‚ СЃРїРѕСЂС‚СЃРјРµРЅРѕРІ вЂ” РґРѕР±Р°РІСЊС‚Рµ РїРµСЂРІРѕРіРѕ.'
            )
          }
          footer={
            <>
              <span>
                РџРѕРєР°Р·Р°РЅРѕ {data.items.length ? (data.page - 1) * data.limit + 1 : 0}вЂ“
                {(data.page - 1) * data.limit + data.items.length} РёР· {data.total}
              </span>
              {pages > 1 ? (
                <span className="flex items-center gap-1.5">
                  <Link
                    aria-label="РџСЂРµРґС‹РґСѓС‰Р°СЏ СЃС‚СЂР°РЅРёС†Р°"
                    href={buildHref(props, { page: Math.max(1, data.page - 1) })}
                    aria-disabled={data.page === 1}
                    className={`inline-flex h-8 items-center rounded-control border border-line px-2.5 ${
                      data.page === 1 ? 'pointer-events-none opacity-50' : 'bg-white hover:bg-canvas'
                    }`}
                  >
                    вЂ№
                  </Link>
                  <span className="px-1 text-ink-soft">
                    {data.page} / {pages}
                  </span>
                  <Link
                    aria-label="РЎР»РµРґСѓСЋС‰Р°СЏ СЃС‚СЂР°РЅРёС†Р°"
                    href={buildHref(props, { page: Math.min(pages, data.page + 1) })}
                    aria-disabled={data.page === pages}
                    className={`inline-flex h-8 items-center rounded-control border border-line px-2.5 ${
                      data.page === pages ? 'pointer-events-none opacity-50' : 'bg-white hover:bg-canvas'
                    }`}
                  >
                    вЂє
                  </Link>
                </span>
              ) : null}
            </>
          }
        />
      </div>

      <Drawer
        open={drawerOpen}
        title="РќРѕРІС‹Р№ СЃРїРѕСЂС‚СЃРјРµРЅ"
        description="Р—Р°РїРѕР»РЅРёС‚Рµ РїРѕР»СЏ Рё СЃРѕС…СЂР°РЅРёС‚Рµ РєР°СЂС‚РѕС‡РєСѓ."
        onClose={() => setDrawerOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-control border border-line bg-white text-[13.5px] text-ink-soft hover:bg-canvas"
          >
            РћС‚РјРµРЅР°
          </button>
        }
      >
        <CreateAthleteForm />
      </Drawer>
    </>
  );
}
