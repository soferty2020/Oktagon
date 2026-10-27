/**
 * Два варианта редизайна карточки спортсмена по итогам Hallmark Audit.
 *
 * Общие ограничения для обоих:
 * - бренд не меняется: тёмный сайдбар, оранжевый #FF6B00, светлый фон #F7F7F9;
 * - данные не дублируются: ФИО, ступень, пояс, группа, тренер и филиал живут
 *   только в шапке; в теле — контакты, служебное и история;
 * - подписи — обычным регистром (в Hallmark это Floor-правило 67: капс с
 *   трекингом на мелком тексте читается как машинный шаблон);
 * - средние точки в мета-строках не используются (правило 63).
 *
 * Вариант A — «Витрина»: тёмная шапка, ступень крупным числом.
 * Вариант B — «Досье»: светлый редакционный лист, ступень вертикальной шкалой.
 */
import { writeScenario } from './lib.mjs';

const INK = '#0E0E10';
const INK_SOFT = '#22222A';
const ACCENT = '#FF6B00';
const ACCENT_SOFT = '#FFF0E5';
const CANVAS = '#F7F7F9';
const LINE = '#EDEDF0';
const MUTED = '#6B6B72';
const WHITE = '#FFFFFF';

const steps = [];
const ref = (step) => ({ $step: step });

function add(command, params) {
  steps.push({ command, params });
  return steps.length - 1;
}

const rect = (parent, x, y, width, height, props = {}, name) =>
  add('node.create', {
    type: 'rectangle',
    parent: ref(parent),
    x,
    y,
    width,
    height,
    name: name ?? 'Прямоугольник',
    props,
  });

const frame = (parent, x, y, width, height, props = {}, name) =>
  add('node.create', {
    type: 'frame',
    parent: parent === null ? undefined : ref(parent),
    x,
    y,
    width,
    height,
    name: name ?? 'Фрейм',
    props,
  });

const text = (parent, x, y, value, props = {}, name) => {
  const { width, ...rest } = props;

  return add('node.create', {
    type: 'text',
    parent: ref(parent),
    x,
    y,
    ...(width ? { width } : {}),
    text: value,
    name: name ?? value,
    props: { fontFamily: 'Inter', ...rest },
  });
};

const NAV = ['Обзор', 'Спортсмены', 'Заявки', 'Группы', 'Тренеры', 'Расписание', 'Посещаемость', 'Аттестации', 'Соревнования', 'Финансы', 'Отчёты', 'Настройки'];

function sidebar(root, height) {
  const bar = frame(root, 0, 0, 248, height, { fill: INK }, 'Сайдбар');

  text(bar, 24, 26, 'OCTAGON', { fill: WHITE, fontSize: 18, fontStyle: 'Bold', letterSpacing: 3 }, 'Логотип');
  text(bar, 24, 50, 'KARATE CLUB', { fill: '#5A5A64', fontSize: 8, letterSpacing: 2 }, 'Подпись логотипа');

  NAV.forEach((label, index) => {
    const top = 92 + index * 40;

    if (label === 'Спортсмены') {
      rect(bar, 8, top, 232, 36, { fill: INK_SOFT, cornerRadius: 8 }, 'Активный пункт');
      rect(bar, 0, top, 3, 36, { fill: ACCENT }, 'Полоса');
    }

    text(bar, 24, top + 9, label, {
      fill: label === 'Спортсмены' ? WHITE : '#9A9AA2',
      fontSize: 13,
      fontStyle: label === 'Спортсмены' ? 'Medium' : 'Regular',
    }, `Пункт: ${label}`);
  });
}

function topBar(root, x, width) {
  const bar = frame(root, x, 0, width, 64, { fill: WHITE }, 'Шапка');

  rect(bar, 0, 63, width, 1, { fill: LINE }, 'Разделитель шапки');

  text(bar, 24, 24, 'Спортсмены', { fill: MUTED, fontSize: 13 }, 'Крошка: раздел');
  text(bar, 116, 24, '/', { fill: '#C8C8CE', fontSize: 13 }, 'Крошка: слэш');
  text(bar, 132, 24, 'Сагабиев Дмитрий', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'Крошка: имя');

  rect(bar, width - 188, 16, 164, 32, { fill: CANVAS, cornerRadius: 16 }, 'Профиль пользователя');
  text(bar, width - 172, 24, 'Владелец Клуба', { fill: INK, fontSize: 12, fontStyle: 'Medium' }, 'Имя пользователя');
}

