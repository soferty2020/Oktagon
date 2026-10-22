import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateNewsForm, PublishNewsForm } from './news-forms';

export const metadata = {
  title: 'Новости — OCTAGON',
};

interface NewsPostView {
  id: string;
  title: string;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  author: { id: string; firstName: string; lastName: string };
  isPinned: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  commentsCount: number;
  canEdit: boolean;
}

/**
 * Новости клуба (BR-011, ADR-0011).
 *
 * **Раздел открыт всем вошедшим**: BR-011 говорит, что новости видны всем
 * пользователям клуба, и права на чтение в каталоге нет. Права `news.*` решают,
 * что пользователь может сделать, а не что увидеть.
 *
 * Поэтому здесь нет экрана «нет доступа»: вместо него интерфейс показывает ленту
 * всем, а формы создания и кнопки действий — только тем, кто вправе их нажать.
 */
export default async function NewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; includeArchived?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;
  const { accessToken } = await readTokens();

  const query = new URLSearchParams();
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.search) {
    query.set('search', params.search);
  }
  if (params.includeArchived === 'true') {
    query.set('includeArchived', 'true');
  }

  const posts = await apiFetch<NewsPostView[]>(
    `/news${query.size > 0 ? `?${query.toString()}` : ''}`,
    { accessToken },
  );

  const canCreate = user.permissions.includes('news.create');

  return (
    <AppShell user={user}>
      <PageHeader
        title="Новости"
        description="Новости и комментарии видны всем пользователям клуба (BR-011)."
        actions={
          <form action="/news" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Статус
              <select
                name="status"
                defaultValue={params.status ?? ''}
                className="rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
              >
                <option value="">все доступные</option>
                <option value="PUBLISHED">опубликованные</option>
                <option value="DRAFT">черновики</option>
                <option value="ARCHIVED">архив</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              Поиск
              <input
                name="search"
                defaultValue={params.search ?? ''}
                className="rounded-md border border-line px-2 py-1 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-2 pb-1 text-xs text-muted">
              <input
                type="checkbox"
                name="includeArchived"
                value="true"
                defaultChecked={params.includeArchived === 'true'}
              />
              с архивом
            </label>
            <button
              type="submit"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-canvas"
            >
              Показать
            </button>
          </form>
        }
      />

      <div className={canCreate ? 'grid gap-6 lg:grid-cols-[1.4fr_1fr]' : ''}>
        <div className="flex flex-col gap-4">
          {!posts.ok ? <Notice tone="error">{describeError(posts.error)}</Notice> : null}

          {posts.ok && posts.data.length === 0 ? (
            <Notice>Новостей пока нет. {canCreate ? 'Создайте первую — форма справа.' : ''}</Notice>
          ) : null}

          {posts.ok
            ? posts.data.map((post) => (
                <article key={post.id} className="rounded-card border border-line bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-ink">
                        {post.isPinned ? (
                          <span className="mr-2 rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                            закреплено
                          </span>
                        ) : null}
                        <Link
                          href={`/news/${post.id}`}
                          className="underline decoration-line hover:decoration-accent"
                        >
                          {post.title}
                        </Link>
                      </h2>
                      <p className="mt-1 text-xs text-muted">
                        {post.author.lastName} {post.author.firstName} ·{' '}
                        {post.publishedAt
                          ? `опубликовано ${formatMoment(post.publishedAt)}`
                          : `создано ${formatMoment(post.createdAt)}`}
                        {post.archivedAt ? ` · в архиве с ${formatMoment(post.archivedAt)}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={post.status} />
                      {post.canEdit && post.status === 'DRAFT' ? (
                        <PublishNewsForm postId={post.id} />
                      ) : null}
                    </div>
                  </div>

                  <p className="mt-3 whitespace-pre-line text-sm text-ink">{post.body}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <Link href={`/news/${post.id}`} className="underline hover:text-ink">
                      Комментарии: {post.commentsCount}
                    </Link>
                    {post.canEdit ? (
                      <Link href={`/news/${post.id}`} className="underline hover:text-ink">
                        Изменить
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))
            : null}
        </div>

        {canCreate ? <CreateNewsForm /> : null}
      </div>
    </AppShell>
  );
}

/** Статус новости: черновик и архив — это разные причины невидимости. */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'черновик', className: 'bg-amber-50 text-amber-700' },
    PUBLISHED: { label: 'опубликовано', className: 'bg-emerald-50 text-emerald-700' },
    ARCHIVED: { label: 'в архиве', className: 'bg-canvas text-muted' },
  };
  const badge = map[status] ?? { label: status, className: 'bg-canvas text-muted' };

  return <span className={`rounded-full px-2 py-1 text-xs ${badge.className}`}>{badge.label}</span>;
}

/** Момент UTC в виде «01.04.2026 18:00». */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}
