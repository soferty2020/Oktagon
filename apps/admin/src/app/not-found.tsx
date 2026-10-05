import Link from 'next/link';

export const metadata = {
  title: 'Не найдено — OCTAGON',
};

/** 404: карточка запрошена по несуществующему или архивированному идентификатору. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Запись не найдена</h1>
        <p className="text-sm text-slate-600">
          Возможно, она была архивирована или находится вне вашей зоны доступа.
        </p>
        <Link
          href="/"
          className="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
