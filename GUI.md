# GUI — Untitled design language

This file contains the saved theme and instructions for using it. The **Theme values** sections are readable, editable JSON and can restore the theme in Graphical. The accompanying `gui/` references describe component structure, behavior, and resolved styles; `skills/` contains workflows for using them. The full-component selection also includes Graphical’s actual themed component source and runtime. The default theme-and-skills selection includes guidance only and adds no runtime source or dependencies.

## Start here

Keep `GUI.md` and `gui/` at the project root. The install command puts the three skills in `.agents/skills/`; for a ZIP, copy the folders from `skills/` there, preserving existing files and local edits. Add this pointer to the project’s active agent instructions without replacing them: “For UI work, follow GUI.md and use graphical-ui, graphical-convert, or graphical-audit as appropriate.” Agents with other conventions can read these files directly.

Inspect the app’s styling, shared components, and consumers before making changes. Honor the selected setup recorded below and any scope the user already gave. Otherwise ask once: **“How would you like to apply this theme?”**

- **Convert the whole app:** update shared components and their usage across screens.
- **Convert selected areas:** establish the pages or components and contain shared changes using the app’s existing mechanisms.
- **Keep the current UI:** install the guidance and instruction pointer, then stop without changing styles or runtime dependencies.

Wait for a missing scope choice before changing application styles. A component request does not authorize whole-app conversion. These rules apply equally to prompt, terminal, and ZIP setup.

## Apply the theme

Use `graphical-convert` for existing UI, including its shadcn mapping when relevant. Use `graphical-ui` for new UI and future interface edits, even when the user does not mention Graphical. New screens use the current design system by default.

Implement the chosen scope in the app’s existing styling system and shared components. Use the values below, [foundations](gui/foundations.md), and each relevant [component specification](gui/components.md). Preserve authored component edits across parts, variants, sizes, states, modes, and portals. Global tokens alone do not complete conversion; an approximate preset or unchanged library defaults do not replace the supplied specifications.

Preserve content, behavior, routing, public component APIs, and intentional local customizations. After deliberate customization, the app’s active definitions take precedence over this downloaded snapshot. Preserve dependency versions, ranges, overrides, and lockfiles. Add only missing packages using the project’s package manager and version policy; verify APIs against installed versions and report incompatibilities instead of silently migrating dependencies.

### Set up all Base UI components

An explicit request for all Base UI components, including a recorded selection below, authorizes theme conversion, asset setup, and reusable modules across the existing app. Proceed without another scope question, honoring any narrower scope already supplied.

