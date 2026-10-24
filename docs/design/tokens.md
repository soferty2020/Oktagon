# OCTAGON Design Tokens

## Источник значений
**Важно:** в Figma есть приблизительные визуальные цвета, а в действующем коде уже есть утвержденные общие токены. До отдельного согласования использовать значения из `docs/12-ui-guidelines.md`, `apps/admin/src/app/globals.css` и `apps/mobile/lib/design/tokens.dart`, не переносить буквально приблизительные цвета из Figma.

| Token | Value | Usage |
|---|---|---|
| accent | `#FF6B00` | Primary actions, selected nav |
| accentSoft | `#FFF0E5` | Soft highlight |
| dark | `#0E0E10` | Sidebar |
| background | `#F7F7F9` | Admin canvas |
| white | `#FFFFFF` | Cards |
| border | `#EDEDF0` | Dividers |
| secondary text | `#8A8A8F` | Hints |
| danger | `#E23B3B` | Destructive/error |
| success | `#2E9E5B` | Positive status |

## Draft sizing guidance (verify against existing code)
- Desktop artboards: 1440px; tablet: 1024px; mobile: 390px.
- Sidebar desktop: ~248px; tablet: ~206px.
- Controls: 44px high.
- Card radius: 12px; controls: 8–14px.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32px.
- Figma text uses Inter; verify product font before implementation.
- Respect responsive text wrapping and keyboard focus.

Do not replace existing design tokens without a documented reason and visual comparison.
