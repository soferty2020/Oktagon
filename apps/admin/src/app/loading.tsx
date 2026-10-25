/**
 * Скелетон загрузки для всех разделов админки.
 *
 * Страницы серверные: пока данные не пришли, Next показывает этот файл вместо
 * белого экрана. В макете это состояние `state-loading` — серые плашки вместо
 * карточек, чтобы не дёргать вёрстку после подгрузки.
 *
 * Разметка повторяет основную сетку: заголовок, строка кнопок, четыре KPI и
 * таблица. Пульсация отключена при `prefers-reduced-motion`, чтобы не мигало.
 *
 * Ключи — стабильные имена слотов, а не индексы: линтер запрещает index как key,
 * и правильно делает — при перестановке блоков такой ключ теряет состояние.
 */
const KPI_SLOTS = ['athletes', 'revenue', 'debt', 'attendance'] as const;
const ROW_SLOTS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="animate-pulse motion-reduce:animate-none">
      <span className="sr-only">Загрузка данных</span>

      <div className="mb-5 space-y-2">
        <div className="h-6 w-48 rounded-control bg-line/70" />
        <div className="h-4 w-80 rounded-control bg-line/50" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_SLOTS.map((slot) => (
          <div key={slot} className="rounded-card border border-line bg-white p-5">
            <div className="h-3 w-24 rounded-control bg-line/60" />
            <div className="mt-4 h-8 w-32 rounded-control bg-line/70" />
            <div className="mt-3 h-3 w-20 rounded-control bg-line/40" />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-card border border-line bg-white p-5">
        <div className="h-4 w-40 rounded-control bg-line/60" />

        <div className="mt-5 space-y-4">
          {ROW_SLOTS.map((slot) => (
            <div key={slot} className="flex items-center gap-4">
              <div className="h-3 w-40 rounded-control bg-line/60" />
              <div className="h-3 flex-1 rounded-control bg-line/40" />
              <div className="h-6 w-20 rounded-full bg-line/50" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
