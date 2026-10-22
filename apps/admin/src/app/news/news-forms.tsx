'use client';

import { useActionState, useState } from 'react';

import {
  addCommentAction,
  archiveNewsAction,
  createNewsAction,
  deleteCommentAction,
  publishNewsAction,
  updateNewsAction,
  type NewsFormState,
} from '@/app/news/actions';

const initialState: NewsFormState = {};

const inputClass =
  'w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent';
const labelClass = 'flex flex-col gap-1 text-xs font-medium text-muted';
const buttonClass =
  'rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60';
const secondaryButtonClass =
  'rounded-md border border-line bg-white px-3 py-1.5 text-xs text-ink hover:bg-canvas disabled:opacity-60';

function StateMessages({ state }: { state: NewsFormState }) {
  return (
    <>
      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {state.success}
        </p>
      ) : null}
    </>
  );
}

/** Создание новости. По умолчанию — черновик: публикация это отдельное решение. */
export function CreateNewsForm() {
  const [state, formAction, pending] = useActionState(createNewsAction, initialState);
  const [publishNow, setPublishNow] = useState(false);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-card border border-line bg-white p-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-ink">Новая публикация</h2>
        <p className="mt-1 text-xs text-muted">
          По умолчанию сохраняется черновик: он виден только вам и тем, кто может править чужие
          новости. Публикация — отдельное решение.
        </p>
      </div>

      <label className={labelClass}>
        Заголовок
        <input name="title" required maxLength={200} className={inputClass} />
      </label>

      <label className={labelClass}>
        Текст
        <textarea name="body" required rows={5} maxLength={10000} className={inputClass} />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          name="publish"
          checked={publishNow}
          onChange={(event) => setPublishNow(event.target.checked)}
        />
        опубликовать сразу (иначе сохранится черновик)
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isPinned" />
        закрепить в ленте
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : publishNow ? 'Опубликовать' : 'Сохранить черновик'}
      </button>
    </form>
  );
}

/** Правка новости: доступна автору и владельцам `news.edit`. */
export function EditNewsForm({
  post,
}: {
  post: { id: string; title: string; body: string; isPinned: boolean };
}) {
  const [state, formAction, pending] = useActionState(updateNewsAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="postId" value={post.id} />

      <label className={labelClass}>
        Заголовок
        <input
          name="title"
          required
          maxLength={200}
          defaultValue={post.title}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Текст
        <textarea
          name="body"
          required
          rows={6}
          maxLength={10000}
          defaultValue={post.body}
          className={inputClass}
        />
      </label>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="isPinned" defaultChecked={post.isPinned} />
        закрепить в ленте
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? 'Сохранение…' : 'Сохранить изменения'}
      </button>
    </form>
  );
}

/** Публикация черновика: кнопка появляется только у черновика. */
export function PublishNewsForm({ postId }: { postId: string }) {
  return (
    <form action={publishNewsAction}>
      <input type="hidden" name="postId" value={postId} />
      <button type="submit" className={secondaryButtonClass}>
        Опубликовать
      </button>
    </form>
  );
}

/** Архивирование: новость уходит из ленты, история остается. */
export function ArchiveNewsForm({ postId }: { postId: string }) {
  return (
    <form
      action={archiveNewsAction}
      onSubmit={(event) => {
        if (!confirm('Убрать новость в архив? Она исчезнет из ленты, но останется в истории.')) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="postId" value={postId} />
      <button type="submit" className={secondaryButtonClass}>
        В архив
      </button>
    </form>
  );
}

/**
 * Комментарий к новости.
 *
 * Доступен любому пользователю: BR-011 объединяет новости и комментарии, и
 * отдельного права на обсуждение в каталоге нет.
 */
export function CommentForm({ postId }: { postId: string }) {
  const [state, formAction, pending] = useActionState(addCommentAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="postId" value={postId} />
      <label className={labelClass}>
        Комментарий
        <textarea name="body" required rows={2} maxLength={2000} className={inputClass} />
      </label>

      <StateMessages state={state} />

      <button type="submit" disabled={pending} className={`${buttonClass} self-start`}>
        {pending ? 'Отправка…' : 'Отправить'}
      </button>
    </form>
  );
}

/** Удаление комментария: автор удаляет свой, модератор — любой. */
export function DeleteCommentForm({ commentId, postId }: { commentId: string; postId: string }) {
  return (
    <form
      action={deleteCommentAction}
      onSubmit={(event) => {
        if (!confirm('Удалить комментарий? В ветке останется след, что он был.')) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="postId" value={postId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Удалить
      </button>
    </form>
  );
}