/* ------------------------------------------------------------------ */
/* Вариант A — «Витрина»                                              */
/* ------------------------------------------------------------------ */

function variantA(root) {
  const hero = frame(root, 280, 96, 1128, 200, { fill: INK, cornerRadius: 18 }, 'A · Профиль');

  rect(hero, 32, 32, 80, 80, { fill: INK_SOFT, cornerRadius: 40 }, 'Аватар');
  text(hero, 32, 55, 'ДС', { fill: ACCENT, fontSize: 26, fontStyle: 'Bold', textAlign: 'center', width: 80 }, 'Инициалы');

  text(hero, 136, 30, 'Сагабиев Дмитрий Олегович', { fill: WHITE, fontSize: 28, fontStyle: 'Bold' }, 'ФИО');
  text(hero, 136, 70, 'Активен · с мая 2025', { fill: '#9A9AA2', fontSize: 13 }, 'Статус и дата');
  text(hero, 136, 96, 'Группа «Дети 10–12 лет», Центральный зал', { fill: '#9A9AA2', fontSize: 13 }, 'Группа и зал');

  // Ступень — крупнейшее число экрана: это то, за чем приходят в карточку.
  text(hero, 1128 - 430, 26, 'Спортивная ступень', { fill: '#8A8A92', fontSize: 12 }, 'Подпись ступени');
  text(hero, 1128 - 430, 46, '10', { fill: ACCENT, fontSize: 64, fontStyle: 'Bold' }, 'Ступень');
  text(hero, 1128 - 356, 78, 'кю', { fill: '#B8B8C0', fontSize: 20, fontStyle: 'Medium' }, 'Кю');

  text(hero, 1128 - 250, 26, 'Пояс', { fill: '#8A8A92', fontSize: 12 }, 'Подпись пояса');
  rect(hero, 1128 - 250, 50, 132, 30, { fill: ACCENT_SOFT, cornerRadius: 15 }, 'Плашка пояса');
  rect(hero, 1128 - 250, 50, 4, 30, { fill: ACCENT, cornerRadius: 2 }, 'Полоска пояса');
  text(hero, 1128 - 234, 56, 'Оранжевый', { fill: '#B24A00', fontSize: 13, fontStyle: 'Medium' }, 'Пояс');

  // Прогресс: 11 сегментов, пройдено 10.
  for (let i = 0; i < 11; i += 1) {
    rect(hero, 1128 - 430 + i * 20, 122, 16, 4, { fill: i < 10 ? ACCENT : '#3A3A44', cornerRadius: 2 }, `Сегмент ${i}`);
  }
  text(hero, 1128 - 430, 134, '10 из 11 ступеней пройдено', { fill: '#8A8A92', fontSize: 11 }, 'Прогресс');

  rect(hero, 1128 - 210, 150, 178, 38, { fill: ACCENT, cornerRadius: 10 }, 'Аттестация');
  text(hero, 1128 - 210, 161, '+ Аттестация', { fill: WHITE, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: 178 }, 'Текст аттестации');

  rect(hero, 1128 - 400, 150, 178, 38, { fill: 'transparent', cornerRadius: 10, stroke: '#4A4A54', strokeWeight: 1 }, 'Изменить');
  text(hero, 1128 - 400, 161, 'Изменить', { fill: WHITE, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: 178 }, 'Текст изменить');

  // Вкладки-сегменты под шапкой.
  const tabs = frame(root, 280, 320, 620, 44, { fill: '#EFEFF3', cornerRadius: 12 }, 'A · Вкладки');
  ['Профиль', 'Аттестации', 'Оплаты', 'История'].forEach((label, index) => {
    const w = Math.floor((620 - 8) / 4);
    if (index === 0) {
      rect(tabs, 4, 4, w - 4, 36, { fill: WHITE, cornerRadius: 9 }, 'Активная');
    }
    text(tabs, 4 + index * w, 15, label, {
      fill: index === 0 ? INK : '#6E6E78',
      fontSize: 13,
      fontStyle: index === 0 ? 'Medium' : 'Regular',
      textAlign: 'center',
      width: w - 4,
    }, `A · вкладка ${label}`);
  });

  // Тело: только контакты и история. Ступень, пояс, группа, тренер, филиал — в шапке.
  const contacts = frame(root, 280, 388, 772, 236, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'A · Контакты');

  text(contacts, 28, 22, 'Контакты', { fill: INK, fontSize: 16, fontStyle: 'Bold' }, 'A · заголовок контактов');
  text(contacts, 28, 46, 'Как связаться с родителем', { fill: MUTED, fontSize: 12 }, 'A · подпись контактов');

  const pairsA = [
    ['Дата рождения', '24.08.2020'],
    ['Телефон', '+7 967 213-16-16'],
    ['Почта', 'parent@example.com'],
    ['В клубе с', '25.05.2025'],
  ];

  pairsA.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 28 + col * 380;
    const y = 86 + row * 62;

    text(contacts, x, y, label, { fill: MUTED, fontSize: 12 }, `A · подпись ${label}`);
    text(contacts, x, y + 20, value, { fill: INK, fontSize: 15, fontStyle: 'Medium' }, `A · значение ${label}`);
  });

  const history = frame(root, 280, 648, 772, 240, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'A · История');

  text(history, 28, 22, 'История ступеней', { fill: INK, fontSize: 16, fontStyle: 'Bold' }, 'A · заголовок истории');
  text(history, 28, 46, 'От белого пояса до текущей ступени', { fill: MUTED, fontSize: 12 }, 'A · подпись истории');

  const events = [
    ['10 кю', 'оранжевый пояс', '16.12.2025', true],
    ['0 кю', 'белый пояс', '25.05.2025', false],
  ];

  events.forEach(([rank, belt, date, current], index) => {
    const top = 92 + index * 62;

    if (index < events.length - 1) {
      rect(history, 33, top + 14, 1, 44, { fill: LINE }, 'A · линия');
    }

    rect(history, 28, top, 11, 11, { fill: current ? ACCENT : LINE, cornerRadius: 6 }, 'A · точка');
    text(history, 56, top - 4, rank, { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'A · ступень');
    text(history, 140, top - 2, belt, { fill: MUTED, fontSize: 13 }, 'A · пояс');
    text(history, 300, top - 2, date, { fill: MUTED, fontSize: 13 }, 'A · дата');

    if (current) {
      rect(history, 420, top - 4, 58, 20, { fill: ACCENT_SOFT, cornerRadius: 10 }, 'A · метка');
      text(history, 428, top, 'сейчас', { fill: '#B24A00', fontSize: 11, fontStyle: 'Medium' }, 'A · текст метки');
    }
  });

  // Правый рельс: аккаунты и действия.
  const accounts = frame(root, 1076, 388, 332, 150, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'A · Аккаунты');
  text(accounts, 24, 20, 'Связанные аккаунты', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'A · заголовок аккаунтов');
  rect(accounts, 20, 60, 292, 62, { fill: '#FAFAFB', cornerRadius: 10 }, 'A · аккаунт');
  rect(accounts, 20, 60, 3, 62, { fill: ACCENT, cornerRadius: 2 }, 'A · полоска');
  text(accounts, 38, 70, 'o.sagabiev@gmail.com', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'A · почта');
  text(accounts, 38, 92, 'родитель, основной', { fill: MUTED, fontSize: 12 }, 'A · роль');

  const actions = frame(root, 1076, 562, 332, 150, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'A · Действия');
  text(actions, 24, 20, 'Действия', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'A · заголовок действий');
  ['Изменить профиль', 'Добавить аттестацию', 'Назначить на соревнование'].forEach((label, index) => {
    const top = 56 + index * 28;
    rect(actions, 24, top + 4, 6, 6, { fill: ACCENT, cornerRadius: 3 }, 'A · маркер');
    text(actions, 40, top - 1, label, { fill: '#2A2A32', fontSize: 13 }, `A · действие ${label}`);
  });

  const danger = frame(root, 1076, 736, 332, 104, { fill: '#FDF3F3', cornerRadius: 14, stroke: '#F6DADA', strokeWeight: 1 }, 'A · Архив');
  text(danger, 20, 16, 'Архивирование', { fill: '#8A2B2B', fontSize: 13, fontStyle: 'Bold' }, 'A · заголовок архива');
  text(danger, 20, 38, 'Карточка уйдёт из справочников.', { fill: '#A05A5A', fontSize: 11, width: 292 }, 'A · текст архива');
  text(danger, 20, 54, 'История сохранится.', { fill: '#A05A5A', fontSize: 11, width: 292 }, 'A · текст архива 2');
  rect(danger, 20, 74, 120, 24, { fill: 'transparent', cornerRadius: 8, stroke: '#E3B4B4', strokeWeight: 1 }, 'A · кнопка архива');
  text(danger, 20, 79, 'В архив', { fill: '#8A2B2B', fontSize: 11, textAlign: 'center', width: 120 }, 'A · текст кнопки архива');
}

