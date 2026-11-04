# Icons

`index.ts` is the only module the app imports icons from. It exports semantic
names (`SearchIcon`, `RulesIcon`), and two sets provide the same names:

- `lucide.tsx`: [Lucide](https://lucide.dev), free. The default.
- `nucleo.generated.tsx`: [Nucleo](https://nucleoapp.com), the Nucleo UI
  family, outline style, 18px grid, for those who own a license. Nucleo's
  artwork may not be redistributed, so this file and `svg/` stay out of Git:
  each machine builds them from its own Nucleo library. The theme in `GUI.md`
  names Central outlined; Nucleo UI outline has the same rounded look.

The app uses Nucleo when `nucleo.generated.tsx` exists, Lucide otherwise.
`OPAI_ICONS=lucide` or `OPAI_ICONS=nucleo` forces one
(`apps/web/vite.config.ts`). Type checks always read `lucide.tsx`, through the
`#icon-set` import of `package.json`.

Icons render at `1em`, so they follow the size and color of the text around
them. Hide decorative icons with `aria-hidden`; give icon-only buttons an
`aria-label`.

## Build the Nucleo set

With the Nucleo app installed and signed in on this machine:

```sh
pnpm --filter @opai/ui icons
```

It exports the icons `nucleo.json` names from the app's local library
(`~/Library/Application Support/Nucleo/icons`, or `NUCLEO_LIBRARY`) into
`svg/`, then generates `nucleo.generated.tsx`. `icons build` regenerates from
`svg/` only.

## Add an icon

1. Add its semantic name to `lucide.tsx`: `export const RulesIcon = icon(ScrollText);`
2. Add the same name to `nucleo.json` with the Nucleo icon's name (Nucleo UI,
   outline, 18px): `"RulesIcon": "scroll-text"`. The generator refuses to run
   while the two lists differ.
3. With Nucleo, run `pnpm --filter @opai/ui icons`.
4. It shows up on the design system page (`/design-system`).
