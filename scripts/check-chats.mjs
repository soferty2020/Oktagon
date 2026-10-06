/**
 * Живая проверка чатов по HTTP (BR-012, ADR-0011, ADR-0012).
 *
 * Проверяет то, что нельзя подтвердить типами: состав группового чата
 * вычисляется по группе, доступ определяется участием, а непрочитанные
 * считаются от отметки о прочтении.
 *
 * Сценарий строит собственные данные (тренер, группа, спортсмен, родитель),
 * потому что проверять чат нужно на живых связях: тренер группы и представитель
 * спортсмена. Все сущности создаются с уникальным суффиксом, поэтому повторный
 * запуск не конфликтует с предыдущим.
 *
 * Использование:
 *   node scripts/check-chats.mjs [baseUrl] [apiBaseUrl]
 */
import {
  DEFAULT_ADMIN_BASE,
  DEFAULT_API_BASE,
  apiCall,
  apiLogin,
  fetchHtml,
  loginCookies,
} from './admin-check-client.mjs';

const base = process.argv[2] ?? DEFAULT_ADMIN_BASE;
const apiBase = process.argv[3] ?? DEFAULT_API_BASE;
const adminEmail = process.env.ADMIN_EMAIL ?? 'superadmin@octagon.local';
const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe-Octagon-2026!';

const stamp = Date.now();
const failures = [];

