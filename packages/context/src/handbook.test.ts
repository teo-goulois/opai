import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { Effect } from "effect";

import { makeFixture } from "./fixture.ts";
import { getHandbook, getHandbookPage, updateHandbookPage } from "./handbook/pages.ts";
import { previewPublish } from "./handbook/publish.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const { root } = fixture;

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const page = (title: string, body: string) =>
  `---\ntitle: "${title}"\ndescription: "${title} page."\n---\n\n${body}\n`;

// The site the handbook publishes into: a bare repository with a build script
// that lists the pages it finds.
const site = join(dirname(root), "site.git");
const work = join(dirname(root), "site");
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    stdio: "ignore",
  });
execFileSync("git", ["init", "-q", "--bare", "-b", "main", site]);
write(
  join(work, "web", "package.json"),
  JSON.stringify({ scripts: { build: "ls ../content > ../pages.txt" } }),
);
write(join(work, "content", "old.md"), page("Old", "Gone after the export."));
execFileSync("git", ["init", "-q", "-b", "main", work]);
git(work, "add", ".");
git(work, "commit", "-qm", "init");
git(work, "push", "-q", site, "main");

write(
  join(root, "handbook", "handbook.json"),
  JSON.stringify({
    site: "https://example.com/code",
    publish: { repo: site, path: "content", build: { cwd: "web", script: "build" } },
    sections: [
      {
        title: "Start",
        entries: [
          { page: "" },
          { page: "stack", depth: 1 },
          { title: "Elsewhere", href: "/toolkit", description: "Not a page." },
        ],
      },
    ],
    skills: { groups: [{ title: "Writing", skills: ["unslop"] }] },
  }),
);
write(join(root, "handbook", "index.md"), page("Home", "Read [the stack](/code/stack)."));
write(join(root, "handbook", "stack", "index.md"), page("Stack", "One stack."));
write(
  join(root, "handbook", "agents.md"),
  page(
    "Agents",
    "<!-- opai:skills -->\nstale\n<!-- /opai:skills -->\n\n<!-- opai:include spaces/billing/AGENTS.md -->\n<!-- /opai:include -->",
  ),
);
write(
  join(root, "spaces", "global", "skills", "unslop", "SKILL.md"),
  "---\nname: unslop\ndescription: Removes AI habits. Keeps the voice.\n---\n",
);
write(
  join(root, "spaces", "global", "skills", "grilling", "SKILL.md"),
  "---\nname: grilling\ndescription: Asks hard questions.\n---\n",
);

const read = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

test("lists the sections of handbook.json, then the pages they leave out", async () => {
  const handbook = await read(getHandbook(root));
  assert.equal(handbook.status, "ready");
  if (handbook.status !== "ready") return;
  assert.equal(handbook.publishable, true);
  assert.deepEqual(
    handbook.sections.map((section) => [
      section.title,
      section.entries.map((entry) => (entry.kind === "page" ? entry.page.slug : entry.url)),
    ]),
    [
      ["Start", ["index", "stack", "https://example.com/toolkit"]],
      ["Other pages", ["agents"]],
    ],
  );
  const stack = handbook.pages.find((candidate) => candidate.slug === "stack");
  assert.equal(stack?.path, "handbook/stack/index.md");
  assert.equal(stack?.url, "https://example.com/code/stack");
});

test("fills the skills and include blocks from the instance", async () => {
  const agents = await read(getHandbookPage(root, "agents"));
  assert.equal(agents.generated, true);
  assert.match(
    agents.markdown,
    /## Writing\n\n- \*\*`unslop`\*\*: Removes AI habits\. Source: me, private\./,
  );
  assert.match(agents.markdown, /## Other\n\n- \*\*`grilling`\*\*/);
  assert.doesNotMatch(agents.markdown, /stale/);
  assert.match(agents.markdown, /```text\n# Billing\n\nInvoices are in euros\.\n```/);
});

test("saves a page, keeping its frontmatter, and refuses a stale edit", async () => {
  const stack = await read(getHandbookPage(root, "stack"));
  await read(updateHandbookPage(root, "stack", "Two stacks.", stack.hash));
  assert.equal(
    readFileSync(join(root, "handbook", "stack", "index.md"), "utf8"),
    page("Stack", "Two stacks."),
  );
  const stale = await Effect.runPromise(
    Effect.flip(updateHandbookPage(root, "stack", "Three.", stack.hash)),
  );
  assert.equal(stale._tag, "StaleWrite");
});

test("the publish preview replaces the site's folder and runs its build", async () => {
  process.env.HANDBOOK_DIR = join(dirname(root), "clone");
  try {
    const preview = await read(previewPublish(root));
    const paths = preview.files.map((file) => file.path).sort();
    assert.deepEqual(paths, [
      "content/agents.md",
      "content/handbook.json",
      "content/index.md",
      "content/old.md",
      "content/stack/index.md",
      "pages.txt",
    ]);
    assert.match(preview.diff, /\+- \*\*`unslop`\*\*/);
    assert.match(preview.diff, /-Gone after the export\./);
  } finally {
    delete process.env.HANDBOOK_DIR;
  }
});
