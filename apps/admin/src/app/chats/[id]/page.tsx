import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { DeleteMessageForm, MessageForm } from '../chat-forms';

export const metadata = {
  title: 'Диалог — OCTAGON',
};

interface ConversationMemberView {
  userId: string;
  firstName: string;
  lastName: string;
  role: 'MEMBER' | 'TRAINER';
}

interface MessageView {
  id: string;
  conversationId: string;
  sender: ConversationMemberView;
  body: string;
  isDeleted: boolean;
  canDelete: boolean;
  createdAt: string;
}

interface ConversationDetails {
  id: string;
  type: 'GROUP' | 'DIRECT';
  title: string;
  groupId: string | null;
  participants: ConversationMemberView[];
  lastMessage: MessageView | null;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  messages: MessageView[];
  olderCursor: string | null;
}

/**
 * Переписка (BR-012).
 *
 * Открытие страницы сдвигает `lastReadAt`: сообщения считаются прочитанными,
 * когда их действительно показали (ADR-0012). Поэтому возврат к списку покажет
 * этот диалог без счетчика непрочитанных.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ olderThan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { olderThan } = await searchParams;
  const { accessToken } = await readTokens();

  const query = olderThan ? `?olderThan=${encodeURIComponent(olderThan)}` : '';
  const conversation = await apiFetch<ConversationDetails>(`/conversations/${id}${query}`, {
    accessToken,
  });

  if (!conversation.ok) {
    if (conversation.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Диалог" />
        <Notice tone="error">{describeError(conversation.error)}</Notice>
      </AppShell>
    );
  }

  const data = conversation.data;
  const trainers = data.participants.filter((participant) => participant.role === 'TRAINER');

  return (
    <AppShell user={user}>
      <PageHeader
        title={data.title}
        description={`${data.type === 'GROUP' ? 'Чат группы' : 'Личный диалог'} · участников ${
          data.participants.length
        }`}
        actions={
          <Link href="/chats" className="text-sm text-slate-500 hover:text-slate-900">
            ← Все чаты
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white">
          {data.olderCursor ? (
            <div className="border-b border-slate-100 px-4 py-2 text-center">
              <Link
                href={`/chats/${data.id}?olderThan=${encodeURIComponent(data.olderCursor)}`}
                className="text-xs text-slate-500 underline hover:text-slate-900"
              >
                Показать более старые сообщения
              </Link>
            </div>
          ) : null}

          <ul className="flex flex-col gap-3 p-4">
            {data.messages.length === 0 ? (
              <li className="text-sm text-slate-500">Сообщений пока нет</li>
            ) : (
              data.messages.map((message) => {
                const isOwn = message.sender.userId === user.id;

                return (
                  <li
                    key={message.id}
                    className={isOwn ? 'flex flex-col items-end' : 'flex flex-col items-start'}
                  >
                    <div className="flex items-baseline gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {isOwn ? 'Вы' : `${message.sender.lastName} ${message.sender.firstName}`}
                      </span>
                      {message.sender.role === 'TRAINER' ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                          тренер
                        </span>
                      ) : null}
                      <span>{formatMoment(message.createdAt)}</span>
                    </div>

                    <div
                      className={
                        message.isDeleted
                          ? 'mt-1 max-w-xl rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm italic text-slate-400'
                          : isOwn
                            ? 'mt-1 max-w-xl rounded-lg bg-slate-900 px-3 py-2 text-sm text-white'
                            : 'mt-1 max-w-xl rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800'
                      }
                    >
                      {message.isDeleted ? (
                        // Текст удаленного не отдается backend'ом: в переписке
                        // остается только след, что сообщение было.
                        'Сообщение удалено'
                      ) : (
                        <span className="whitespace-pre-line">{message.body}</span>
                      )}
                    </div>

                    {message.canDelete ? (
                      <div className="mt-1">
                        <DeleteMessageForm messageId={message.id} conversationId={data.id} />
                      </div>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>

          <div className="border-t border-slate-100 p-4">
            <MessageForm conversationId={data.id} />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Участники</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {data.participants.map((participant) => (
              <li key={participant.userId} className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-700">
                  {participant.lastName} {participant.firstName}
                  {participant.userId === user.id ? (
                    <span className="ml-1 text-xs text-slate-400">(вы)</span>
                  ) : null}
                </span>
                <span
                  className={
                    participant.role === 'TRAINER'
                      ? 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600'
                      : 'rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-500'
                  }
                >
                  {participant.role === 'TRAINER' ? 'тренер' : 'представитель'}
                </span>
              </li>
            ))}
          </ul>

          {data.type === 'GROUP' ? (
            <p className="mt-4 text-xs text-slate-500">
              Состав чата группы пересчитывается по группе: тренеры и представители спортсменов с
              активным членством. {trainers.length === 0 ? 'Тренеров в чате нет.' : ''}
              Ушедший из группы теряет доступ.
            </p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
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
