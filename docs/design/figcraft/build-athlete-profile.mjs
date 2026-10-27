/**
 * Карточка спортсмена — макет для утверждения (#60).
 *
 * Дизайн-решение: профиль — это не форма, а витрина человека и его пути.
 * Поэтому верх — тёмная панель с личностью, ступенью и поясом; ниже — данные,
 * которые не дублируют шапку, и история роста таймлайном.
 *
 * Стиль: редакционный (Swiss) — крупная типографика, тонкие линии, много
 * воздуха, один акцент. Тени в FigCraft недоступны, поэтому глубина строится
 * цветом: тёмная панель, светлые карточки, оранжевые акценты только на
 * ключевых числах и действиях.
 */
import { createBuilder, TOKENS, writeScenario } from './lib.mjs';

const W_DESKTOP = 1440;
const H_DESKTOP = 940;
const W_TABLET = 1024;
const W_MOBILE = 390;
const H_MOBILE = 900;

const b = createBuilder();
const { frame, rect, text } = b;

const INK = TOKENS.ink;
const INK_SOFT = '#22222A';
const ACCENT = TOKENS.accent;
const ACCENT_SOFT = TOKENS.accentSoft;
const CANVAS = TOKENS.canvas;
const LINE = TOKENS.line;
const MUTED = TOKENS.muted;
const WHITE = TOKENS.white;

const NAV = [
  'Обзор',
  'Спортсмены',
  'Заявки',
  'Группы',
  'Тренеры',
  'Расписание',
  'Посещаемость',
  'Аттестации',
  'Соревнования',
  'Финансы',
  'Отчёты',
  'Настройки',
];

/** Сегмент ступени: заполненный — пройден, пустой — впереди. */
function rankProgress(parent, x, y, total, current) {
  const gap = 4;
  const width = 16;

  for (let index = 0; index < total; index += 1) {
    const passed = index < current;
    rect(
      parent,
      x + index * (width + gap),
      y,
      width,
      4,
      { fill: passed ? ACCENT : '#3A3A44', cornerRadius: 2 },
      `Ступень ${index + 1}`,
    );
  }
}

