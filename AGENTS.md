# Working on Opai

This repository is the engine: code only, no personal data. Read `README.md`
before changing anything.

- Nothing here reads a real instance: code takes the instance folder (`root`,
  from `OPAI_HOME`), and tests build throwaway ones (`fixture.ts`, `init.ts`).
- What every new instance gets lives in `template/`. Change `init.ts` with it
  when a new file needs the engine's paths.
- Add only what is used. Remove what a change replaces.
- For UI work in `apps/` and `packages/ui/`, follow `GUI.md` and use the
  `graphical-ui`, `graphical-convert`, or `graphical-audit` skill in
  `.agents/skills/` as appropriate. Icons come through `@opai/ui/icon` only:
  see `packages/ui/src/icon/README.md`.
- `pnpm check` must pass before each commit.
