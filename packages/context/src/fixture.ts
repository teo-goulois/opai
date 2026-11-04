// A throwaway instance for the tests: four spaces, a few facts, a Git
// repository with a worktree.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export function makeFixture() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "opai-")));
  const root = join(base, "root");
  const work = join(base, "work");
  const space = (name: string, yaml: string) =>
    write(join(root, "spaces", name, "space.yaml"), yaml);

  space("global", "name: global\nbase: true\n");
  space("perso", "name: perso\ndefault: true\n");
  space("client", `name: client\npaths:\n  - ${join(work, "client")}\n`);
  space(
    "billing",
    `name: billing\ndisable:\n  - handbook\npaths:\n  - "${join(work, "client", "billing")}"\n`,
  );
  write(join(root, "spaces", "global", "AGENTS.md"), "# Global\n\nNever shown by the hook.\n");
  write(join(root, "spaces", "billing", "AGENTS.md"), "# Billing\n\nInvoices are in euros.\n");

  write(
    join(root, "spaces", "global", "context", "memory", "machines.md"),
    "# Machines\n\nThe runner is runner-mac-01.\n",
  );
  write(
    join(root, "spaces", "client", "context", "memory", "facturation.md"),
    "# Facturation\n\nLa commission est de 4 %.\nLa règle vaut pour les nouveaux magasins.\n",
  );
  write(
    join(root, "spaces", "client", "context", "memory", "README.md"),
    "# Index\n\nfacturation\n",
  );
  write(join(root, "spaces", "client", "context", "notes.md"), "# Not a fact\n");
  write(join(base, "secret.md"), "# Secret\n");
  symlinkSync(
    join(base, "secret.md"),
    join(root, "spaces", "client", "context", "memory", "escape.md"),
  );

  // A repository in the client space, with a worktree outside every space.
  const repo = join(work, "client");
  mkdirSync(join(repo, "billing"), { recursive: true });
  write(join(repo, "billing", "README.md"), "billing\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.name=t", "-c", "user.email=t@t", "add", ".");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
  const worktree = join(base, "worktree");
  git("worktree", "add", "-q", worktree);

  return {
    root,
    work,
    worktree,
    outside: join(base, "elsewhere"),
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}
