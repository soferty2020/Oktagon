# Экраны в FigCraft

Как я создаю макеты без Figma: экран описывается командами, FigCraft выполняет их
без окна и рендерит PNG. Макет воспроизводим: изменил число — перегенерировал, и
он снова совпадает с интерфейсом.

## Что есть — 38 экранов

| Группа | Файл | Что внутри |
|---|---|---|
| Ключевые (11) | `screens.figcraft` | дашборд, спортсмены, финансы, карточка спортсмена, четыре диалога, три состояния |
| Разделы (5) | `sections.figcraft` | группы, тренеры, филиалы, расписание, посещаемость |
| Админка (10) | `admin.figcraft` | новости, чаты, пользователи, настройки, права, редактор новости, карточка группы, карточка тренера, редактирование филиала, периоды месяца |
| Формы (4) | `forms.figcraft` | новый спортсмен, добавление в группу, успех сохранения, подтверждение отмены |
| Мобильные (6) | `mobile.figcraft`, `mobile-more.figcraft` | обзор, расписание, посещаемость, спортсмены, финансы, настройки |
| Планшет и UI-kit (2) | `extra.figcraft` | дашборд 1024×768 и страница токенов |

Рендеры: [export/](export/) и [export/mobile/](export/mobile/).

## Как пересобрать

```bash
node docs/design/figcraft/build-screens.mjs
figcraft-cli run docs/design/figcraft/screens.json --out docs/design/figcraft/screens.figcraft
figcraft-cli export docs/design/figcraft/screens.figcraft -o docs/design/figcraft/export

node docs/design/figcraft/build-sections.mjs
figcraft-cli run docs/design/figcraft/sections.json --out docs/design/figcraft/sections.figcraft
figcraft-cli export docs/design/figcraft/sections.figcraft -o docs/design/figcraft/export

node docs/design/figcraft/build-admin.mjs
figcraft-cli run docs/design/figcraft/admin.json --out docs/design/figcraft/admin.figcraft
figcraft-cli export docs/design/figcraft/admin.figcraft -o docs/design/figcraft/export

node docs/design/figcraft/build-forms.mjs
figcraft-cli run docs/design/figcraft/forms.json --out docs/design/figcraft/forms.figcraft
figcraft-cli export docs/design/figcraft/forms.figcraft -o docs/design/figcraft/export

node docs/design/figcraft/build-mobile.mjs
figcraft-cli run docs/design/figcraft/mobile.json --out docs/design/figcraft/mobile.figcraft
figcraft-cli export docs/design/figcraft/mobile.figcraft -o docs/design/figcraft/export/mobile

node docs/design/figcraft/build-mobile-more.mjs
figcraft-cli run docs/design/figcraft/mobile-more.json --out docs/design/figcraft/mobile-more.figcraft
figcraft-cli export docs/design/figcraft/mobile-more.figcraft -o docs/design/figcraft/export/mobile

node docs/design/figcraft/build-extra.mjs
figcraft-cli run docs/design/figcraft/extra.json --out docs/design/figcraft/extra.figcraft
figcraft-cli export docs/design/figcraft/extra.figcraft -o docs/design/figcraft/export
```

`figcraft-cli` лежит в релизе
[`storytold/figcraft`](https://github.com/storytold/figcraft) v0.10.0: в Windows-архиве
`figcraft-0.10.0-windows-x64-portable.zip` рядом с приложением. На этой машине —
`C:\Users\<user>\FigCraft\figcraft-cli.exe`.

## Сравнение с продом

```bash
node scripts/design-compare.mjs
```

Скрипт кладёт рендер и скриншот админки парами в `docs/design/compare/` и собирает
`index.html`: два изображения рядом при одной ширине. Прод-скриншоты снимаются
`scripts/shoot-admin.mjs` в `docs/design/compare/prod/` при окне 1440×960 — иначе
сравнивать бессмысленно.

## Как устроено

- `lib.mjs` — общие части: сайдбар, крошки, кнопка, карточка, бейдж, поиск,
  фильтр, заголовок. Токены взяты из проекта (`#FF6B00`, `#0E0E10`, `#F7F7F9`).
- Генераторы: `build-screens`, `build-sections`, `build-admin`, `build-forms`,
  `build-mobile`, `build-mobile-more`, `build-extra`.
- `*.json` — команды в читаемом виде; `*.figcraft` — нативные файлы, открываются
  в приложении.

Ссылки на созданные слои идут через `{"$step": n}`: сначала родитель, потом дети.

## Четыре правила, которые выяснились на практике

1. **Кнопка, бейдж и поле — это `frame`, а не `rectangle`.** Прямоугольник не может
   содержать слой: текст в него не вложить (`114 can't contain layers`).
2. **Текст в кнопке центрируется шириной.** Без `width`, равной кнопке, и
   `textAlign: center` подпись прижимается влево. Ширина в `node.create` — параметр,
   а не свойство `node.set`, поэтому `text()` в `lib.mjs` вынимает её из props.
3. **Порядок шагов важен.** `$step` ссылается на уже созданный слой; скрипт
   выполняется целиком или откатывается.
4. **Смещение задаётся фрейму, а не детям.** Дети позиционируются относительно
   родителя: сдвиг всех узлов разъехался бы по сетке.
