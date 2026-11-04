/**
 * Панель фильтров реестра.
 *
 * Одна строка на десктопе, колонка на мобильном; высота элементов 44 px на
 * телефоне — по требованию доступности. Поиск и фильтры обязаны уходить в API,
 * поэтому компонент только раскладывает поля, а не хранит их значения.
 */
export function FiltersBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
    </div>
  );
}

/** Поле поиска внутри панели фильтров. */
export function FiltersSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-control border border-line px-3 sm:h-10 sm:min-w-[240px]">
      <span aria-hidden="true" className="text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" role="img">`n          <title>Поиск</title>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
      />
    </label>
  );
}