/** Тёмная шапка профиля: кто это, где в пути, что можно сделать. */
function profileHero(parent, { x, y, width, empty }) {
  const hero = frame(parent, x, y, width, 188, { fill: INK, cornerRadius: 16 }, 'Профиль: шапка');

  // Аватар: инициалы вместо фотографии — фото в клубе есть не у всех.
  rect(hero, 28, 28, 72, 72, { fill: INK_SOFT, cornerRadius: 36 }, 'Аватар');
  text(hero, 28, 48, empty ? '—' : 'ДС', {
    fill: ACCENT,
    fontSize: 24,
    fontStyle: 'Bold',
    textAlign: 'center',
    width: 72,
  }, 'Инициалы');

  text(hero, 120, 28, empty ? 'Новый спортсмен' : 'Сагабиев Дмитрий Олегович', {
    fill: WHITE,
    fontSize: 26,
    fontStyle: 'Bold',
  }, 'ФИО');

  // Статус — рядом с именем, а не отдельной строкой: это свойство человека.
  rect(hero, 120, 66, 92, 24, { fill: empty ? '#2A2A32' : '#1F3A2B', cornerRadius: 12 }, 'Статус');
  rect(hero, 130, 75, 6, 6, { fill: empty ? MUTED : '#4ADE80', cornerRadius: 3 }, 'Точка статуса');
  text(hero, 142, 70, empty ? 'Не активен' : 'Активен', {
    fill: empty ? '#9A9AA2' : '#7DE2A6',
    fontSize: 12,
    fontStyle: 'Medium',
  }, 'Текст статуса');

  text(hero, 120, 100, empty ? 'Карточка создана, данные не заполнены' : 'Группа «Дети 10–12 лет» · Центральный зал', {
    fill: '#9A9AA2',
    fontSize: 13,
  }, 'Контекст');

  // Ступень — главное число профиля: крупно, с поясом рядом.
  const statX = width - 420;

  text(hero, statX, 24, 'СТУПЕНЬ', {
    fill: '#7A7A84',
    fontSize: 10,
    fontStyle: 'Medium',
    letterSpacing: 1.4,
  }, 'Подпись ступени');

  if (empty) {
    // Не «0 кю»: ступень не определена — это не нулевая ступень, а её отсутствие.
    text(hero, statX, 56, 'не присвоена', {
      fill: '#6A6A74',
      fontSize: 15,
      fontStyle: 'Medium',
    }, 'Ступень не присвоена');
  } else {
    text(hero, statX, 42, '10', { fill: ACCENT, fontSize: 52, fontStyle: 'Bold' }, 'Номер ступени');
    text(hero, statX + 58, 66, 'кю', { fill: '#9A9AA2', fontSize: 18, fontStyle: 'Medium' }, 'Кю');
  }

  // Пояс: в пустом состоянии текст шире («не присвоена»), поэтому колонка пояса
  // сдвигается вправо — иначе подписи наезжают друг на друга.
  const beltX = statX + (empty ? 196 : 104);

  text(hero, beltX, 24, 'ПОЯС', {
    fill: '#7A7A84',
    fontSize: 10,
    fontStyle: 'Medium',
    letterSpacing: 1.4,
  }, 'Подпись пояса');

  if (!empty) {
    rect(hero, beltX, 48, 128, 28, { fill: ACCENT_SOFT, cornerRadius: 14 }, 'Плашка пояса');
    rect(hero, beltX, 48, 4, 28, { fill: ACCENT, cornerRadius: 2 }, 'Полоска пояса');
    text(hero, beltX + 14, 53, 'Оранжевый', { fill: '#B24A00', fontSize: 13, fontStyle: 'Medium' }, 'Пояс');
  } else {
    text(hero, beltX, 52, 'Не присвоен', { fill: '#6A6A74', fontSize: 13 }, 'Пояс пустой');
  }

  // Прогресс пути: 11 сегментов кю — видно, сколько пройдено.
  if (!empty) {
    rankProgress(hero, statX, 96, 11, 10);
    text(hero, statX, 108, '10 из 11 ступеней', { fill: '#7A7A84', fontSize: 11 }, 'Прогресс');
  }

  // Действия: правка и аттестация — единственные кнопки в шапке.
  if (!empty) {
    rect(hero, width - 196, 140, 168, 36, { fill: 'transparent', cornerRadius: 10, stroke: '#4A4A54', strokeWeight: 1 }, 'Изменить');
    text(hero, width - 196, 150, 'Изменить', {
      fill: WHITE,
      fontSize: 13,
      fontStyle: 'Medium',
      textAlign: 'center',
      width: 168,
    }, 'Изменить: текст');

    rect(hero, width - 380, 140, 172, 36, { fill: ACCENT, cornerRadius: 10 }, '+ Аттестация');
    text(hero, width - 380, 150, '+ Аттестация', {
      fill: WHITE,
      fontSize: 13,
      fontStyle: 'Medium',
      textAlign: 'center',
      width: 172,
    }, 'Аттестация: текст');
  } else {
    rect(hero, width - 236, 140, 208, 36, { fill: ACCENT, cornerRadius: 10 }, 'Заполнить профиль');
    text(hero, width - 236, 150, 'Заполнить профиль', {
      fill: WHITE,
      fontSize: 13,
      fontStyle: 'Medium',
      textAlign: 'center',
      width: 208,
    }, 'Заполнить: текст');
  }

  return hero;
}

/** Вкладки: сегменты на светлом фоне, активный — белый с тенью-границей. */
function tabs(parent, x, y, width, items, active) {
  const bar = frame(parent, x, y, width, 44, { fill: '#EFEFF3', cornerRadius: 12 }, 'Вкладки');
  const itemWidth = Math.floor((width - 8) / items.length);

  items.forEach((label, index) => {
    const isActive = label === active;

    if (isActive) {
      rect(bar, 4 + index * itemWidth, 4, itemWidth - 4, 36, { fill: WHITE, cornerRadius: 9 }, 'Активная вкладка');
    }

    text(bar, 4 + index * itemWidth, 15, label, {
      fill: isActive ? INK : '#6E6E78',
      fontSize: 13,
      fontStyle: isActive ? 'Medium' : 'Regular',
      textAlign: 'center',
      width: itemWidth - 4,
    }, `Вкладка: ${label}`);
  });

  return bar;
}

