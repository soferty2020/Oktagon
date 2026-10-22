'use client';

/**
 * Обработчик ошибок рендера.
 *
 * Нужен, потому что страницы админки — серверные компоненты: без этого
 * обработчика падение любого запроса показывало бы техническую страницу Next
 * вместо понятного сообщения (docs/12-ui-guidelines.md).
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-card bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-ink">Не удалось открыть раздел</h1>
        <p className="text-sm text-muted">
          Проверьте, что backend API запущен и доступен по адресу из переменной
          окружения <span className="font-mono text-xs">API_BASE_URL</span>.
        </p>
        {error.digest ? (
          <p className="text-xs text-muted">Код ошибки: {error.digest}</p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white"
        >
          Повторить
        </button>
      </div>
    </main>
  );
}
