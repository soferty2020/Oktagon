'use client';

import { useMemo, useState } from 'react';

type SortDirection = 'asc' | 'desc';

/** Стабильные ключи строк-скелетонов: индекс массива в key запрещён линтером. */
const SKELETON_ROWS = ['s1', 's2', 's3', 's4', 's5'] as const;

export type Column<T> = {
  key: string;
  header: string;
  /** Значение для сортировки. Без него колонка не сортируется. */
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
  width?: string;
  render: (row: T) => React.ReactNode;
};

/**
 * Таблица реестра Control 2.0.
 *
 * Строка 48 px, первая колонка — главное поле и ссылка в карточку, действия
 * справа. Сортировка показывается стрелкой у активного столбца; если данные
 * приходят страницей с сервера, сортировку нужно передавать наружу через
 * `onSortChange` — иначе она переставит только видимые строки (антипаттерн из
 * DESIGN.md § 7).
 *
 * Состояния: загрузка — скелетон строк, пусто — `empty`, ошибка — `error`.
 * Ни одно из них не оставляет пустую рамку без объяснения.
 */
export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
  error,
  loading,
  sort,
  onSortChange,
  footer,
  caption,
  sortMode = 'server',
}: {
  columns: readonly Column<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  empty?: React.ReactNode;
  error?: React.ReactNode;
  loading?: boolean;
  sort?: { key: string; direction: SortDirection } | null;
  onSortChange?: (key: string, direction: SortDirection) => void;
  /**
   * `server` (по умолчанию) — данные приходят страницей, порядок считает API:
   * локальная перестановка затронула бы только загруженные строки и сломала бы
   * пагинацию. `client` допустим только для полного набора в памяти.
   */
  sortMode?: 'server' | 'client';
  footer?: React.ReactNode;
  caption?: string;
}) {
  const [localSort, setLocalSort] = useState<{ key: string; direction: SortDirection } | null>(
    null,
  );
  const activeSort = sort !== undefined ? sort : localSort;

  const sortedRows = useMemo(() => {
    // В серверном режиме перестановка строк запрещена: страница уже пришла
    // отсортированной с API, а локальная сортировка дала бы неверный порядок.
    if (!activeSort || onSortChange || sortMode === 'server') {
      return rows;
    }
    const column = columns.find((item) => item.key === activeSort.key);
    if (!column?.sortValue) {
      return rows;
    }
    const factor = activeSort.direction === 'asc' ? 1 : -1;
    const sortValue = column.sortValue;
    if (!sortValue) {
      return rows;
    }
    return [...rows].sort((a, b) => {
      const left = sortValue(a);
      const right = sortValue(b);
      if (left === right) {
        return 0;
      }
      return left > right ? factor : -factor;
    });
  }, [activeSort, columns, onSortChange, rows, sortMode]);

  function toggleSort(column: Column<T>) {
    if (!column.sortValue) {
      return;
    }
    const direction: SortDirection =
      activeSort?.key === column.key && activeSort.direction === 'asc' ? 'desc' : 'asc';
    if (onSortChange) {
      onSortChange(column.key, direction);
      return;
    }
    if (sortMode === 'client') {
      setLocalSort({ key: column.key, direction });
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      {loading ? (
        <div>
          {SKELETON_ROWS.map((row) => (
            <div key={row} className="flex gap-4 border-b border-line px-4 py-3.5 last:border-b-0">
              <span className="h-3 w-1/3 rounded bg-line" />
              <span className="h-3 w-1/5 rounded bg-line" />
              <span className="h-3 w-1/4 rounded bg-line" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-muted">{empty}</div>
      ) : (
        <>
          {/* Мобильный вид: строка превращается в карточку, чтобы не прокручивать
              таблицу по горизонтали (DESIGN.md § 5). */}
          <div className="sm:hidden">
            {sortedRows.map((row) => (
              <div
                key={getRowKey(row)}
                className="border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-[13.5px] font-semibold text-ink">
                    {columns[0]?.render(row)}
                  </div>
                  {columns.find((column) => column.key === 'actions') ? (
                    <div className="flex-none">
                      {columns.find((column) => column.key === 'actions')?.render(row)}
                    </div>
                  ) : null}
                </div>
                <dl className="mt-1.5 space-y-0.5">
                  {columns.slice(1).map((column) => {
                    if (column.key === 'actions') {
                      return null;
                    }
                    return (
                      <div key={column.key} className="flex gap-2 text-[12px]">
                        <dt className="flex-none text-muted">{column.header}:</dt>
                        <dd className="min-w-0 text-ink-soft">{column.render(row)}</dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>

          <table className="hidden w-full text-left sm:table">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead>
              <tr>
                {columns.map((column) => {
                  const isActive = activeSort?.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        isActive ? (activeSort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                      }
                      style={column.width ? { width: column.width } : undefined}
                      className={`border-b border-line bg-[#fbfbfc] px-4 py-2.5 text-[11.5px] font-medium text-muted ${
                        column.align === 'right' ? 'text-right' : ''
                      }`}
                    >
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column)}
                          className={`flex items-center gap-1.5 ${
                            isActive ? 'text-ink' : 'text-muted hover:text-ink'
                          } ${column.align === 'right' ? 'ml-auto' : ''}`}
                        >
                          {column.header}
                          <span aria-hidden="true" className={isActive ? 'text-accent' : ''}>
                            {isActive ? (activeSort.direction === 'asc' ? '↑' : '↓') : '↕'}
                          </span>
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={getRowKey(row)} className="border-b border-line last:border-b-0 hover:bg-[#fbfbfc]">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`h-12 px-4 align-middle text-[13px] ${
                        column.align === 'right' ? 'text-right' : ''
                      }`}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {footer ? (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
              {footer}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
