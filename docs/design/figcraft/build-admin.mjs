/**
 * Макеты разделов, которых не хватало: новости, чаты, пользователи, настройки,
 * права, редактор новости, карточки группы и тренера, редактирование филиала.
 *
 * Девять экранов одним генератором: у них одна рамка (сайдбар, шапка,
 * заголовок), и держать их в трёх файлах по три значило бы повторять сетку.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();
const GAP = 1600;

let frame;

function screen(name, activeLabel, title, subtitle, actionLabel, offsetX) {
  const root = b.frame(null, offsetX, 0, 1440, 960, { fill: TOKENS.canvas }, name);
  b.sidebar(root, activeLabel);
  b.header(root, activeLabel);
  b.pageTitle(root, title, subtitle);

  if (actionLabel) {
    b.primaryButton(root, 1160, 88, 248, actionLabel);
  }

  return root;
}

/** Строка таблицы с разделителем: повторяется в четырёх экранах. */
function row(parent, y, x, width, cells, options = {}) {
  b.rect(parent, x, y + 40, width, 1, { fill: TOKENS.line }, 'Разделитель');

  cells.forEach(({ text, offset, muted, badge }) => {
    if (badge) {
      b.badge(parent, x + offset, y - 4, text, badge);
      return;
    }

    b.text(parent, x + offset, y, text, {
      fill: muted ? TOKENS.muted : TOKENS.ink,
      fontSize: 13,
      fontStyle: options.medium ? 'Medium' : 'Regular',
    }, 'Ячейка');
  });
}

// ---------------------------------------------------------------------------
// 1. Новости
// ---------------------------------------------------------------------------
frame = screen('Новости', 'Новости', 'Новости', 'Объявления для участников клуба', '+ Новая публикация', 0);

