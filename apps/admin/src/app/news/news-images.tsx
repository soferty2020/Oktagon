'use client';

import Image from 'next/image';
import { useActionState } from 'react';

import {
  deleteNewsImageAction,
  uploadNewsImageAction,
  type NewsImageState,
} from './image-actions';

const initialState: NewsImageState = {};

interface NewsImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
}

/**
 * Фотографии новости (#70).
 *
 * Не больше трёх: список и карточка не резиновые, а четвёртое фото никто не
 * досматривает. Первое — обложка в ленте.
 */
export function NewsImagesBlock({
  postId,
  images,
  canEdit,
}: {
  postId: string;
  images: NewsImage[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(uploadAction, initialState);
  const canAdd = canEdit && images.length < 3;

  return (
    <section className="rounded-card border border-line bg-white p-6">
      <h2 className="text-base font-semibold text-ink">Фотографии</h2>
      <p className="mt-1 text-xs text-muted">
        До трёх штук, до 5 МБ, JPEG, PNG или WebP. Первая — обложка в ленте.
      </p>

      {images.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image) => (
            <figure className="overflow-hidden rounded-lg border border-line" key={image.id}>
              {/* Файл уже отдан API в нужном размере: оптимизатор Next ему не нужен. */}
              <Image
                alt=""
                className="h-32 w-full object-cover"
                height={image.height ?? 240}
                src={image.url}
                unoptimized
                width={image.width ?? 320}
              />
              {canEdit ? (
                <form action={deleteNewsImageAction} className="border-t border-line p-2 text-right">
                  <input name="postId" type="hidden" value={postId} />
                  <input name="imageId" type="hidden" value={image.id} />
                  <button className="text-xs text-muted underline hover:text-red-700" type="submit">
                    Удалить
                  </button>
                </form>
              ) : null}
            </figure>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Фотографий пока нет.</p>
      )}

      {canAdd ? (
        <form action={formAction} className="mt-4 border-t border-line pt-4">
          <input name="postId" type="hidden" value={postId} />
          <div className="flex flex-wrap items-center gap-3">
            <input
              accept="image/jpeg,image/png,image/webp"
              className="text-xs text-ink"
              name="file"
              required
              type="file"
            />
            <button
              className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              disabled={pending}
              type="submit"
            >
              {pending ? 'Загружаем…' : 'Добавить фото'}
            </button>
          </div>
          {state.error ? <p className="mt-2 text-xs text-red-700">{state.error}</p> : null}
          {state.success ? <p className="mt-2 text-xs text-emerald-700">{state.success}</p> : null}
        </form>
      ) : null}

      {canEdit && images.length >= 3 ? (
        <p className="mt-3 text-xs text-muted">
          Достигнут предел: три фотографии. Удалите одну, чтобы добавить другую.
        </p>
      ) : null}
    </section>
  );
}

/** Подпись под `useActionState`: (state, formData) → state. */
async function uploadAction(_prev: NewsImageState, formData: FormData) {
  return uploadNewsImageAction(_prev, formData);
}
