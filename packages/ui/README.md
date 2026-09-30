# @repo/ui

React 18 components and design tokens in the Matchbox Pro design language
(Figtree Variable + DM Mono, tabular numerals, one orange accent, small radii).
Source-only: apps compile it with their own Vite + Tailwind 3 build.

## Install

```json
"dependencies": { "@repo/ui": "workspace:*" }
```

## Tailwind

```ts
// tailwind.config.ts
import uiPreset from "@repo/ui/tailwind-preset";
import type { Config } from "tailwindcss";

export default {
  presets: [uiPreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.tsx",
  ],
} satisfies Config;
```

The preset maps every token to a color (`bg-surface`, `text-ink-2`,
`border-line`, `bg-pos/10`, ...) via `color-mix`, adds font weights 550/650,
`shadow-sheet|pop|knob|dialog|toast`, `animate-fade-in|sheet-in|pop-in`, and a
class dark mode (`.dark` on `<html>`; a `.light` subtree opts back out). The
preset's `content` is empty: always include the `packages/ui` glob above.

## Tokens and fonts

```css
/* src/styles.css */
@import "@repo/ui/tokens.css";
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`tokens.css` loads the fonts, defines light (`:root`, `.light`) and dark
(`.dark`) tokens, body ink/background, `tnum`, focus ring, selection and
reduced-motion handling.

## Theme

Set the class before first paint, then mount the provider.

```ts
// vite.config.ts
import { themeScript } from "@repo/ui/theme-script";

const themeScriptPlugin = {
  name: "matchbox-theme-script",
  transformIndexHtml: () => [
    { tag: "script", children: themeScript, injectTo: "head-prepend" as const },
  ],
};
```

The script is a fixed string, so a CSP can allow it by hash.

```tsx
import { ThemeProvider } from "@repo/ui/theme";
import * as Toast from "@repo/ui/toast";
import * as Tooltip from "@repo/ui/tooltip";

<ThemeProvider>
  <Tooltip.Provider>
    <Toast.Provider>{app}</Toast.Provider>
  </Tooltip.Provider>
</ThemeProvider>;
```

`useTheme()` returns `{ preference: "system" | "light" | "dark", resolved,
setPreference }`. Overrides persist in `localStorage["matchbox:theme"]`;
`system` clears the key. `@repo/ui/theme-toggle` is the Pro sidebar switch.

## Components

Namespace imports, compound `Root` parts:

```tsx
import * as Button from "@repo/ui/button"
import * as Field from "@repo/ui/field"
import * as Input from "@repo/ui/input"

<Field.Root>
  <Field.Label>Name</Field.Label>
  <Field.Control><Input.Root /></Field.Control>
  <Field.Error>{error}</Field.Error>
</Field.Root>
<Button.Root loading={saving}>Save</Button.Root>
```

| Subpath              | Parts                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `button`             | `Root` (`variant` primary/secondary/ghost/danger/soft, `size` sm/md/lg/icon-sm/icon-md, `loading`, `asChild`), `buttonStyles`                                                                  |
| `input`              | `Root` (`size`, `mono`), `Group`, `Adornment`, `controlStyles`                                                                                                                                 |
| `textarea`           | `Root` (`mono`)                                                                                                                                                                                |
| `select`             | `Root`, `Trigger` (`size`), `Value`, `Content`, `Item`, `Group`, `Label`, `Separator`                                                                                                          |
| `checkbox`, `switch` | `Root`                                                                                                                                                                                         |
| `field`              | `Root` (`invalid`, `required`, `disabled`, `orientation`, `controlId`), `Label`, `Control`, `Description`, `Error`                                                                             |
| `fieldset`           | `Root`, `Legend` (`hidden`), `Description`, `Fields` (the `<ol>`; `Field.Root` becomes `<li>`)                                                                                                 |
| `table`              | `Root` (`density`), `Caption`, `Header`, `Body`, `Row` (`interactive`, `selected`), `Head`/`Cell` (`numeric`, Cell `mono`)                                                                     |
| `badge`              | `Root` (`tone` neutral/accent/pos/warn/neg, `dot`, `mono`)                                                                                                                                     |
| `card`               | `Root` (`variant` flat/panel), `Header`, `Title`, `Actions`, `Body`, `Footer`                                                                                                                  |
| `dialog`             | `Root`, `Trigger`, `Content` (`placement` center/sheet, `size`), `Header`, `Title`, `Description`, `Body`, `Footer`, `Close`                                                                   |
| `alert-dialog`       | `Root`, `Trigger`, `Content`, `Header`, `Title`, `Description`, `Footer`, `Cancel`, `Action` (`variant` danger/primary)                                                                        |
| `dropdown-menu`      | `Root`, `Trigger`, `Content`, `Item` (`tone`), `Label`, `Separator`, `Group`                                                                                                                   |
| `tabs`               | `Root`, `List`, `Trigger`, `Content`                                                                                                                                                           |
| `segmented-control`  | `Root` (`value`, `onValueChange`, `aria-label`, `size`), `Item`                                                                                                                                |
| `toast`              | `Provider`, `useToast()` → `toast({ title, description?, tone?, duration?, action? })`, `dismiss(id)`                                                                                          |
| `tooltip`            | `Provider`, `Root`, `Trigger`, `Content`                                                                                                                                                       |
| `copy-field`         | `Root` (`value`, `label`, `display?`, `size`, `showText`)                                                                                                                                      |
| `code-block`         | `Root` (`code` + `title?`, or `snippets` + `language?`/`defaultLanguage?`/`onLanguageChange?`)                                                                                                 |
| `empty-state`        | `Root` (`layout` inline/centered), `Title`, `Action`                                                                                                                                           |
| `skeleton`           | `Root` (`shape` line/block/circle)                                                                                                                                                             |
| `key-value`          | `Root` (`layout` rows/stacked), `Item`, `Term`, `Value` (`mono`; empty renders `—`)                                                                                                            |
| `app-shell`          | `Root`, `SkipLink`, `Sidebar` (`collapsed`), `SidebarHeader`, `SidebarNav`, `SidebarSection` (`label`), `SidebarItem`, `SidebarFooter`, `Body`, `TopBar`, `Main`, `MobileNav`, `MobileNavItem` |
| `page-header`        | `Root`, `Heading`, `Eyebrow`, `Title`, `Description`, `Actions`                                                                                                                                |
| `logo`               | `Root` (`variant` wordmark/icon, `alt`), `logoUrls`                                                                                                                                            |
| `wallet-address`     | `Root` (`address`, `lead`, `tail`, `copyable`), `shortenAddress`                                                                                                                               |
| `showcase`           | `Showcase`: every component in light and dark, for a dev-only route                                                                                                                            |
| `cn`, `use-copy`     | `cn`, `tv`; `useCopy(value)`                                                                                                                                                                   |

Router links in nav items: pass the link as the only child, no children of its
own.

```tsx
<AppShell.SidebarItem
  asChild
  active={isActive}
  label="Apps"
  icon={<Box size={18} />}
>
  <Link to="/apps" />
</AppShell.SidebarItem>
```

## Notes

- Light-mode `--accent-ink`, `--warn`, `--pos` and `--on-accent` are darker
  than Pro's so small text and primary buttons meet WCAG AA; the focus ring
  uses `--accent-ink`. Keep `text-muted` for placeholders, icons and disabled
  states; use `text-secondary` for readable secondary text.
- Motion is opacity/transform only and collapses under
  `prefers-reduced-motion`.
- Portaled content (dialogs, menus, toasts) follows the `<html>` theme, not a
  `.light`/`.dark` subtree.
