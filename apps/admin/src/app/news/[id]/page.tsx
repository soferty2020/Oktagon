import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import {
  ArchiveNewsForm,
  CommentForm,
  DeleteCommentForm,
  EditNewsForm,
  PublishNewsForm,
} from '../news-forms';

export const metadata = {
  title: 'Новость — OCTAGON',
};

interface NewsCommentView {
  id: string;
  newsPostId: string;
  author: { id: string; firstName: string; lastName: string };
  body: string;
  isDeleted: boolean;
  canDelete: boolean;
  createdAt: string;
}

interface NewsPostDetails {
  id: string;
  title: string;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  author: { id: string; firstName: string; lastName: string };
  isPinned: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  commentsCount: number;
  canEdit: boolean;
  comments: NewsCommentView[];
}

/**
 * Карточка новости с обсуждением (BR-011).
 *
 * Комментировать может любой пользователь, а не только автор новости: BR-011
 * объединяет новости и комментарии. Комментировать можно лишь опубликованное — у
 * черновика нет аудитории.
 */
export default async function NewsPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const post = await apiFetch<NewsPostDetails>(`/news/${id}`, { accessToken });

  if (!post.ok) {
    if (post.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Новость" />
        <Notice tone="error">{describeError(post.error)}</Notice>
      </AppShell>
    );
  }

  const data = post.data;
  const canComment = data.status === 'PUBLISHED';

  return (
    <AppShell user={user}>
      <PageHeader
        title={data.title}
        description={`${data.author.lastName} ${data.author.firstName} · ${
          data.publishedAt
            ? `опубликовано ${formatMoment(data.publishedAt)}`
            : `черновик создан ${formatMoment(data.createdAt)}`
        }`}
        actions={
          <Link href="/news" className="text-sm text-muted hover:text-ink">
            ← Все новости
          </Link>
        }
      />

      {data.archivedAt ? (
        <div className="mb-4">
          <Notice>
            Новость в архиве с {formatMoment(data.archivedAt)}: из ленты она убрана, но остается в
            истории. Правка и повторная публикация недоступны.
          </Notice>
        </div>
      ) : null}

      <article className="rounded-card border border-line bg-white p-5">
        <p className="whitespace-pre-line text-sm text-ink">{data.body}</p>

        {data.canEdit && !data.archivedAt ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {data.status === 'DRAFT' ? <PublishNewsForm postId={data.id} /> : null}
            <ArchiveNewsForm postId={data.id} />
          </div>
        ) : null}
      </article>

      {data.canEdit && !data.archivedAt ? (
        <section className="mt-6 rounded-card border border-line bg-white p-5">
          <h2 className="text-sm font-semibold text-ink">Изменить новость</h2>
          <p className="mt-1 text-xs text-muted">
            Доступно автору и тем, у кого есть право «news.edit».
          </p>
          <div className="mt-3">
            <EditNewsForm post={data} />
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-card border border-line bg-white p-5">
        <h2 className="text-sm font-semibold text-ink">Комментарии: {data.commentsCount}</h2>

        {canComment ? (
          <div className="mt-3">
            <CommentForm postId={data.id} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Комментировать можно только опубликованную новость.
          </p>
        )}

        <ul className="mt-4 flex flex-col gap-3">
          {data.comments.length === 0 ? (
            <li className="text-sm text-muted">Комментариев пока нет</li>
          ) : (
            data.comments.map((comment) => (
              <li
                key={comment.id}
                className={
                  comment.isDeleted
                    ? 'rounded-card border border-line bg-canvas p-3'
                    : 'rounded-card border border-line p-3'
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-ink">
                    {comment.author.lastName} {comment.author.firstName}
                    <span className="ml-2 font-normal text-muted">
                      {formatMoment(comment.createdAt)}
                    </span>
                  </p>
                  {comment.canDelete ? (
                    <DeleteCommentForm commentId={comment.id} postId={data.id} />
                  ) : null}
                </div>

                {comment.isDeleted ? (
                  // Текст удаленного не показывается: в ветке остается только след,
                  // что комментарий был, иначе ответы на него теряют смысл.
                  <p className="mt-1 text-xs italic text-muted">Комментарий удален</p>
                ) : (
                  <p className="mt-1 whitespace-pre-line text-sm text-ink">{comment.body}</p>
                )}
              </li>
            ))
          )}
        </ul>
      </section>
    </AppShell>
  );
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