Integrate the bundled Graphical components and theme runtime; use their actual source rather than reconstructing the library from specifications. Import the bundled stylesheet, connect the theme provider to the supplied document and the app’s active color mode, and expose usable component imports. Reuse or adapt compatible existing shared components without discarding their public APIs or behavior. Use the [component specifications](gui/components.md) to verify the selected edits and [Base UI guidance](gui/base-ui.md) for integration. Check the receiving version’s [official catalog](https://base-ui.com/llms.txt) for additional primitives; use the same foundations where source is not supplied and disclose that coverage gap. Installing source files or dependencies alone does not complete setup until the components and existing app use the selected theme.

The source lives in `components/graphical/`. Import components, `GraphicalProvider`, and `theme` through its `index.ts`; `theme.ts` contains the captured document with the user’s component customizations. Import `components/graphical/styles.css` once at the framework’s supported stylesheet entry. Wrap the intended scope with `GraphicalProvider document={theme} colorMode={colorMode}`, using the app’s real light/dark state. Keep the bundled shared runtime with the components so their resolver, motion, and portal behavior remain connected. Configure the selected icons with `IconRendererProvider` under [Base UI integration](gui/base-ui.md), and fonts with the app’s loader; artwork and font files are not included. Do not silently leave Lucide active when a different free pack was selected.

Add only missing `@base-ui/react`, `motion`, and `lucide-react` packages required by the bundled source, using the receiving project’s package manager and version policy. Preserve its installed framework, React, dependency ranges, overrides, and lockfile decisions. Adapt source to supported APIs or report concrete incompatibilities; do not silently replace package versions. Install the selected fonts and icon pack separately under the asset instructions below. Guidance-only installation adds none of these runtime dependencies.

Before running an install command, check the receiving app’s installed APIs and dependency constraints. The supplied runtime uses React 19 context/provider and ref APIs and is verified against Base UI 1.7; this is a compatibility baseline, not a version-pinning requirement. Existing React 18 apps need compatible context/provider and ref-forwarding adaptations, or a concrete blocker report. Never upgrade existing dependencies automatically to make the source work.

## Rules for UI work

- Locate the active theme, mode, shared components, and nearby patterns first. Use existing tokens or verified aliases; report missing choices instead of inventing theme values. Keep named references at use sites and literals in token definitions. Typography includes family, weight, size, line height, and letter spacing.
- Reuse components and variants, then compose available primitives. New components fill missing capabilities using existing tokens. Consolidate equivalent roles without changing established values unless requested.
- Keep interfaces minimal: useful titles, content, and actions; no decorative eyebrows, filler subtitles, slogans, or redundant explanations. Default wrapping text to `text-wrap: pretty`.
- Treat grid tracks, breakpoints, content widths, aspect ratios, and positioning as structural choices. Preserve meaningful data encodings and external widgets in context.
- Preserve keyboard focus, labels, form values, interaction states, and theme propagation into portals. Use composed box shadows for edges with zero native border width, retaining opacity and the theme’s stroke placement.
- Fonts and icon artwork are acquired separately. Follow the selected assets and official links below. Preserve font names, weights, fallback stacks, and icon style/weight. Use licensed files when supplied; ask for missing files or their location before a fallback decision, honoring an existing answer. Use the documented free fallback only for unavailable paid selections, disclose substitutions, and explain how to restore licensed assets. System fonts need no download; report unresolved or gated sources without silently substituting.

## Verify and hand off

Finish conversion with `graphical-audit`: find and fix gaps within the agreed scope. Report each component as converted, already matches, intentionally preserved, or blocked, with evidence or a reason. For full library setup, also list module import paths and catalog coverage. Report actual checks, substitutions, and remaining gaps; source inspection alone does not establish rendered equivalence. Follow the receiving project’s testing and browser-review policy. A small edit does not trigger an app-wide audit.

## Focused references

| Need                                                   | Read                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Token ownership, aliases, and deliberate theme changes | [Theme contract](gui/theme-contract.md)                                   |
| Hierarchy, composition, navigation, and controls       | [Interface judgment](gui/interface-judgment.md)                           |
| Colors, typography, spacing, effects, and motion       | [Foundations](gui/foundations.md)                                         |
| Asset installation and licensed fallbacks              | [Font and icon setup](gui/assets.md)                                      |
| Component anatomy, assignments, states, and modes      | [Component specifications](gui/components.md)                             |
| Primitives and existing libraries                      | [Base UI](gui/base-ui.md) · [Custom components](gui/custom-components.md) |
| Resolved CSS variables and component assignments       | [Theme references](gui/themes.md)                                         |
| Proportional checks                                    | [Verification](gui/verification.md)                                       |

| Task                                    | Skill               |
| --------------------------------------- | ------------------- |
| Build or edit UI with the current theme | `graphical-ui`      |
| Apply this theme to existing UI         | `graphical-convert` |
| Find and repair theme drift             | `graphical-audit`   |

## Fonts and icons

Follow [asset installation](gui/assets.md) when implementing this theme. Download and configure the selected free assets from their official sources; no font files or icon artwork are bundled. Weights below are the authored requests: load matching static faces or a variable range and report any unavailable weight. Register the exact family aliases below, or map the role tokens to the loader’s actual family.

| Selected font | Roles | Weights | Family stack | Setup |
| --- | --- | --- | --- | --- |
| <code>Geist</code> (free) | brand, ui, editorial | 400, 500, 700 | <code>"Sidebar Geist", sans-serif</code> | Download and load [Geist](https://vercel.com/font) in the app. |
| <code>Geist Mono</code> (free) | data | 400, 500, 700 | <code>"Sidebar Geist Mono", monospace</code> | Download and load [Geist Mono](https://vercel.com/font) in the app. |

### Icons

Selected: [Central](https://iconists.co/central), outlined. Use the user’s licensed Central artwork if supplied under the [vendor license](https://iconists.co/license). If missing, ask the user to share their licensed icon files or identify their location, explaining that Lucide is the free fallback. Honor an existing answer and continue independent work while waiting. When the user confirms the files are unavailable or chooses the fallback, install [Lucide](https://lucide.dev/guide/react/getting-started) (React: <code>lucide-react</code>) and wire it into the app’s icon adapter. Tell the user that Lucide is active and that they can license Central at the vendor link, download its icon files, give the agent their location, and update that adapter to restore Central.

Preserve icon size, color, weight, style, and accessible names. Match the selected style only where the pack supports it; Lucide’s official pack supplies outlines, so report a filled-style gap rather than claiming exact filled artwork. Keep existing package versions and add only missing packages using the receiving project’s package manager.

## Theme values

These sections contain the complete saved theme: both color modes, foundation values, and authored component edits. Import this GUI.md from Theme → Edit → Import theme to restore it. Shared palette catalogs and editor preferences are not part of the theme.

Lengths are pixels, letter spacing is em, motion durations are milliseconds, and opacity values are percentages. Text sizes, line heights, spacing, and radii render at the nearest whole pixel; the saved precision below preserves editing values. Color translucency defaults to 20% when omitted. Component edits use named tokens; the companion component specifications resolve inherited styles and behavior.

<!-- graphical-theme:start -->

### Identity

```json
{
  "format": "graphical-theme",
  "version": 1,
  "preset": "grove",
  "schemaVersion": 2,
  "name": "Untitled"
}
```

### Colors

```json
{
  "colors": {
    "dark": {
      "error": "#ff5263",
      "color-1": "#f4f83b",
      "color-2": "#76ef6b",
      "color-3": "#009ff0",
      "color-4": "#e864ff",
      "success": "#76ef6b",
      "warning": "#ffa344",
      "neutral-1": "#000000",
      "neutral-2": "#202020",
      "neutral-3": "#2b2b2b",
      "neutral-4": "#383838",
      "neutral-5": "#505050",
      "neutral-6": "#777777",
      "neutral-7": "#a3a3a3",
      "neutral-8": "#c6c6c6",
      "neutral-9": "#e5e5e5",
      "neutral-10": "#ffffff"
    },
    "light": {
      "error": "#ff5263",
      "color-1": "#E0E709",
      "color-2": "#76ef6b",
      "color-3": "#009ff0",
      "color-4": "#e864ff",
      "success": "#76ef6b",
      "warning": "#ffa344",
      "neutral-1": "#ffffff",
      "neutral-2": "#fafafa",
      "neutral-3": "#f0f0f0",
      "neutral-4": "#dedede",
      "neutral-5": "#c5c5c5",
      "neutral-6": "#969696",
      "neutral-7": "#6c6c6c",
      "neutral-8": "#454545",
      "neutral-9": "#252525",
      "neutral-10": "#000000"
    }
  },
  "primaryForeground": { "dark": "neutral-2", "light": "neutral-9" },
  "primaryActionColor": "color-1",
  "keyColorPalette": [
    "#76ef6b",
    "#E0E709",
    "#00c9bb",
    "#009ff0",
    "#e864ff",
    "#262626",
    "#ffa344"
  ]
}
```

### Typography

```json
{
  "fonts": {
    "ui": {
      "family": "\"Sidebar Geist\", sans-serif",
      "weights": { "heavy": 700, "medium": 500, "regular": 400 }
    },
    "brand": {
      "family": "\"Sidebar Geist\", sans-serif",
      "weights": { "heavy": 700, "medium": 500, "regular": 400 }
    },
    "editorial": {
      "family": "\"Sidebar Geist\", sans-serif",
      "weights": { "heavy": 700, "medium": 500, "regular": 400 }
    },
    "data": {
      "family": "\"Sidebar Geist Mono\", monospace",
      "weights": { "heavy": 700, "medium": 500, "regular": 400 }
    }
  },
  "text": {
    "l": { "size": 24, "lineHeight": 32 },
    "m": { "size": 16, "lineHeight": 24 },
    "s": { "size": 14, "lineHeight": 20 },
    "xl": { "size": 36, "lineHeight": 40 },
    "xs": { "size": 12, "lineHeight": 16 },
    "xxl": { "size": 48, "lineHeight": 52 },
    "xxs": { "size": 10, "lineHeight": 14 }
  },
  "letterSpacing": { "l": 0.01, "m": 0, "s": -0.01, "xl": 0.02, "xs": -0.02 }
}
```

### Spacing and corners

```json
{
  "spacing": {
    "l": 24,
    "m": 16,
    "s": 12,
    "xl": 32,
    "xs": 8,
    "xxl": 48,
    "xxs": 4,
    "zero": 0
  },
  "radius": {
    "l": 17.42,
    "m": 8.77,
    "s": 5.87,
    "xl": 26.26,
    "xs": 2.92,
    "full": 9999,
    "zero": 0
  }
}
```

### Borders and effects

```json
{
  "border": { "l": 2, "m": 1, "s": 1, "none": 0 },
  "shadows": {
    "l": {
      "x": 0,
      "y": 12,
      "blur": 30,
      "color": { "dark": "neutral-1", "light": "neutral-10" },
      "spread": 0,
      "opacity": 0
    },
    "m": {
      "x": 0,
      "y": 8,
      "blur": 24,
      "color": { "dark": "neutral-1", "light": "neutral-10" },
      "spread": 0,
      "opacity": 0
    },
    "s": {
      "x": 0,
      "y": 1,
      "blur": 2,
      "color": { "dark": "neutral-1", "light": "neutral-10" },
      "spread": 0,
      "opacity": 0
    }
  }
}
```

### Motion

```json
{
  "animation": {
    "large": { "easing": [ 0.16, 1, 0.3, 1 ], "duration": 300 },
    "easing": [ 0.2, 0.8, 0.2, 1 ],
    "duration": 150,
    "popupScale": 0.96,
    "pressDistance": 1
  }
}
```

### Icons

No separate icon weight is set; icons follow the surrounding text weight.

```json
{ "iconFamily": "Central", "iconStyle": "outlined" }
```

### Component edits

```json
{
  "componentTokens": {
    "switch:default:part:row:rest": { "gap": "s" },
    "switch:default:part:label:rest": { "textSize": "m" },
    "checkbox:default:part:label:rest": { "textSize": "m" },
    "switch:default:part:control:rest": { "controlSize": "xl" }
  },
  "componentVariants": {}
}
```

<!-- graphical-theme:end -->