[
  { title: 'Расписание на ноябрь', status: 'Опубликовано · Для всего клуба', text: 'Изменения тренировок на праздничные дни', tone: 'success' },
  { title: 'Аттестация спортсменов', status: 'Черновик · Не опубликовано', text: 'Подготовка информации об экзамене', tone: 'warning' },
  { title: 'Результаты турнира', status: 'Опубликовано · Для всего клуба', text: 'Поздравляем наших спортсменов', tone: 'success' },
].forEach((post, index) => {
  const card = b.frame(frame, 272, 176 + index * 176, 1136, 156, { fill: TOKENS.white, cornerRadius: 12 }, `Новость: ${post.title}`);

  b.text(card, 20, 20, post.title, { fill: TOKENS.ink, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок');
  b.text(card, 20, 52, post.status, { fill: TOKENS.accent, fontSize: 12, fontStyle: 'Medium' }, 'Статус');
  b.text(card, 20, 80, post.text, { fill: TOKENS.muted, fontSize: 13 }, 'Текст');

  b.text(card, 1000, 20, 'Открыть →', { fill: TOKENS.accent, fontSize: 12 }, 'Ссылка');
});

// ---------------------------------------------------------------------------
// 2. Чаты
// ---------------------------------------------------------------------------
frame = screen('Чаты', 'Чаты', 'Чаты', 'Групповые чаты и личные переписки', undefined, GAP);

const chats = b.card(frame, 272, 176, 748, 600, 'Диалоги');
[
  { name: 'Чат группы «Дети 7–10»', preview: 'Иванов: завтра тренировка в 18:00', unread: '2' },
  { name: 'Анна Смирнова', preview: 'Спасибо, оплатили', unread: '' },
  { name: 'Чат группы «Подростки»', preview: 'Петров: перенос на 19:30', unread: '5' },
].forEach((chat, index) => {
  const y = 64 + index * 88;
  b.rect(chats, 20, y + 72, 708, 1, { fill: TOKENS.line }, 'Разделитель');

  b.text(chats, 20, y, chat.name, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Название');
  b.text(chats, 20, y + 22, chat.preview, { fill: TOKENS.muted, fontSize: 12 }, 'Последнее сообщение');
});

const thread = b.card(frame, 1044, 176, 364, 600, 'Выбранный диалог');
b.text(thread, 20, 64, 'Иванов И.И.', { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Автор');
b.text(thread, 20, 86, 'Напоминаю: завтра в 18:00', { fill: TOKENS.muted, fontSize: 12 }, 'Сообщение');
b.text(thread, 20, 140, 'Анна С.', { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Автор');
b.text(thread, 20, 162, 'Спасибо!', { fill: TOKENS.muted, fontSize: 12 }, 'Сообщение');

const composer = b.frame(thread, 20, 500, 324, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле сообщения');
b.text(composer, 14, 13, 'Написать сообщение…', { fill: TOKENS.muted, fontSize: 13 }, 'Подсказка');

// ---------------------------------------------------------------------------
// 3. Пользователи
// ---------------------------------------------------------------------------
frame = screen('Пользователи', 'Пользователи', 'Пользователи', 'Доступ сотрудников и участников', '+ Пригласить', GAP * 2);

const users = b.card(frame, 272, 176, 1136, 600, 'Пользователи');
['Имя', 'Почта', 'Роль', 'Статус'].forEach((label, index) => {
  b.text(users, 20 + index * 280, 64, label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${label}`);
});

[
  { name: 'Владелец Клуба', email: 'owner@club.ru', role: 'Руководитель', status: 'Активен', tone: 'success' },
  { name: 'Иванов Иван', email: 'ivanov@club.ru', role: 'Сотрудник', status: 'Активен', tone: 'success' },
  { name: 'Анна Смирнова', email: 'anna@example.com', role: 'Участник', status: 'Активен', tone: 'success' },
  { name: 'Кузнецов Иван', email: 'kuznetsov@club.ru', role: 'Сотрудник', status: 'Заблокирован', tone: 'danger' },
].forEach((user, index) => {
  row(users, 104 + index * 52, 20, 1096, [
    { text: user.name, offset: 0, muted: false },
    { text: user.email, offset: 280, muted: true },
    { text: user.role, offset: 560, muted: true },
    { text: user.status, offset: 840, badge: user.tone },
  ], { medium: true });
});

// ---------------------------------------------------------------------------
// 4. Настройки
// ---------------------------------------------------------------------------
frame = screen('Настройки', 'Настройки', 'Настройки', 'Параметры клуба и доступы', undefined, GAP * 3);

[
  { title: 'Профиль клуба', text: 'Название, логотип, контакты и часовой пояс' },
  { title: 'Сотрудники и права', text: 'Приглашения и выдача прав доступа' },
  { title: 'Финансы', text: 'Правила задолженности и допуски (BR-003, BR-004)' },
  { title: 'Журнал действий', text: 'Кто и что изменил — записи не редактируются' },
].forEach((item, index) => {
  const column = index % 2;
  const rowIndex = Math.floor(index / 2);
  const card = b.frame(frame, 272 + column * 576, 176 + rowIndex * 200, 544, 176, { fill: TOKENS.white, cornerRadius: 12 }, `Раздел: ${item.title}`);

  b.text(card, 20, 20, item.title, { fill: TOKENS.ink, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок');
  b.text(card, 20, 48, item.text, { fill: TOKENS.muted, fontSize: 13 }, 'Описание');
  b.text(card, 20, 136, 'Открыть →', { fill: TOKENS.accent, fontSize: 12 }, 'Ссылка');
});

// ---------------------------------------------------------------------------
// 5. Права сотрудника
// ---------------------------------------------------------------------------
frame = screen('Права', 'Пользователи', 'Права доступа', 'Иванов Иван · Сотрудник', undefined, GAP * 4);

const permissions = b.card(frame, 272, 176, 1136, 620, 'Права');
['Право', 'Раздел', 'Выдано'].forEach((label, index) => {
  b.text(permissions, 20 + index * 400, 64, label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${label}`);
});

[
  { code: 'Просмотр спортсменов', section: 'Спортсмены', granted: true },
  { code: 'Редактирование спортсменов', section: 'Спортсмены', granted: true },
  { code: 'Просмотр контактов', section: 'Спортсмены', granted: false },
  { code: 'Отметка посещаемости', section: 'Посещаемость', granted: true },
  { code: 'Просмотр оплат', section: 'Финансы', granted: false },
  { code: 'Управление группами', section: 'Группы', granted: true },
].forEach((permission, index) => {
  const y = 104 + index * 56;
  b.rect(permissions, 20, y + 40, 1096, 1, { fill: TOKENS.line }, 'Разделитель');

  b.text(permissions, 20, y, permission.code, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Право');
  b.text(permissions, 420, y, permission.section, { fill: TOKENS.muted, fontSize: 13 }, 'Раздел');

  const box = b.frame(permissions, 820, y - 4, 24, 24, {
    fill: permission.granted ? TOKENS.accent : TOKENS.canvas,
    cornerRadius: 6,
  }, 'Флажок');
  if (permission.granted) {
    b.text(box, 0, 3, '✓', { fill: TOKENS.white, fontSize: 13, textAlign: 'center', width: 24 }, 'Галочка');
  }
});

const save = b.frame(frame, 1104, 816, 304, 44, { fill: TOKENS.accent, cornerRadius: 10 }, 'Кнопка: Сохранить');
b.text(save, 0, 13, 'Сохранить изменения', { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: 304 }, 'Текст кнопки');

// ---------------------------------------------------------------------------
// 6. Редактор новости
// ---------------------------------------------------------------------------
frame = screen('Редактор новости', 'Новости', 'Новая публикация', 'Объявление для участников клуба', undefined, GAP * 5);

const editor = b.card(frame, 272, 176, 1136, 560, 'Содержание');

b.text(editor, 20, 64, 'Заголовок', { fill: TOKENS.muted, fontSize: 12 }, 'Поле: заголовок');
const titleField = b.frame(editor, 20, 86, 1096, 48, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле заголовка');
b.text(titleField, 14, 14, 'Расписание на ноябрь', { fill: TOKENS.ink, fontSize: 14 }, 'Значение');

b.text(editor, 20, 158, 'Текст', { fill: TOKENS.muted, fontSize: 12 }, 'Поле: текст');
const bodyField = b.frame(editor, 20, 180, 1096, 200, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле текста');
b.text(bodyField, 14, 14, 'Изменения тренировок на праздничные дни: 4 ноября занятий нет.', {
  fill: TOKENS.muted,
  fontSize: 13,
}, 'Текст');

b.text(editor, 20, 404, 'Аудитория', { fill: TOKENS.muted, fontSize: 12 }, 'Поле: аудитория');
const audience = b.frame(editor, 20, 426, 320, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле аудитории');
b.text(audience, 14, 13, 'Для всего клуба', { fill: TOKENS.ink, fontSize: 13 }, 'Значение');

const publish = b.frame(frame, 1160, 764, 248, 44, { fill: TOKENS.accent, cornerRadius: 10 }, 'Кнопка: Опубликовать');
b.text(publish, 0, 13, 'Опубликовать', { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: 248 }, 'Текст кнопки');

// ---------------------------------------------------------------------------
// 7. Карточка группы
// ---------------------------------------------------------------------------
frame = screen('Карточка группы', 'Группы', 'Дети 7–10, новички', 'Главный филиал · 14 участников', 'Редактировать', GAP * 6);

const groupInfo = b.card(frame, 272, 176, 560, 320, 'О группе');
[
  { label: 'Филиал', value: 'Главный филиал' },
  { label: 'Зал', value: 'Зал 1' },
  { label: 'Тренер', value: 'Иванов И.И.' },
  { label: 'Возраст', value: '7–10 лет' },
  { label: 'Расписание', value: 'Пн, Ср, Пт · 18:00' },
].forEach((item, index) => {
  const y = 64 + index * 44;
  b.text(groupInfo, 20, y, item.label, { fill: TOKENS.muted, fontSize: 13 }, item.label);
  b.text(groupInfo, 200, y, item.value, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, `${item.label}: значение`);
});

const groupMembers = b.card(frame, 856, 176, 496, 520, 'Состав');
[
  'Иванов Максим',
  'Сидорова Анна',
  'Кузнецов Иван',
  'Смирнова Мария',
  'Волков Артём',
].forEach((name, index) => {
  const y = 64 + index * 48;
  b.rect(groupMembers, 20, y + 34, 456, 1, { fill: TOKENS.line }, 'Разделитель');
  b.text(groupMembers, 20, y, name, { fill: TOKENS.ink, fontSize: 13 }, 'Спортсмен');
});

// ---------------------------------------------------------------------------
// 8. Карточка тренера
// ---------------------------------------------------------------------------
frame = screen('Карточка тренера', 'Тренеры', 'Иванов Иван Иванович', 'Сотрудник · 2 группы', 'Редактировать', GAP * 7);

const trainerInfo = b.card(frame, 272, 176, 560, 260, 'Контакты');
[
  { label: 'Телефон', value: '+7 (913) 111-22-33' },
  { label: 'Почта', value: 'ivanov@club.ru' },
  { label: 'Статус', value: 'Активен' },
].forEach((item, index) => {
  const y = 64 + index * 44;
  b.text(trainerInfo, 20, y, item.label, { fill: TOKENS.muted, fontSize: 13 }, item.label);
  b.text(trainerInfo, 200, y, item.value, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, `${item.label}: значение`);
});

const trainerGroups = b.card(frame, 856, 176, 496, 260, 'Группы');
['Дети 7–10, новички', 'Подростки, группа С'].forEach((name, index) => {
  const y = 64 + index * 44;
  b.rect(trainerGroups, 20, y + 30, 456, 1, { fill: TOKENS.line }, 'Разделитель');
  b.text(trainerGroups, 20, y, name, { fill: TOKENS.ink, fontSize: 13 }, 'Группа');
});

// ---------------------------------------------------------------------------
// 9. Редактирование филиала
// ---------------------------------------------------------------------------
frame = screen('Редактирование филиала', 'Филиалы и залы', 'Главный филиал', 'Адрес и залы', undefined, GAP * 8);

const branchForm = b.card(frame, 272, 176, 1136, 520, 'Данные филиала');
[
  { label: 'Название', value: 'Главный филиал' },
  { label: 'Адрес', value: 'ул. Ленина, 10' },
  { label: 'Телефон', value: '+7 (913) 000-00-00' },
].forEach((field, index) => {
  const y = 64 + index * 92;
  b.text(branchForm, 20, y, field.label, { fill: TOKENS.muted, fontSize: 12 }, `Поле: ${field.label}`);
  const box = b.frame(branchForm, 20, y + 22, 1096, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле');
  b.text(box, 14, 13, field.value, { fill: TOKENS.ink, fontSize: 14 }, 'Значение');
});

b.text(branchForm, 20, 356, 'Залы', { fill: TOKENS.muted, fontSize: 12 }, 'Подпись: залы');
['Зал 1', 'Зал 2'].forEach((hall, index) => {
  const rowY = 384 + index * 52;
  const box = b.frame(branchForm, 20, rowY, 560, 40, { fill: TOKENS.canvas, cornerRadius: 10 }, `Зал: ${hall}`);
  b.text(box, 14, 11, hall, { fill: TOKENS.ink, fontSize: 13 }, 'Название зала');
});

const branchSave = b.frame(frame, 1104, 728, 304, 44, { fill: TOKENS.accent, cornerRadius: 10 }, 'Кнопка: Сохранить');
b.text(branchSave, 0, 13, 'Сохранить', { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: 304 }, 'Текст кнопки');

const count = writeScenario(new URL('./admin.json', import.meta.url), b.steps);
console.log(`  экранов: 9, шагов: ${count}`);
