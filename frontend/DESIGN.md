# Cafe POS — Design System

Premium minimalist POS. Monochrome brand, semantic-only color, square corners, serif + sans.

## Color (light)

Tinted neutrals — never pure black/white. HSL CSS vars in `src/index.css`, mapped in
`tailwind.config.cjs`.

| Role | Token | Use |
|------|-------|-----|
| Paper | `background` `hsl(48 20% 99%)` | app surface |
| Ink | `foreground` `hsl(60 6% 11%)` | text, primary buttons |
| Card | `card` `#fff` + `border` | surfaces sit on hairline borders, not shadows |
| Muted | `muted` / `muted-foreground` | secondary text, fills |
| **Success** | `success` (green) | paid, available, positive |
| **Warning** | `warning` (amber) | pending, reserved, caution |
| **Danger** | `danger` / `destructive` (red) | occupied-alert, delete, errors |

Accents are **functional only** (status). Brand stays black-and-white. Don't use color decoratively.

## Typography

- **Serif — Playfair Display**: page titles, section headings (`h1–h3` default to serif), KPI
  numerals, hero numbers. `font-serif`.
- **Sans — Montserrat**: body, UI, labels, buttons. Default (`font-sans`).
- **Numbers**: Montserrat + `.nums` (tabular figures) for prices/quantities so columns align.
- Hierarchy via scale + weight (≥1.25 step). Weights loaded: Montserrat 400/500/600/700,
  Playfair 500/600/700.

## Shape & elevation

- **Square corners everywhere** — `borderRadius` scale forced to `0` in Tailwind (incl.
  `rounded-full`). Never reintroduce radius.
- **Hairline borders over shadows.** Cards/inputs use `border-border`. Shadow only for
  overlays (dialogs).
- Generous, varied whitespace. Avoid identical repeating card grids — prefer lists/tables for
  data.

## Icons

`@phosphor-icons/react`, default `weight="regular"` via `IconContext` in `src/main.tsx`.
Do not use lucide (being migrated out) or emoji.

## Components (`src/components/ui/*`)

- **Button**: square, no shadow; `default` = ink, `destructive` = danger, `outline` = hairline,
  focus ring 2px offset. Sizes 8/10/11 px-height.
- **Badge**: square, uppercase, semantic variants `success` / `warning` / `danger` + neutral.
- **Card**: hairline border, no shadow, square.
- **Input/Textarea**: square, border darkens on focus + 1px ring.
- **Tabs**: underline indicator (not pill).
- **Dialog**: square, subtle overlay + shadow; last resort — prefer inline/progressive UI.

## Motion

150–300ms, ease-out. Never animate layout properties. Respect `prefers-reduced-motion`.

## Laws

No pure #000/#fff · no rounded corners · no gradient text · no side-stripe accent borders ·
no decorative glassmorphism · modals are a last resort · every word of copy earns its place ·
no em dashes.