/* ------------------------------------------------------------------ */
/* Вариант B — «Досье»                                                */
/* ------------------------------------------------------------------ */

function variantB(root) {
  // Светлая шапка: имя как заголовок документа, ступень — вертикальная шкала справа.
  const head = frame(root, 280, 96, 1128, 168, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'B · Заголовок');

  text(head, 32, 28, 'Сагабиев Дмитрий Олегович', { fill: INK, fontSize: 34, fontStyle: 'Bold' }, 'B · ФИО');
  text(head, 32, 76, 'Активен · группа «Дети 10–12 лет» · Центральный зал', { fill: MUTED, fontSize: 14 }, 'B · статус');

  rect(head, 32, 112, 196, 34, { fill: ACCENT_SOFT, cornerRadius: 17 }, 'B · плашка ступени');
  text(head, 48, 120, '10 кю, оранжевый пояс', { fill: '#B24A00', fontSize: 13, fontStyle: 'Medium' }, 'B · ступень и пояс');

  rect(head, 244, 112, 148, 34, { fill: CANVAS, cornerRadius: 17, stroke: LINE, strokeWeight: 1 }, 'B · плашка тренера');
  text(head, 258, 120, 'Тренер: Иванов А.', { fill: '#3A3A42', fontSize: 12 }, 'B · тренер');

  // Вертикальная шкала: 11 сегментов снизу вверх, пройдено 10.
  text(head, 1128 - 196, 24, 'Путь', { fill: MUTED, fontSize: 12 }, 'B · подпись шкалы');
  for (let i = 0; i < 11; i += 1) {
    const filled = i < 10;
    rect(head, 1128 - 196 + i * 15, 48, 10, 74, { fill: filled ? ACCENT : '#E8E8EC', cornerRadius: 3 }, `B · шкала ${i}`);
  }
  text(head, 1128 - 196, 132, '10 из 11', { fill: MUTED, fontSize: 11 }, 'B · прогресс');

  // Вкладки — текстовые с подчёркиванием: без плашек, ближе к документу.
  ['Профиль', 'Аттестации', 'Оплаты', 'История'].forEach((label, index) => {
    const x = 280 + index * 108;
    text(root, x, 292, label, {
      fill: index === 0 ? INK : MUTED,
      fontSize: 13,
      fontStyle: index === 0 ? 'Medium' : 'Regular',
    }, `B · вкладка ${label}`);

    if (index === 0) {
      rect(root, x, 314, 52, 2, { fill: ACCENT }, 'B · подчёркивание');
    }
  });
  rect(root, 280, 316, 1128, 1, { fill: LINE }, 'B · линия вкладок');

  // Данные — таблица без карточек: две колонки, тонкие линии.
  text(root, 280, 348, 'Контакты', { fill: INK, fontSize: 17, fontStyle: 'Bold' }, 'B · заголовок контактов');

  const rowsB = [
    ['Дата рождения', '24.08.2020'],
    ['Телефон', '+7 967 213-16-16'],
    ['Почта', 'parent@example.com'],
  ];

  rowsB.forEach(([label, value], index) => {
    const y = 388 + index * 56;
    text(root, 280, y, label, { fill: MUTED, fontSize: 13 }, `B · подпись ${label}`);
    text(root, 560, y, value, { fill: INK, fontSize: 15, fontStyle: 'Medium' }, `B · значение ${label}`);
    rect(root, 280, y + 34, 600, 1, { fill: LINE }, 'B · линия строки');
  });

  text(root, 940, 348, 'Клуб', { fill: INK, fontSize: 17, fontStyle: 'Bold' }, 'B · заголовок клуба');

  const clubB = [
    ['Филиал', 'Центральный зал'],
    ['Группа', 'Дети 10–12 лет'],
    ['В клубе с', '25.05.2025'],
  ];

  clubB.forEach(([label, value], index) => {
    const y = 388 + index * 56;
    text(root, 940, y, label, { fill: MUTED, fontSize: 13 }, `B · подпись ${label}`);
    text(root, 940, y + 20, value, { fill: INK, fontSize: 15, fontStyle: 'Medium' }, `B · значение ${label}`);
    rect(root, 940, y + 48, 468, 1, { fill: LINE }, 'B · линия строки');
  });

  // История — горизонтальная лента: ступени идут слева направо.
  text(root, 280, 604, 'История ступеней', { fill: INK, fontSize: 17, fontStyle: 'Bold' }, 'B · заголовок истории');

  rect(root, 280, 680, 1128, 1, { fill: LINE }, 'B · линия истории');

  const stepsB = [
    ['0 кю', 'белый', '25.05.2025', 280],
    ['10 кю', 'оранжевый', '16.12.2025', 660],
  ];

  stepsB.forEach(([rank, belt, date, x]) => {
    rect(root, x, 674, 13, 13, { fill: x > 400 ? ACCENT : LINE, cornerRadius: 7 }, 'B · точка');
    text(root, x, 700, rank, { fill: INK, fontSize: 16, fontStyle: 'Bold' }, 'B · ступень');
    text(root, x, 724, `${belt} пояс`, { fill: MUTED, fontSize: 13 }, 'B · пояс');
    text(root, x, 744, date, { fill: MUTED, fontSize: 12 }, 'B · дата');
  });

  // Нижний ряд: аккаунты и действия в три колонки.
  rect(root, 280, 812, 360, 1, { fill: LINE }, 'B · разделитель низа');

  text(root, 280, 828, 'Связанные аккаунты', { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'B · заголовок аккаунтов');
  text(root, 280, 852, 'o.sagabiev@gmail.com, родитель', { fill: MUTED, fontSize: 13 }, 'B · аккаунт');

  text(root, 760, 828, 'Действия', { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'B · заголовок действий');
  text(root, 760, 852, 'Изменить профиль · Добавить аттестацию', { fill: ACCENT, fontSize: 13, fontStyle: 'Medium' }, 'B · действия');

  text(root, 1160, 828, 'Архив', { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'B · заголовок архива');
  text(root, 1160, 852, 'В архив', { fill: '#8A2B2B', fontSize: 13 }, 'B · ссылка архива');
}

/* ------------------------------------------------------------------ */
/* Мобильные версии                                                   */
/* ------------------------------------------------------------------ */

function mobileA(root) {
  const hero = frame(root, 0, 0, 390, 248, { fill: INK }, 'A · шапка');

  text(hero, 20, 20, '← Спортсмены', { fill: '#9A9AA2', fontSize: 12 }, 'A · назад');
  text(hero, 358, 20, '⋯', { fill: '#9A9AA2', fontSize: 16 }, 'A · меню');

  rect(hero, 20, 52, 56, 56, { fill: INK_SOFT, cornerRadius: 28 }, 'A · аватар');
  text(hero, 20, 67, 'ДС', { fill: ACCENT, fontSize: 18, fontStyle: 'Bold', textAlign: 'center', width: 56 }, 'A · инициалы');

  text(hero, 88, 54, 'Сагабиев', { fill: WHITE, fontSize: 19, fontStyle: 'Bold' }, 'A · фамилия');
  text(hero, 88, 76, 'Дмитрий Олегович', { fill: '#C8C8D0', fontSize: 13 }, 'A · имя');
  text(hero, 88, 98, 'Активен, с мая 2025', { fill: '#9A9AA2', fontSize: 11 }, 'A · статус');

  text(hero, 20, 128, '10', { fill: ACCENT, fontSize: 38, fontStyle: 'Bold' }, 'A · ступень');
  text(hero, 60, 144, 'кю', { fill: '#B8B8C0', fontSize: 14 }, 'A · кю');

  rect(hero, 96, 132, 104, 26, { fill: ACCENT_SOFT, cornerRadius: 13 }, 'A · пояс');
  text(hero, 110, 138, 'Оранжевый', { fill: '#B24A00', fontSize: 12, fontStyle: 'Medium' }, 'A · текст пояса');

  for (let i = 0; i < 11; i += 1) {
    rect(hero, 20 + i * 27, 190, 22, 4, { fill: i < 10 ? ACCENT : '#3A3A44', cornerRadius: 2 }, `A · сегмент ${i}`);
  }
  text(hero, 20, 200, 'Группа «Дети 10–12», Центральный зал', { fill: '#9A9AA2', fontSize: 11 }, 'A · группа');

  text(hero, 20, 222, '+ Аттестация', { fill: ACCENT, fontSize: 13, fontStyle: 'Medium' }, 'A · аттестация');

  const tabs = frame(root, 16, 268, 358, 42, { fill: '#EFEFF3', cornerRadius: 11 }, 'A · вкладки');
  ['Профиль', 'Аттестации', 'История'].forEach((label, index) => {
    const w = Math.floor((358 - 8) / 3);
    if (index === 0) {
      rect(tabs, 4, 4, w - 4, 34, { fill: WHITE, cornerRadius: 8 }, 'A · активная');
    }
    text(tabs, 4 + index * w, 14, label, {
      fill: index === 0 ? INK : '#6E6E78',
      fontSize: 12,
      textAlign: 'center',
      width: w - 4,
    }, `A · вкладка ${label}`);
  });

  const contacts = frame(root, 16, 330, 358, 232, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'A · контакты');
  text(contacts, 20, 18, 'Контакты', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'A · заголовок');
  [['Дата рождения', '24.08.2020'], ['Телефон', '+7 967 213-16-16'], ['Почта', 'parent@example.com']].forEach(([label, value], index) => {
    text(contacts, 20, 56 + index * 56, label, { fill: MUTED, fontSize: 12 }, `A · подпись ${label}`);
    text(contacts, 20, 76 + index * 56, value, { fill: INK, fontSize: 14, fontStyle: 'Medium' }, `A · значение ${label}`);
  });

  const history = frame(root, 16, 580, 358, 196, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'A · история');
  text(history, 20, 18, 'История ступеней', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'A · заголовок истории');
  [['10 кю', '16.12.2025', true], ['0 кю', '25.05.2025', false]].forEach(([rank, date, current], index) => {
    const top = 62 + index * 56;
    if (index === 0) {
      rect(history, 24, top + 14, 1, 40, { fill: LINE }, 'A · линия');
    }
    rect(history, 20, top, 10, 10, { fill: current ? ACCENT : LINE, cornerRadius: 5 }, 'A · точка');
    text(history, 44, top - 3, rank, { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'A · ступень');
    text(history, 44, top + 15, date, { fill: MUTED, fontSize: 12 }, 'A · дата');
  });

  rect(root, 16, 796, 172, 44, { fill: 'transparent', cornerRadius: 12, stroke: '#D8D8DE', strokeWeight: 1 }, 'A · изменить');
  text(root, 16, 810, 'Изменить', { fill: INK, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: 172 }, 'A · текст изменить');
}

function mobileB(root) {
  const head = frame(root, 0, 0, 390, 210, { fill: WHITE }, 'B · заголовок');

  text(head, 20, 18, '← Спортсмены', { fill: MUTED, fontSize: 12 }, 'B · назад');
  text(head, 20, 44, 'Сагабиев', { fill: INK, fontSize: 26, fontStyle: 'Bold' }, 'B · фамилия');
  text(head, 20, 76, 'Дмитрий Олегович', { fill: INK, fontSize: 16 }, 'B · имя');
  text(head, 20, 104, 'Активен, группа «Дети 10–12»', { fill: MUTED, fontSize: 12 }, 'B · статус');

  rect(head, 20, 132, 120, 30, { fill: ACCENT_SOFT, cornerRadius: 15 }, 'B · ступень');
  text(head, 34, 139, '10 кю, оранжевый', { fill: '#B24A00', fontSize: 12, fontStyle: 'Medium' }, 'B · текст ступени');

  for (let i = 0; i < 11; i += 1) {
    rect(head, 20 + i * 30, 178, 24, 4, { fill: i < 10 ? ACCENT : '#E8E8EC', cornerRadius: 2 }, `B · шкала ${i}`);
  }

  text(root, 20, 228, 'Профиль', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'B · вкладка профиль');
  rect(root, 20, 248, 46, 2, { fill: ACCENT }, 'B · подчёркивание');
  rect(root, 20, 250, 350, 1, { fill: LINE }, 'B · линия');

  text(root, 20, 272, 'Контакты', { fill: INK, fontSize: 16, fontStyle: 'Bold' }, 'B · контакты');

  [['Дата рождения', '24.08.2020'], ['Телефон', '+7 967 213-16-16'], ['Почта', 'parent@example.com']].forEach(([label, value], index) => {
    text(root, 20, 306 + index * 52, label, { fill: MUTED, fontSize: 12 }, `B · подпись ${label}`);
    text(root, 20, 324 + index * 52, value, { fill: INK, fontSize: 14, fontStyle: 'Medium' }, `B · значение ${label}`);
    rect(root, 20, 348 + index * 52, 350, 1, { fill: LINE }, 'B · линия');
  });

  text(root, 20, 478, 'Клуб', { fill: INK, fontSize: 16, fontStyle: 'Bold' }, 'B · клуб');
  text(root, 20, 508, 'Филиал', { fill: MUTED, fontSize: 12 }, 'B · филиал');
  text(root, 20, 526, 'Центральный зал', { fill: INK, fontSize: 14, fontStyle: 'Medium' }, 'B · филиал значение');
  text(root, 200, 508, 'В клубе с', { fill: MUTED, fontSize: 12 }, 'B · дата');
  text(root, 200, 526, '25.05.2025', { fill: INK, fontSize: 14, fontStyle: 'Medium' }, 'B · дата значение');

  text(root, 20, 578, 'История ступеней', { fill: INK, fontSize: 16, fontStyle: 'Bold' }, 'B · история');
  rect(root, 20, 632, 350, 1, { fill: LINE }, 'B · линия истории');

  [['0 кю', '25.05.2025', 20], ['10 кю', '16.12.2025', 200]].forEach(([rank, date, x]) => {
    rect(root, x, 626, 11, 11, { fill: x > 100 ? ACCENT : LINE, cornerRadius: 6 }, 'B · точка');
    text(root, x, 648, rank, { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'B · ступень');
    text(root, x, 670, date, { fill: MUTED, fontSize: 12 }, 'B · дата');
  });
}

/* ------------------------------------------------------------------ */
/* Фреймы                                                             */
/* ------------------------------------------------------------------ */

{
  const root = frame(null, 0, 0, 1440, 940, { fill: CANVAS }, 'Вариант A — Витрина (1440)');
  sidebar(root, 940);
  topBar(root, 248, 1192);
  variantA(root);
}

{
  const root = frame(null, 1500, 0, 1440, 940, { fill: CANVAS }, 'Вариант B — Досье (1440)');
  sidebar(root, 940);
  topBar(root, 248, 1192);
  variantB(root);
}

{
  const root = frame(null, 0, 1000, 390, 880, { fill: CANVAS }, 'Вариант A — Витрина (390)');
  mobileA(root);
}

{
  const root = frame(null, 1500, 1000, 390, 880, { fill: WHITE }, 'Вариант B — Досье (390)');
  mobileB(root);
}

const count = writeScenario('docs/design/figcraft/athlete-variants.json', steps);
console.log(`  шагов: ${count}`);
