# Иконка приложения OCTAGON

- Issue: #29
- Обновлено: 2026-11-03

## Источники

| Файл | Что это |
|---|---|
| `octagon-app-icon.svg` | полная иконка: знак + вордмарк (для документов, не для приложения) |
| `octagon-app-icon-symbol.svg` | упрощённый знак, исходник для иконки (от заказчика) |
| `octagon-app-icon-square.svg` | знак без рамки и скругления — маску применяет платформа |
| `octagon-app-icon-foreground.svg` | знак в safe zone (66%) на прозрачном фоне, для adaptive icon |
| `store-icon-512.png` | 512×512 для RuStore и Google Play |

PNG для генератора: `apps/mobile/assets/brand/app-icon-1024.png` и
`app-icon-foreground-1024.png`.

## Как перегенерировать

1. Отрендерить SVG в PNG 1024×1024 (Chrome headless):

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$svg = (Resolve-Path docs\design\brand\octagon-app-icon-square.svg).Path -replace '\\','/'
$out = (Resolve-Path apps\mobile\assets\brand).Path + "\app-icon-1024.png"
& $chrome --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 `
  --window-size=1024,1024 "--screenshot=$out" "file:///$svg"
```

То же для `octagon-app-icon-foreground.svg` → `app-icon-foreground-1024.png`.

2. Сгенерировать все размеры:

```powershell
cd apps/mobile
dart pub get
dart run flutter_launcher_icons
```

Конфигурация — в `pubspec.yaml`, раздел `flutter_launcher_icons`.

## Что получается

- Android: `mipmap-mdpi…xxxhdpi/ic_launcher.png` (48–192 px);
- Android 8+: `mipmap-anydpi-v26/ic_launcher.xml` + `drawable-*/ic_launcher_foreground.png`,
  фон — `values/colors.xml` (`#060607`);
- iOS: `Assets.xcassets/AppIcon.appiconset` полный набор, без альфа-канала
  (`remove_alpha_ios: true` — App Store не принимает прозрачность).

## Правила, которые уже учтены

- рамку и скругление не рисуем — их применяет система (иначе двойная рамка);
- в adaptive foreground знак занимает ~66% — не обрежется круглой или квадратной маской;
- для iOS альфа-канал удаляется, фон становится чёрным.
