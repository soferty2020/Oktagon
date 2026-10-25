'use client';

import { fieldClass } from '@/components/ui';

import { useActionState } from 'react';

import { deleteMessageAction, sendMessageAction, type ChatFormState } from '@/app/chats/actions';

const initialState: ChatFormState = {};

const inputClass = fieldClass;

/**
 * Отправка сообщения.
 *
 * Форма не проверяет участие в диалоге: это решает backend на каждом запросе,
 * потому что состав группы может измениться (ADR-0012). Интерфейс лишь не
 * показывает поле там, где отвечать нельзя.
 */
export function MessageForm({ conversationId }: { conversationId: string }) {
  const [state, formAction, pending] = useActionState(sendMessageAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="conversationId" value={conversationId} />
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        Сообщение
        <textarea name="body" required rows={2} maxLength={4000} className={inputClass} />
      </label>

      {state.error ? (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Отправка…' : 'Отправить'}
      </button>
    </form>
  );
}

/** Удаление своего сообщения: в переписке остается след, что оно было. */
export function DeleteMessageForm({
  messageId,
  conversationId,
}: {
  messageId: string;
  conversationId: string;
}) {
  return (
    <form
      action={deleteMessageAction}
      onSubmit={(event) => {
        if (!confirm('Удалить сообщение? В переписке останется след, что оно было.')) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <button type="submit" className="text-xs text-muted underline hover:text-red-700">
        Удалить
      </button>
    </form>
  );
}