/** Карточка с заголовком и верхней линией-акцентом. */
function panel(parent, x, y, width, height, title, hint) {
  const box = frame(parent, x, y, width, height, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, `Блок: ${title}`);

  text(box, 24, 20, title, { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок блока');

  if (hint) {
    text(box, 24, 42, hint, { fill: MUTED, fontSize: 12 }, 'Подпись блока');
  }

  return box;
}

/** Поле «подпись — значение»: подпись мелкая и серая, значение крупное. */
function field(parent, x, y, label, value, width) {
  text(parent, x, y, label, { fill: MUTED, fontSize: 11, fontStyle: 'Medium', letterSpacing: 0.6 }, `Подпись: ${label}`);
  text(parent, x, y + 18, value, { fill: INK, fontSize: 14, fontStyle: 'Medium', width }, `Значение: ${label}`);
}

/** Таймлайн истории роста. */
function timeline(parent, x, y, items) {
  items.forEach((item, index) => {
    const top = y + index * 52;
    const isFirst = index === 0;

    if (index < items.length - 1) {
      rect(parent, x + 5, top + 14, 1, 38, { fill: LINE }, 'Линия таймлайна');
    }

    rect(parent, x, top, 11, 11, { fill: isFirst ? ACCENT : LINE, cornerRadius: 6 }, 'Точка таймлайна');

    text(parent, x + 24, top - 3, item.rank, { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'Ступень таймлайна');
    text(parent, x + 24, top + 15, `${item.date} · ${item.belt}`, { fill: MUTED, fontSize: 12 }, 'Дата и пояс таймлайна');

    if (isFirst) {
      rect(parent, x + 104, top - 1, 46, 18, { fill: ACCENT_SOFT, cornerRadius: 9 }, 'Текущая');
      text(parent, x + 104, top + 2, 'сейчас', { fill: '#B24A00', fontSize: 10, fontStyle: 'Medium' }, 'Текст текущей');
    }
  });
}

/** Основной контент: слева данные и история, справа аккаунты и действия. */
function contentColumns(root, x, y, width, { empty = false, partial = false } = {}) {
  const leftWidth = width - 340;
  const rightX = x + width - 316;

  const main = panel(root, x, y, leftWidth, 312, 'Основные данные', 'Что известно о спортсмене');
  const col = Math.floor((leftWidth - 72) / 2);

  field(main, 24, 76, 'ДАТА РОЖДЕНИЯ', empty ? 'Не указана' : '24.08.2020', col);
  field(main, 24 + col + 24, 76, 'ТЕЛЕФОН', empty || partial ? 'Не указан' : '+7 967 213-16-16', col);
  field(main, 24, 132, 'ПОЧТА', empty || partial ? 'Не указана' : 'parent@example.com', col);
  field(main, 24 + col + 24, 132, 'ТРЕНЕР', empty ? 'Не назначен' : 'Иванов А. С.', col);
  field(main, 24, 188, 'ФИЛИАЛ', empty ? 'Не назначен' : 'Центральный зал', col);
  field(main, 24 + col + 24, 188, 'ДАТА В КЛУБЕ', empty ? 'Не указана' : 'с 25 мая 2025', col);

  rect(main, 24, 236, leftWidth - 48, 1, { fill: LINE }, 'Разделитель');
  text(main, 24, 252, 'Заметки клуба', { fill: MUTED, fontSize: 11, fontStyle: 'Medium' }, 'Подпись заметок');
  text(main, 24, 270, empty ? 'Заметок нет' : 'Переведён из младшей группы, готовится к аттестации на 8 кю.', {
    fill: empty ? MUTED : INK,
    fontSize: 13,
    width: leftWidth - 48,
  }, 'Заметки');

  const history = panel(root, x, y + 336, leftWidth, 196, 'История спортивного роста', 'Ступени и даты присвоения');

  if (empty) {
    text(history, 24, 88, 'Аттестаций пока нет', { fill: MUTED, fontSize: 13 }, 'Пустая история');
    text(history, 24, 108, 'После первой аттестации здесь появится путь: ступень, дата, пояс.', {
      fill: '#A8A8B0',
      fontSize: 12,
      width: leftWidth - 48,
    }, 'Подсказка истории');
  } else {
    timeline(history, 28, 84, [
      { rank: '10 кю', belt: 'оранжевый пояс', date: '16.12.2025' },
      { rank: '0 кю', belt: 'белый пояс', date: '25.05.2025' },
    ]);
  }

  // Правая колонка: связи и действия, компактно.
  const accounts = panel(root, rightX, y, 316, 150, 'Связанные аккаунты', 'Кто видит спортсмена в приложении');

  if (empty || partial) {
    text(accounts, 24, 84, 'Аккаунтов нет', { fill: MUTED, fontSize: 13 }, 'Пустые аккаунты');
    text(accounts, 24, 104, 'Родитель получит доступ по коду приглашения.', {
      fill: '#A8A8B0',
      fontSize: 12,
      width: 268,
    }, 'Подсказка аккаунтов');
  } else {
    rect(accounts, 20, 76, 276, 56, { fill: '#FAFAFB', cornerRadius: 10 }, 'Аккаунт');
    rect(accounts, 20, 76, 3, 56, { fill: ACCENT, cornerRadius: 2 }, 'Полоска аккаунта');
    text(accounts, 36, 86, 'o.sagabiev@gmail.com', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'Почта аккаунта');
    text(accounts, 36, 106, 'родитель · основной', { fill: MUTED, fontSize: 11 }, 'Роль аккаунта');
  }

  const actions = panel(root, rightX, y + 174, 316, 150, 'Быстрые действия', 'Без перехода в другие разделы');

  ['Изменить профиль', 'Добавить аттестацию', 'Назначить на соревнование'].forEach((label, index) => {
    const top = 76 + index * 26;
    rect(actions, 20, top + 3, 6, 6, { fill: ACCENT, cornerRadius: 3 }, 'Маркер действия');
    text(actions, 34, top - 2, label, { fill: '#2A2A32', fontSize: 13 }, `Действие: ${label}`);
  });

  const danger = frame(root, rightX, y + 348, 316, 122, { fill: '#FDF3F3', cornerRadius: 14, stroke: '#F6DADA', strokeWeight: 1 }, 'Опасное действие');
  text(danger, 20, 18, 'Архивирование', { fill: '#8A2B2B', fontSize: 13, fontStyle: 'Bold' }, 'Заголовок опасного');
  text(danger, 20, 40, 'Карточка уйдёт из справочников.', {
    fill: '#A05A5A',
    fontSize: 11,
    width: 276,
  }, 'Текст опасного');
  text(danger, 20, 56, 'История сохранится.', { fill: '#A05A5A', fontSize: 11, width: 276 }, 'Текст опасного 2');
  rect(danger, 20, 84, 132, 26, { fill: 'transparent', cornerRadius: 8, stroke: '#E3B4B4', strokeWeight: 1 }, 'Кнопка архива');
  text(danger, 20, 90, 'В архив', { fill: '#8A2B2B', fontSize: 11, fontStyle: 'Medium', textAlign: 'center', width: 132 }, 'Текст архива');
}

/** Сайдбар админки. */
function sidebar(root, height, activeLabel, compact = false) {
  const width = compact ? 0 : 248;

  if (compact) {
    return;
  }

  const bar = frame(root, 0, 0, width, height, { fill: INK }, 'Сайдбар');

  text(bar, 24, 26, 'OCTAGON', { fill: WHITE, fontSize: 18, fontStyle: 'Bold', letterSpacing: 3 }, 'Логотип');
  text(bar, 24, 50, 'KARATE CLUB', { fill: '#5A5A64', fontSize: 8, letterSpacing: 2 }, 'Подпись логотипа');

  NAV.forEach((label, index) => {
    const top = 92 + index * 40;
    const isActive = label === activeLabel;

    if (isActive) {
      rect(bar, 8, top, 232, 36, { fill: INK_SOFT, cornerRadius: 8 }, 'Активный пункт');
      rect(bar, 0, top, 3, 36, { fill: ACCENT }, 'Полоса');
    }

    text(bar, 24, top + 9, label, {
      fill: isActive ? WHITE : '#9A9AA2',
      fontSize: 13,
      fontStyle: isActive ? 'Medium' : 'Regular',
    }, `Пункт: ${label}`);
  });
}

/** Шапка с крошками и профилем пользователя. */
function topBar(root, x, width, padLeft = 24) {
  const bar = frame(root, x, 0, width, 64, { fill: WHITE }, 'Шапка');
  rect(bar, 0, 63, width, 1, { fill: LINE }, 'Разделитель шапки');

  text(bar, padLeft, 24, 'Спортсмены', { fill: MUTED, fontSize: 13 }, 'Крошка: раздел');
  text(bar, padLeft + 92, 24, '/', { fill: '#C8C8CE', fontSize: 13 }, 'Крошка: слэш');
  text(bar, padLeft + 108, 24, 'Карточка спортсмена', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'Крошка: карточка');

  rect(bar, width - 188, 16, 164, 32, { fill: CANVAS, cornerRadius: 16 }, 'Профиль пользователя');
  text(bar, width - 172, 24, 'Владелец Клуба', { fill: INK, fontSize: 12, fontStyle: 'Medium' }, 'Имя пользователя');
}

// --- Desktop 1440: полное состояние ---------------------------------------
{
  const root = frame(null, 0, 0, W_DESKTOP, H_DESKTOP, { fill: CANVAS }, 'Desktop 1440 — карточка спортсмена');

  sidebar(root, H_DESKTOP, 'Спортсмены');
  topBar(root, 248, W_DESKTOP - 248);

  const contentX = 280;
  const contentWidth = W_DESKTOP - contentX - 32;

  profileHero(root, { x: contentX, y: 96, width: contentWidth, empty: false });
  tabs(root, contentX, 308, 620, ['Профиль', 'Аттестации', 'Оплаты', 'Посещаемость', 'История'], 'Профиль');
  contentColumns(root, contentX, 376, contentWidth, { empty: false });
}

// --- Desktop 1440: пустое состояние ---------------------------------------
{
  const root = frame(null, 1440, 0, W_DESKTOP, H_DESKTOP, { fill: CANVAS }, 'Desktop 1440 — пустая карточка');

  sidebar(root, H_DESKTOP, 'Спортсмены');
  topBar(root, 248, W_DESKTOP - 248);

  const contentX = 280;
  const contentWidth = W_DESKTOP - contentX - 32;

  profileHero(root, { x: contentX, y: 96, width: contentWidth, empty: true });
  tabs(root, contentX, 308, 620, ['Профиль', 'Аттестации', 'Оплаты', 'Посещаемость', 'История'], 'Профиль');

  // Пустое состояние: объясняем, чего не хватает, и даём следующий шаг.
  const empty = frame(root, contentX, 376, contentWidth, 216, { fill: WHITE, cornerRadius: 14, stroke: LINE, strokeWeight: 1 }, 'Пустое состояние');
  rect(empty, contentWidth / 2 - 24, 40, 48, 48, { fill: ACCENT_SOFT, cornerRadius: 24 }, 'Иконка пустого');
  text(empty, contentWidth / 2 - 12, 54, '+', { fill: ACCENT, fontSize: 24, fontStyle: 'Bold', textAlign: 'center', width: 24 }, 'Плюс');
  text(empty, 24, 104, 'Профиль ещё не заполнен', {
    fill: INK,
    fontSize: 17,
    fontStyle: 'Bold',
    textAlign: 'center',
    width: contentWidth - 48,
  }, 'Заголовок пустого');
  text(empty, 24, 132, 'Добавьте дату рождения и телефон — и запишите в группу. Ступень появится после первой аттестации.', {
    fill: MUTED,
    fontSize: 13,
    textAlign: 'center',
    width: contentWidth - 48,
  }, 'Описание пустого');
  rect(empty, contentWidth / 2 - 86, 168, 172, 36, { fill: ACCENT, cornerRadius: 10 }, 'Кнопка пустого');
  text(empty, contentWidth / 2 - 86, 178, 'Заполнить профиль', {
    fill: WHITE,
    fontSize: 13,
    fontStyle: 'Medium',
    textAlign: 'center',
    width: 172,
  }, 'Текст кнопки пустого');
}

// --- Desktop 1440: частично заполненная карточка ---------------------------
{
  const root = frame(null, 4320, 0, W_DESKTOP, H_DESKTOP, { fill: CANVAS }, 'Desktop 1440 — частично заполненная карточка');

  sidebar(root, H_DESKTOP, 'Спортсмены');
  topBar(root, 248, W_DESKTOP - 248);

  const contentX = 280;
  const contentWidth = W_DESKTOP - contentX - 32;

  // Человек уже в клубе и сдал аттестацию, но контактов нет и родитель не привязан.
  profileHero(root, { x: contentX, y: 96, width: contentWidth, empty: false });
  tabs(root, contentX, 308, 620, ['Профиль', 'Аттестации', 'Оплаты', 'Посещаемость', 'История'], 'Профиль');
  contentColumns(root, contentX, 376, contentWidth, { partial: true });
}

// --- Tablet 1024: те же блоки в одну колонку -------------------------------
{
  const height = 880;
  const root = frame(null, 2880, 0, W_TABLET, height, { fill: CANVAS }, 'Tablet 1024 — карточка спортсмена');

  topBar(root, 0, W_TABLET, 64);

  const contentX = 32;
  const contentWidth = W_TABLET - 64;

  // Сайдбар на планшете свёрнут в иконку меню в шапке — место дороже.
  rect(root, 16, 16, 32, 32, { fill: INK, cornerRadius: 8 }, 'Меню');
  text(root, 16, 24, '≡', { fill: WHITE, fontSize: 16, textAlign: 'center', width: 32 }, 'Иконка меню');

  profileHero(root, { x: contentX, y: 88, width: contentWidth, empty: false });
  tabs(root, contentX, 300, contentWidth, ['Профиль', 'Аттестации', 'Оплаты', 'История'], 'Профиль');

  const mainWidth = contentWidth;

  const main = panel(root, contentX, 368, mainWidth, 252, 'Основные данные', 'Что известно о спортсмене');
  const col = Math.floor((mainWidth - 72) / 2);
  field(main, 24, 76, 'ДАТА РОЖДЕНИЯ', '24.08.2020', col);
  field(main, 24 + col + 24, 76, 'ТЕЛЕФОН', '+7 967 213-16-16', col);
  field(main, 24, 132, 'ПОЧТА', 'parent@example.com', col);
  field(main, 24 + col + 24, 132, 'ТРЕНЕР', 'Иванов А. С.', col);
  field(main, 24, 188, 'ФИЛИАЛ', 'Центральный зал', col);
  field(main, 24 + col + 24, 188, 'ДАТА В КЛУБЕ', 'с 25 мая 2025', col);

  const history = panel(root, contentX, 644, mainWidth, 178, 'История спортивного роста', 'Ступени и даты присвоения');
  timeline(history, 28, 84, [
    { rank: '10 кю', belt: 'оранжевый пояс', date: '16.12.2025' },
    { rank: '0 кю', belt: 'белый пояс', date: '25.05.2025' },
  ]);
}

// --- Mobile 390: компактная шапка, факты в две колонки --------------------
{
  const root = frame(null, 3904, 0, W_MOBILE, H_MOBILE, { fill: CANVAS }, 'Mobile 390 — карточка спортсмена');

  const hero = frame(root, 0, 0, W_MOBILE, 232, { fill: INK }, 'Профиль: шапка');

  text(hero, 20, 20, '← Спортсмены', { fill: '#9A9AA2', fontSize: 12 }, 'Назад');
  text(hero, W_MOBILE - 52, 20, '⋯', { fill: '#9A9AA2', fontSize: 16 }, 'Меню');

  rect(hero, 20, 52, 56, 56, { fill: INK_SOFT, cornerRadius: 28 }, 'Аватар');
  text(hero, 20, 67, 'ДС', { fill: ACCENT, fontSize: 18, fontStyle: 'Bold', textAlign: 'center', width: 56 }, 'Инициалы');

  text(hero, 88, 54, 'Сагабиев', { fill: WHITE, fontSize: 19, fontStyle: 'Bold' }, 'Фамилия');
  text(hero, 88, 76, 'Дмитрий Олегович', { fill: '#C8C8D0', fontSize: 13 }, 'Имя');

  rect(hero, 88, 96, 84, 20, { fill: '#1F3A2B', cornerRadius: 10 }, 'Статус');
  rect(hero, 96, 103, 5, 5, { fill: '#4ADE80', cornerRadius: 3 }, 'Точка');
  text(hero, 106, 99, 'Активен', { fill: '#7DE2A6', fontSize: 11, fontStyle: 'Medium' }, 'Текст статуса');

  // Ступень и пояс — двумя блоками, чтобы читались на ходу.
  text(hero, 20, 128, '10', { fill: ACCENT, fontSize: 34, fontStyle: 'Bold' }, 'Ступень');
  text(hero, 58, 140, 'кю', { fill: '#9A9AA2', fontSize: 13 }, 'Кю');
  rect(hero, 20, 170, 92, 22, { fill: ACCENT_SOFT, cornerRadius: 11 }, 'Пояс');
  text(hero, 32, 174, 'Оранжевый', { fill: '#B24A00', fontSize: 11, fontStyle: 'Medium' }, 'Текст пояса');

  rankProgress(hero, 132, 178, 11, 10);
  text(hero, 132, 192, '10 из 11', { fill: '#7A7A84', fontSize: 10 }, 'Прогресс');

  // Группа и зал — строкой, без дублирования в основной части.
  text(hero, 20, 206, 'Группа «Дети 10–12» · Центральный зал', { fill: '#9A9AA2', fontSize: 11 }, 'Группа и зал');

  tabs(root, 16, 248, W_MOBILE - 32, ['Профиль', 'Аттестации', 'Оплаты'], 'Профиль');

  const main = panel(root, 16, 304, W_MOBILE - 32, 268, 'Основные данные', null);
  const col = Math.floor((W_MOBILE - 32 - 64) / 2);
  field(main, 20, 64, 'ДАТА РОЖДЕНИЯ', '24.08.2020', col);
  field(main, 20 + col + 20, 64, 'ТЕЛЕФОН', '+7 967 213-16-16', col);
  field(main, 20, 120, 'ПОЧТА', 'parent@example.com', col + 20);
  field(main, 20, 176, 'ТРЕНЕР', 'Иванов А. С.', col);
  field(main, 20 + col + 20, 176, 'ФИЛИАЛ', 'Центральный зал', col);

  const history = panel(root, 16, 588, W_MOBILE - 32, 208, 'История роста', null);
  timeline(history, 24, 64, [
    { rank: '10 кю', belt: 'оранжевый пояс', date: '16.12.2025' },
    { rank: '0 кю', belt: 'белый пояс', date: '25.05.2025' },
  ]);

  // Действия — внизу, большими кнопками: на телефоне до них достаёт большой палец.
  rect(root, 16, 812, (W_MOBILE - 44) / 2, 44, { fill: 'transparent', cornerRadius: 12, stroke: '#D8D8DE', strokeWeight: 1 }, 'Изменить');
  text(root, 16, 826, 'Изменить', { fill: INK, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: (W_MOBILE - 44) / 2 }, 'Текст изменить');

  rect(root, 16 + (W_MOBILE - 44) / 2 + 12, 812, (W_MOBILE - 44) / 2, 44, { fill: ACCENT, cornerRadius: 12 }, 'Аттестация');
  text(root, 16 + (W_MOBILE - 44) / 2 + 12, 826, '+ Аттестация', {
    fill: WHITE,
    fontSize: 13,
    fontStyle: 'Medium',
    textAlign: 'center',
    width: (W_MOBILE - 44) / 2,
  }, 'Текст аттестации');
}

const count = writeScenario('docs/design/figcraft/athlete-profile.json', b.steps);
console.log(`  шагов: ${count}`);
