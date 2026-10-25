# Экраны в FigCraft

Как я создаю макеты без Figma: экран описывается командами, FigCraft выполняет их
без окна и рендерит PNG. Макет воспроизводим: изменил число — перегенерировал, и
он снова совпадает с интерфейсом.

## Что есть

Десктоп (1440×960), 11 экранов в `screens.figcraft`:

| Экран | Файл |
|---|---|
| Дашборд | [export/Дашборд.png](export/Дашборд.png) |
| Спортсмены | [export/Спортсмены.png](export/Спортсмены.png) |
| Финансы | [export/Финансы.png](export/Финансы.png) |
| Карточка спортсмена | [export/Карточка спортсмена.png](export/Карточка%20спортсмена.png) |
| Диалог: спортсмен | [export/Диалог_ спортсмен.png](export/Диалог_%20спортсмен.png) |
| Диалог: оплата | [export/Диалог_ оплата.png](export/Диалог_%20оплата.png) |
| Диалог: заморозка | [export/Диалог_ заморозка.png](export/Диалог_%20заморозка.png) |
| Диалог: перенос | [export/Диалог_ перенос.png](export/Диалог_%20перенос.png) |
| Состояние: пусто | [export/Состояние_ пусто.png](export/Состояние_%20пусто.png) |
| Состояние: загрузка | [export/Состояние_ загрузка.png](export/Состояние_%20загрузка.png) |
| Состояние: ошибка | [export/Состояние_ ошибка.png](export/Состояние_%20ошибка.png) |

Мобильные (390×844), 3 экрана в `mobile.figcraft`:

| Экран | Файл |
|---|---|
| Обзор | [export/mobile/Mobile_ Обзор.png](export/mobile/Mobile_%20Обзор.png) |
| Расписание | [export/mobile/Mobile_ Расписание.png](export/mobile/Mobile_%20Расписание.png) |
| Посещаемость | [export/mobile/Mobile_ Посещаемость.png](export/mobile/Mobile_%20Посещаемость.png) |

## Как пересобрать

```bash
node docs/design/figcraft/build-screens.mjs
figcraft-cli run docs/design/figcraft/screens.json --out docs/design/figcraft/screens.figcraft
figcraft-cli export docs/design/figcraft/screens.figcraft -o docs/design/figcraft/export

node docs/design/figcraft/build-mobile.mjs
figcraft-cli run docs/design/figcraft/mobile.json --out docs/design/figcraft/mobile.figcraft
figcraft-cli export docs/design/figcraft/mobile.figcraft -o docs/design/figcraft/export/mobile
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

- `lib.mjs` — общие части десктопа: сайдбар, крошки, кнопка, карточка, бейдж,
  поиск, фильтр. Токены взяты из проекта (`#FF6B00`, `#0E0E10`, `#F7F7F9`).
- `build-screens.mjs` — данные 11 экранов.
- `build-mobile.mjs` — своя сетка для 390×844: тёмная шапка, таб-бар, карточки.
- `screens.json`, `mobile.json` — команды в читаемом виде.
- `*.figcraft` — нативные файлы, открываются в приложении.

Ссылки на созданные слои идут через `{"$step": n}`: сначала родитель, потом дети.

## Три правила, которые выяснились на практике

1. **Кнопка, бейдж и поле — это `frame`, а не `rectangle`.** Прямоугольник не может
   содержать слой: текст в него не вложить (`114 can't contain layers`).
2. **Текст в кнопке центрируется шириной.** Без `width` равной кнопке и
   `textAlign: center` подпись прижимается влево, и «Сохранить» выглядит смещённым.
3. **Порядок шагов важен.** `$step` ссылается на уже созданный слой; скрипт
   выполняется целиком или откатывается.