/** Печатает шаг и, если утверждение ложно, запоминает падение. */
function check(step, label, condition, detail = '') {
  if (!condition) {
    failures.push(`${step} ${label}`);
  }
  console.log(`${condition ? '✔' : '✕'} ${step}. ${label}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Создает аккаунт через приглашение: саморегистрации нет.
 *
 * Возвращает и access-токен, и cookie админки: чаты проверяются и по API, и на
 * страницах.
 *
 * В email входит порядковый номер: роль и время недостаточны, чтобы различить
 * два аккаунта с одной ролью. Без номера второй вызов вернул бы первый аккаунт
 * (или ошибку «email занят»), и проверка доступа шла бы от имени участника —
 * то есть молча проверяла бы не то.
 */
let accountSequence = 0;

async function createAccount(adminToken, role, firstName, lastName) {
  accountSequence += 1;
  const email = `chat-${role.toLowerCase()}-${accountSequence}-${stamp}@octagon.local`;
  const password = `Chat-${role}-${accountSequence}-2026!`;

  const invite = await apiCall(apiBase, adminToken, 'POST', '/users/invites', { email, role });
  await apiCall(apiBase, '', 'POST', '/auth/accept-invite', {
    token: invite.body?.token,
    email,
    password,
    firstName,
    lastName,
  });

  const login = await apiCall(apiBase, '', 'POST', '/auth/login', { email, password });
  return {
    email,
    password,
    id: login.body?.user?.id,
    token: login.body?.accessToken ?? '',
    permissions: login.body?.user?.permissions?.codes ?? [],
  };
}

async function main() {
  const adminToken = await apiLogin(apiBase, adminEmail, adminPassword);
  const { cookie: adminCookie } = await loginCookies({
    base,
    email: adminEmail,
    password: adminPassword,
  });

  // --- Данные сценария -----------------------------------------------------

  const trainer = await createAccount(adminToken, 'STAFF', 'Тренер', `Чатов ${stamp}`);
  const parent = await createAccount(adminToken, 'MEMBER', 'Родитель', `Чатов ${stamp}`);
  // Посторонний — STAFF: у него есть доступ к структуре клуба, но нет участия в
  // нашей группе. Так проверяется именно ресурсный доступ, а не отсутствие прав:
  // у MEMBER базовых прав нет вообще, и он упал бы на другом шаге.
  const stranger = await createAccount(adminToken, 'STAFF', 'Посторонний', `Чатов ${stamp}`);

  check(
    1,
    'аккаунты созданы: доступ к чатам не требует права chat.use',
    Boolean(trainer.id) && Boolean(parent.id) && !parent.permissions.includes('chat.use'),
    `прав у тренера ${trainer.permissions.length} (chat.use: ${trainer.permissions.includes(
      'chat.use',
    )}), у родителя ${parent.permissions.length} (chat.use: ${parent.permissions.includes(
      'chat.use',
    )}) — разговор родителя с тренером правом не обусловлен (BR-012)`,
  );

  const trainerProfile = await apiCall(apiBase, adminToken, 'POST', '/trainers', {
    displayName: `Тренер чатов ${stamp}`,
    userId: trainer.id,
  });

  const group = await apiCall(apiBase, adminToken, 'POST', '/groups', {
    name: `Группа чатов ${stamp}`,
  });
  await apiCall(apiBase, adminToken, 'POST', `/groups/${group.body?.id}/trainers`, {
    trainerId: trainerProfile.body?.id,
  });

  const athlete = await apiCall(apiBase, adminToken, 'POST', '/athletes', {
    firstName: 'Спортсмен',
    lastName: `Чатов ${stamp}`,
    birthDate: '2015-09-01',
  });
  await apiCall(apiBase, adminToken, 'POST', `/groups/${group.body?.id}/members`, {
    athleteId: athlete.body?.id,
  });
  await apiCall(apiBase, adminToken, 'POST', `/athletes/${athlete.body?.id}/accounts`, {
    userId: parent.id,
    relation: 'PARENT',
  });

  check(
    2,
    'группа, тренер и спортсмен связаны',
    Boolean(trainerProfile.body?.id) && Boolean(group.body?.id) && Boolean(athlete.body?.id),
  );

  // --- Групповой чат -------------------------------------------------------

  const trainerStart = await apiCall(apiBase, trainer.token, 'POST', '/conversations', {
    groupId: group.body?.id,
  });
  const participants = trainerStart.body?.participants ?? [];
  check(
    3,
    'тренер открыл чат группы: состав вычислен по группе',
    trainerStart.status === 201 &&
      trainerStart.body?.type === 'GROUP' &&
      participants.some((item) => item.userId === trainer.id && item.role === 'TRAINER') &&
      participants.some((item) => item.userId === parent.id && item.role === 'MEMBER'),
    `участников ${participants.length}, статус ${trainerStart.status}`,
  );

  const parentStart = await apiCall(apiBase, parent.token, 'POST', '/conversations', {
    groupId: group.body?.id,
  });
  check(
    4,
    'родитель получил тот же чат, а не второй',
    parentStart.body?.id === trainerStart.body?.id,
    `id ${parentStart.body?.id === trainerStart.body?.id ? 'совпадает' : 'РАЗНЫЙ'}`,
  );

  const strangerChat = await apiCall(apiBase, stranger.token, 'POST', '/conversations', {
    groupId: group.body?.id,
  });
  check(
    5,
    'посторонний не может открыть чат группы',
    strangerChat.status === 403 && strangerChat.body?.code === 'CONVERSATION_ACCESS_DENIED',
    `${strangerChat.status} ${strangerChat.body?.code ?? ''}`,
  );

  const conversationId = trainerStart.body?.id;

  const trainerList = await apiCall(apiBase, trainer.token, 'GET', '/conversations');
  const parentList = await apiCall(apiBase, parent.token, 'GET', '/conversations');
  const strangerList = await apiCall(apiBase, stranger.token, 'GET', '/conversations');
  check(
    6,
    'чат виден участникам и не виден постороннему',
    (trainerList.body ?? []).some((item) => item.id === conversationId) &&
      (parentList.body ?? []).some((item) => item.id === conversationId) &&
      !(strangerList.body ?? []).some((item) => item.id === conversationId),
    `у постороннего диалогов ${(strangerList.body ?? []).length}`,
  );

  const sent = await apiCall(
    apiBase,
    trainer.token,
    'POST',
    `/conversations/${conversationId}/messages`,
    {
      body: 'Занятие переносится на 18:00',
    },
  );
  check(
    7,
    'тренер отправил сообщение, роль отправителя — тренер',
    sent.status === 201 && sent.body?.sender?.role === 'TRAINER' && sent.body?.canDelete === true,
    `статус ${sent.status}, роль ${sent.body?.sender?.role}`,
  );

  const afterSend = await apiCall(apiBase, parent.token, 'GET', '/conversations');
  const parentConversation = (afterSend.body ?? []).find((item) => item.id === conversationId);
  check(
    8,
    'у родителя одно непрочитанное сообщение',
    parentConversation?.unreadCount === 1,
    `непрочитанных ${parentConversation?.unreadCount}`,
  );

  const parentRead = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/conversations/${conversationId}`,
  );
  check(
    9,
    'родитель читает переписку и видит сообщение',
    parentRead.status === 200 &&
      parentRead.body?.messages?.length === 1 &&
      parentRead.body?.unreadCount === 0,
    `сообщений ${parentRead.body?.messages?.length}, непрочитанных ${parentRead.body?.unreadCount}`,
  );

  const afterRead = await apiCall(apiBase, parent.token, 'GET', '/conversations');
  const readConversation = (afterRead.body ?? []).find((item) => item.id === conversationId);
  check(
    10,
    'после чтения непрочитанных нет',
    readConversation?.unreadCount === 0,
    `непрочитанных ${readConversation?.unreadCount}`,
  );

  const parentMessage = await apiCall(
    apiBase,
    parent.token,
    'POST',
    `/conversations/${conversationId}/messages`,
    { body: 'Хорошо, спасибо' },
  );
  const trainerListAgain = await apiCall(apiBase, trainer.token, 'GET', '/conversations');
  const trainerConversation = (trainerListAgain.body ?? []).find(
    (item) => item.id === conversationId,
  );
  check(
    11,
    'BR-012: сообщение родителя видно тренеру, у тренера оно непрочитано',
    parentMessage.status === 201 && trainerConversation?.unreadCount === 1,
    `статус ${parentMessage.status}, непрочитанных у тренера ${trainerConversation?.unreadCount}`,
  );

  const strangerRead = await apiCall(
    apiBase,
    stranger.token,
    'GET',
    `/conversations/${conversationId}`,
  );
  check(
    12,
    'недоступный диалог отдает 404, а не 403',
    strangerRead.status === 404 && strangerRead.body?.code === 'CONVERSATION_NOT_FOUND',
    `${strangerRead.status} ${strangerRead.body?.code ?? ''}`,
  );

  const strangerSend = await apiCall(
    apiBase,
    stranger.token,
    'POST',
    `/conversations/${conversationId}/messages`,
    { body: 'Постороннее сообщение' },
  );
  check(
    13,
    'посторонний не может писать в чужой диалог',
    strangerSend.status === 404,
    `${strangerSend.status} ${strangerSend.body?.code ?? ''}`,
  );

  // --- Удаление сообщения --------------------------------------------------

  const trainerRead = await apiCall(
    apiBase,
    trainer.token,
    'GET',
    `/conversations/${conversationId}`,
  );
  const trainerMessage = (trainerRead.body?.messages ?? []).find(
    (item) => item.sender.userId === trainer.id,
  );
  const parentSeesTrainerMessage = (trainerRead.body?.messages ?? []).find(
    (item) => item.sender.userId === parent.id,
  );

  check(
    14,
    'признак удаления зависит от отправителя',
    trainerMessage?.canDelete === true && parentSeesTrainerMessage?.canDelete === false,
    `свое ${trainerMessage?.canDelete}, чужое ${parentSeesTrainerMessage?.canDelete}`,
  );

  const deleteForeign = await apiCall(
    apiBase,
    parent.token,
    'DELETE',
    `/messages/${trainerMessage?.id}`,
  );
  check(
    15,
    'чужое сообщение удалить нельзя',
    deleteForeign.status === 403 && deleteForeign.body?.code === 'FORBIDDEN',
    `${deleteForeign.status} ${deleteForeign.body?.code ?? ''}`,
  );

  const deleteOwn = await apiCall(
    apiBase,
    trainer.token,
    'DELETE',
    `/messages/${trainerMessage?.id}`,
  );
  check(
    16,
    'отправитель удаляет свое сообщение',
    deleteOwn.status === 200 && deleteOwn.body?.isDeleted === true,
    `статус ${deleteOwn.status}`,
  );

  const afterDelete = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/conversations/${conversationId}`,
  );
  const deletedMessage = (afterDelete.body?.messages ?? []).find(
    (item) => item.id === trainerMessage?.id,
  );
  check(
    17,
    'удаленное сообщение остается следом со скрытым текстом',
    deletedMessage?.isDeleted === true && deletedMessage?.body === '',
    `isDeleted ${deletedMessage?.isDeleted}, текст ${deletedMessage?.body === '' ? 'скрыт' : 'РАСКРЫТ'}`,
  );

  // --- Личный диалог -------------------------------------------------------

  const direct = await apiCall(apiBase, parent.token, 'POST', '/conversations', {
    participantIds: [trainer.id],
  });
  check(
    18,
    'BR-012: родитель начал личный диалог с тренером',
    direct.status === 201 &&
      direct.body?.type === 'DIRECT' &&
      direct.body?.title?.includes('Тренер'),
    `тип ${direct.body?.type}, название «${direct.body?.title}»`,
  );

  const directAgain = await apiCall(apiBase, trainer.token, 'POST', '/conversations', {
    participantIds: [parent.id],
  });
  check(
    19,
    'повторный личный диалог возвращает тот же',
    directAgain.body?.id === direct.body?.id,
    `id ${directAgain.body?.id === direct.body?.id ? 'совпадает' : 'РАЗНЫЙ'}`,
  );

  const directMessage = await apiCall(
    apiBase,
    parent.token,
    'POST',
    `/conversations/${direct.body?.id}/messages`,
    { body: 'Можно перенести занятие?' },
  );
  const trainerDirect = await apiCall(
    apiBase,
    trainer.token,
    'GET',
    `/conversations/${direct.body?.id}`,
  );
  check(
    20,
    'личная переписка доступна обоим участникам',
    directMessage.status === 201 && trainerDirect.status === 200,
    `отправка ${directMessage.status}, чтение ${trainerDirect.status}`,
  );

  const manyParticipants = await apiCall(apiBase, parent.token, 'POST', '/conversations', {
    participantIds: [trainer.id, stranger.id],
  });
  check(
    21,
    'личный диалог только с одним собеседником',
    manyParticipants.status === 400 &&
      manyParticipants.body?.code === 'CONVERSATION_PARTICIPANTS_INVALID',
    `${manyParticipants.status} ${manyParticipants.body?.code ?? ''}`,
  );

  // --- Состав меняется вместе с группой ------------------------------------

  await apiCall(
    apiBase,
    adminToken,
    'DELETE',
    `/groups/${group.body?.id}/members/${athlete.body?.id}`,
  );

  const afterLeave = await apiCall(apiBase, parent.token, 'GET', '/conversations');
  check(
    22,
    'ушедший из группы теряет чат группы',
    !(afterLeave.body ?? []).some((item) => item.id === conversationId),
    `диалогов у родителя ${(afterLeave.body ?? []).length}`,
  );

  const afterLeaveRead = await apiCall(
    apiBase,
    parent.token,
    'GET',
    `/conversations/${conversationId}`,
  );
  check(
    23,
    'и не может открыть его по идентификатору',
    afterLeaveRead.status === 404,
    `${afterLeaveRead.status} ${afterLeaveRead.body?.code ?? ''}`,
  );

  const trainerStill = await apiCall(
    apiBase,
    trainer.token,
    'GET',
    `/conversations/${conversationId}`,
  );
  check(
    24,
    'тренер сохраняет доступ к чату группы',
    trainerStill.status === 200,
    `статус ${trainerStill.status}`,
  );

  // --- Экраны админки ------------------------------------------------------

  const { status: chatsStatus, html: chatsHtml } = await fetchHtml(base, '/chats', adminCookie);
  check(
    25,
    'экран чатов отдается с формой открытия диалога',
    chatsStatus === 200 &&
      chatsHtml.includes('Диалоги') &&
      // Поле формы — точный признак того, что выбор собеседника доступен:
      // заголовки в разметке есть и без него.
      chatsHtml.includes('name="participantId"') &&
      chatsHtml.includes('name="groupId"'),
    `статус ${chatsStatus}`,
  );

  const parentSession = await loginCookies({
    base,
    email: parent.email,
    password: parent.password,
  });
  const { status: parentChatsStatus, html: parentChatsHtml } = await fetchHtml(
    base,
    '/chats',
    parentSession.cookie,
  );
  check(
    26,
    'у родителя нет выбора собеседника: список пользователей требует users.manage',
    parentChatsStatus === 200 && !parentChatsHtml.includes('name="participantId"'),
    `статус ${parentChatsStatus}, поле формы ${
      parentChatsHtml.includes('name="participantId"') ? 'ЕСТЬ' : 'нет'
    }`,
  );

  const { status: trainerChatsStatus, html: trainerChatsHtml } = await fetchHtml(
    base,
    '/chats',
    (await loginCookies({ base, email: trainer.email, password: trainer.password })).cookie,
  );
  check(
    27,
    'тренер видит чат группы на экране, но без выбора собеседника',
    trainerChatsStatus === 200 &&
      trainerChatsHtml.includes('Чат группы') &&
      !trainerChatsHtml.includes('name="participantId"'),
    `статус ${trainerChatsStatus}`,
  );

  // Родитель — MEMBER без единого permission. Доступ к чатам он получает по
  // участию, а не по праву: так устроена матрица прав («own conversations»).
  const parentChatsApi = await apiCall(apiBase, parent.token, 'GET', '/conversations');
  check(
    28,
    'родитель пользуется чатами: доступ дает участие, а не право chat.use (BR-012)',
    parentChatsStatus === 200 && Array.isArray(parentChatsApi.body),
    `экран ${parentChatsStatus}, API ${parentChatsApi.status}, диалогов ${
      Array.isArray(parentChatsApi.body) ? parentChatsApi.body.length : '—'
    }`,
  );

  if (failures.length > 0) {
    console.log(`\nПровалено утверждений: ${failures.length}`);
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log('\nВсе утверждения пройдены.');
  }
}

main().catch((error) => {
  console.log('ERR', error.message);
  process.exitCode = 1;
});
