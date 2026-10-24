import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/status-badge';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { openDirectChatAction, openGroupChatAction } from './actions';

export const metadata = {
  title: 'Чаты — OCTAGON',
};

interface ConversationMemberView {
  userId: string;
  firstName: string;
  lastName: string;
  role: 'MEMBER' | 'TRAINER';
}

interface MessageView {
  id: string;
  sender: ConversationMemberView;
  body: string;
  isDeleted: boolean;
  createdAt: string;
}

interface ConversationView {
  id: string;
  type: 'GROUP' | 'DIRECT';
  title: string;
  groupId: string | null;
  participants: ConversationMemberView[];
  lastMessage: MessageView | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

interface GroupView {
  id: string;
  name: string;
}

interface UserView {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface PaginatedUsers {
  items: UserView[];
}

/**
 * Чаты (BR-012, ADR-0011, ADR-0012).
 *
 * Раздел требует `chat.use`: без него нет смысла показывать список. Но право не
 * открывает конкретную переписку — она доступна только участникам, и это решает
 * backend. Поэтому список у двух пользователей с одинаковым правом разный.
 *
 * Групповые чаты появляются в списке лениво: чат группы создается при первом
 * обращении участника (ADR-0012), а не при создании группы.
 */
export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; groupId?: string; participantId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const params = await searchParams;
  const canUseChat = user.permissions.includes('chat.use');

  if (!canUseChat) {
    return (
      <AppShell user={user}>
        <PageHeader title="Чаты" />
        <Notice>
          Раздел доступен с правом «chat.use». Право открывает функцию: конкретная переписка
          доступна только ее участникам.
        </Notice>
      </AppShell>
    );
  }

  const { accessToken } = await readTokens();
  const conversations = await apiFetch<ConversationView[]>('/conversations', { accessToken });

  // Собеседников выбираем из списка пользователей: он доступен только с правом
  // `users.manage`, поэтому для остальных форма открытия диалога скрыта, а не
  // показывает пустой список.
  const canListUsers = user.permissions.includes('users.manage');
  const users = canListUsers
    ? await apiFetch<PaginatedUsers>('/users?perPage=100&status=ACTIVE', { accessToken })
    : null;

  const groups = user.permissions.includes('groups.view')
    ? await apiFetch<GroupView[]>('/groups', { accessToken })
    : null;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Чаты"
        description="Групповые чаты своих групп и личные переписки (BR-012)."
      />

      {params.error ? (
        <div className="mb-4">
          <Notice tone="error">{params.error}</Notice>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="rounded-card border border-line bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Диалоги</h2>
            <p className="text-xs text-muted">
              Чаты групп появляются при первом обращении участника
            </p>
          </div>

          <ul>
            {!conversations.ok ? (
              <li className="px-4 py-6">
                <Notice tone="error">{describeError(conversations.error)}</Notice>
              </li>
            ) : conversations.data.length === 0 ? (
              <li className="px-4 py-6">
                <Notice>
                  Диалогов пока нет. Откройте чат группы или напишите пользователю — переписка
                  появится здесь.
                </Notice>
              </li>
            ) : (
              conversations.data.map((conversation) => (
                <li key={conversation.id} className="border-b border-line last:border-0">
                  <Link
                    href={`/chats/${conversation.id}`}
                    className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-canvas"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {conversation.type === 'GROUP' ? (
                          <span className="mr-2 rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                            группа
                          </span>
                        ) : (
                          <span className="mr-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                            личный
                          </span>
                        )}
                        {conversation.title}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {conversation.lastMessage
                          ? lastMessagePreview(conversation.lastMessage)
                          : 'Сообщений пока нет'}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {conversation.unreadCount > 0 ? (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-white">
                          {conversation.unreadCount}
                        </span>
                      ) : null}
                      <p className="mt-1 text-xs text-muted">
                        {formatMoment(conversation.lastMessageAt ?? conversation.createdAt)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          {groups?.ok && groups.data.length > 0 ? (
            <section className="rounded-card border border-line bg-white p-4">
              <h2 className="text-sm font-semibold text-ink">Чат группы</h2>
              <p className="mt-1 text-xs text-muted">
                Доступен тренерам группы и представителям ее спортсменов.
              </p>
              <ul className="mt-3 flex flex-col gap-2">
                {groups.data.map((group) => (
                  <li key={group.id}>
                    <form action={openGroupChatAction}>
                      <input type="hidden" name="groupId" value={group.id} />
                      <button
                        type="submit"
                        className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-left text-xs text-ink hover:bg-canvas"
                      >
                        {group.name}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {users?.ok ? (
            <section className="rounded-card border border-line bg-white p-4">
              <h2 className="text-sm font-semibold text-ink">Личный диалог</h2>
              <p className="mt-1 text-xs text-muted">
                BR-012: диалог может начать и родитель, и тренер. Повторное открытие вернет ту же
                переписку.
              </p>
              <ul className="mt-3 flex max-h-80 flex-col gap-2 overflow-y-auto">
                {users.data.items
                  .filter((candidate) => candidate.id !== user.id)
                  .map((candidate) => (
                    <li key={candidate.id}>
                      <form action={openDirectChatAction}>
                        <input type="hidden" name="participantId" value={candidate.id} />
                        <button
                          type="submit"
                          className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-left text-xs text-ink hover:bg-canvas"
                        >
                          {candidate.lastName} {candidate.firstName}
                          <span className="ml-2">
                            <StatusBadge value={candidate.role} />
                          </span>
                        </button>
                      </form>
                    </li>
                  ))}
              </ul>
            </section>
          ) : (
            <Notice>
              Список пользователей доступен с правом «users.manage». Личный диалог можно открыть из
              карточки пользователя.
            </Notice>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** Превью последнего сообщения: удаленное не раскрывает текст (ADR-0012). */
function lastMessagePreview(message: MessageView): string {
  const author = `${message.sender.lastName} ${message.sender.firstName}`;
  if (message.isDeleted) {
    return `${author}: сообщение удалено`;
  }
  return `${author}: ${message.body}`;
}

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
