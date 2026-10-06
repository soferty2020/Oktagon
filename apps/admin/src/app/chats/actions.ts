'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface ChatFormState {
  error?: string;
}

/**
 * Server actions чатов (BR-012, ADR-0011, ADR-0012).
 *
 * Доступ проверяет backend: интерфейс не может решить, участник ли пользователь
 * диалога, потому что состав группового чата вычисляется по группе.
 */
async function withSession<T>(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
): Promise<{ error?: string; data?: T }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const result = await action(accessToken);
  if (!result.ok) {
    return { error: describeChatError(result.error) };
  }

  return { data: result.data };
}

function revalidateChat(conversationId?: string): void {
  revalidatePath('/chats');
  if (conversationId) {
    revalidatePath(`/chats/${conversationId}`);
  }
}

/**
 * Открытие диалога с пользователем.
 *
 * Повторный запрос возвращает существующий диалог (ADR-0012), поэтому действие
 * можно вызывать многократно: второй переписки с тем же собеседником не будет.
 */
export async function openDirectChatAction(formData: FormData): Promise<void> {
  const participantId = String(formData.get('participantId') ?? '');
  if (!participantId) {
    return;
  }

  const state = await withSession<{ id: string }>((accessToken) =>
    apiFetch('/conversations', {
      accessToken,
      method: 'POST',
      body: { participantIds: [participantId] },
    }),
  );

  if (state.error || !state.data) {
    redirect(`/chats?error=${encodeURIComponent(state.error ?? 'Диалог не открыт')}`);
  }

  revalidateChat(state.data.id);
  redirect(`/chats/${state.data.id}`);
}

/** Открытие чата группы: доступен тренерам группы и представителям спортсменов. */
export async function openGroupChatAction(formData: FormData): Promise<void> {
  const groupId = String(formData.get('groupId') ?? '');
  if (!groupId) {
    return;
  }

  const state = await withSession<{ id: string }>((accessToken) =>
    apiFetch('/conversations', {
      accessToken,
      method: 'POST',
      body: { groupId },
    }),
  );

  if (state.error || !state.data) {
    redirect(`/chats?error=${encodeURIComponent(state.error ?? 'Чат не открыт')}`);
  }

  revalidateChat(state.data.id);
  redirect(`/chats/${state.data.id}`);
}

/** Отправка сообщения: только участник диалога. */
export async function sendMessageAction(
  _prev: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  const conversationId = String(formData.get('conversationId') ?? '');
  const body = String(formData.get('body') ?? '').trim();

  if (!conversationId) {
    return { error: 'Не указан диалог' };
  }
  if (!body) {
    return { error: 'Сообщение пусто' };
  }

  const state = await withSession((accessToken) =>
    apiFetch(`/conversations/${conversationId}/messages`, {
      accessToken,
      method: 'POST',
      body: { body },
    }),
  );

  if (!state.error) {
    revalidateChat(conversationId);
  }
  return state;
}

/** Удаление своего сообщения: мягкое, в переписке остается след. */
export async function deleteMessageAction(formData: FormData): Promise<void> {
  const messageId = String(formData.get('messageId') ?? '');
  const conversationId = String(formData.get('conversationId') ?? '');
  if (!messageId) {
    return;
  }

  await withSession((accessToken) =>
    apiFetch(`/messages/${messageId}`, { accessToken, method: 'DELETE' }),
  );

  revalidateChat(conversationId || undefined);
}

function describeChatError(error: ApiFailure): string {
  switch (error.code) {
    case 'CONVERSATION_NOT_FOUND':
      return 'Диалог недоступен: возможно, вы не участник или состав группы изменился';
    case 'CONVERSATION_ACCESS_DENIED':
      return 'Чат группы доступен тренерам группы и представителям ее спортсменов';
    case 'CONVERSATION_PARTICIPANTS_INVALID':
      return 'Личный диалог создается ровно с одним собеседником';
    case 'CONVERSATION_TYPE_INVALID':
      return 'Укажите либо группу, либо собеседника';
    case 'MESSAGE_NOT_FOUND':
      return 'Сообщение не найдено: возможно, оно уже удалено';
    case 'FORBIDDEN':
      return 'Недостаточно прав: для чатов нужно право «chat.use»';
    case 'SERVICE_UNAVAILABLE':
      return 'Backend API недоступен. Проверьте, что он запущен.';
    default:
      return error.message;
  }
}
