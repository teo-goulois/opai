import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import {
  addSkill,
  checkSkills,
  launchArgs,
  link,
  listSkills,
  moveSkill,
  newSkill,
  parseSource,
  recordSource,
  removeSkill,
  saveSkill,
  skillDetail,
  updateSkill,
} from "./skills.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const { root } = fixture;

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const skillText = (name: string, extra = "") =>
  `---\nname: ${name}\ndescription: Does ${name}.${extra}\n---\n\n# ${name}\n`;

write(join(root, "spaces", "global", "skills", "localify", "SKILL.md"), skillText("localify"));
write(join(root, "spaces", "client", "skills", "invoices", "SKILL.md"), skillText("invoices"));
write(
  join(root, "spaces", "billing", "skills", "refunds", "SKILL.md"),
  skillText("refunds", "\ndisable-model-invocation: true"),
);
// Things the tools own, which link must leave alone.
write(join(root, "codex", "skills", ".system", "imagegen", "SKILL.md"), skillText("imagegen"));
write(join(root, "claude", "skills", "synced", "x", "SKILL.md"), skillText("x"));

// An upstream skill, as a local folder.
const upstream = join(realpathSync(mkdtempSync(join(tmpdir(), "opai-upstream-"))), "unslop");
write(join(upstream, "SKILL.md"), skillText("unslop"));
write(join(upstream, "references", "words.md"), "Delve.\n");

test("links global skills for both tools, a space's skills for Codex and as a Claude plugin", () => {
  const report = link(root);
  assert.deepEqual(report.conflicts, []);
  assert.equal(
    readlinkSync(join(root, "claude", "skills", "localify")),
    "../../spaces/global/skills/localify",
  );
  assert.ok(
    !existsSync(join(root, "claude", "skills", "invoices")),
    "a space skill stays out of claude/skills",
  );
  assert.equal(
    readlinkSync(join(root, "codex", "skills", "invoices")),
    "../../spaces/client/skills/invoices",
  );
  assert.equal(
    readlinkSync(join(root, ".local", "plugins", "client", "skills")),
    "../../../spaces/client/skills",
  );
  assert.ok(
    existsSync(join(root, "codex", "skills", ".system", "imagegen")),
    ".system is left alone",
  );
  assert.ok(existsSync(join(root, "claude", "skills", "synced")), "synced is left alone");
  assert.deepEqual(checkSkills(root), []);
});

test("an explicit-only skill tells Codex, and the policy follows the flag back", () => {
  const policy = join(root, "spaces", "billing", "skills", "refunds", "agents", "openai.yaml");
  assert.match(readFileSync(policy, "utf8"), /allow_implicit_invocation: false/);
  write(join(root, "spaces", "billing", "skills", "refunds", "SKILL.md"), skillText("refunds"));
  assert.equal(checkSkills(root).length, 1, "check sees the policy is stale");
  link(root);
  assert.ok(!existsSync(policy), "an emptied openai.yaml is removed");
  assert.deepEqual(checkSkills(root), []);
});

test("a file in the way is a conflict, never replaced", () => {
  write(join(root, "spaces", "global", "skills", "imagegen", "SKILL.md"), skillText("imagegen"));
  write(join(root, "codex", "skills", "imagegen", "SKILL.md"), skillText("imagegen"));
  const report = link(root);
  assert.deepEqual(report.conflicts, [
    "codex/skills/imagegen exists and is not a link this command made",
  ]);
  assert.ok(!lstatSync(join(root, "codex", "skills", "imagegen")).isSymbolicLink());
  removeSkill(root, "imagegen");
});

test("at launch, a session gets its space's skills and not the others'", () => {
  const client = join(fixture.work, "client");
  const billing = join(fixture.work, "client", "billing");
  assert.deepEqual(launchArgs(root, "claude", client), [
    "--plugin-dir",
    join(root, ".local", "plugins", "client"),
  ]);
  assert.deepEqual(launchArgs(root, "claude", fixture.outside), [], "perso has no skills");
  assert.deepEqual(launchArgs(root, "claude", client, ["mcp", "list"]), [], "not for a subcommand");
  const codex = launchArgs(root, "codex", billing).join(" ");
  assert.match(codex, /\{name="invoices",enabled=false\}/);
  assert.doesNotMatch(codex, /name="refunds"/, "billing is the session's space");
  assert.doesNotMatch(codex, /name="localify"/, "global skills are in every session");
});

test("imports a skill with its provenance, and tells local changes from upstream ones", async () => {
  const skill = await addSkill(root, upstream, { notes: "Adapted: shorter description." });
  assert.equal(skill.folder, "spaces/global/skills/unslop");
  assert.equal(skill.provenance?.source.type, "local");
  assert.equal(skill.modified, false);
  assert.ok(existsSync(join(root, "claude", "skills", "unslop")));
  await assert.rejects(addSkill(root, upstream), /already exists/);

  const ours = join(root, "spaces", "global", "skills", "unslop", "SKILL.md");
  writeFileSync(ours, skillText("unslop", " Ours."));
  assert.equal(listSkills(root).find((item) => item.name === "unslop")?.modified, true);
  const same = await updateSkill(root, "unslop");
  assert.equal(same.upstreamChanged, false);
  assert.match(same.diff, /Ours\./);

  write(join(upstream, "references", "words.md"), "Delve. Tapestry.\n");
  await assert.rejects(updateSkill(root, "unslop", { apply: true }), /changed here/);
  const forced = await updateSkill(root, "unslop", { apply: true, force: true });
  assert.equal(forced.applied, true);
  assert.match(readFileSync(join(dirname(ours), "references", "words.md"), "utf8"), /Tapestry/);
  const after = listSkills(root).find((item) => item.name === "unslop")!;
  assert.equal(after.modified, false);
  assert.equal(after.provenance?.notes, "Adapted: shorter description.", "notes survive an update");
});

test("records the source of a skill already here", async () => {
  const { same, skill } = await recordSource(root, "localify", upstream);
  assert.equal(same, false);
  assert.equal(skill.provenance?.source.type, "local");
  assert.equal(skill.modified, false);
});

test("starts, moves and removes a skill, keeping the links in step", () => {
  newSkill(root, "deploy", { space: "client", description: "Deploys the client app." });
  assert.ok(existsSync(join(root, "codex", "skills", "deploy")));
  moveSkill(root, "deploy", "global");
  assert.ok(existsSync(join(root, "claude", "skills", "deploy")));
  removeSkill(root, "deploy");
  assert.ok(!existsSync(join(root, "claude", "skills", "deploy")));
  assert.ok(!existsSync(join(root, "codex", "skills", "deploy")));
  assert.throws(() => newSkill(root, "Not A Name"), /lowercase/);
  assert.deepEqual(checkSkills(root), []);
});

test("reads every way to name a source", () => {
  assert.deepEqual(parseSource("teo-goulois/skills/skills/handbook-build", "/nowhere"), {
    type: "github",
    repo: "teo-goulois/skills",
    path: "skills/handbook-build",
  });
  assert.deepEqual(
    parseSource("https://github.com/cursor/plugins/tree/main/pstack/skills/unslop", "/nowhere"),
    { type: "github", repo: "cursor/plugins", ref: "main", path: "pstack/skills/unslop" },
  );
  assert.deepEqual(parseSource("https://github.com/o/r/blob/v2/skills/x/SKILL.md", "/nowhere"), {
    type: "github",
    repo: "o/r",
    ref: "v2",
    path: "skills/x",
  });
  assert.deepEqual(parseSource("https://treg.to/skill.md", "/nowhere"), {
    type: "url",
    url: "https://treg.to/skill.md",
  });
});

test("saves a SKILL.md only from its latest version, under the same name", () => {
  const before = skillDetail(root, "localify");
  assert.throws(() => saveSkill(root, "localify", before.markdown, "stale"), /changed on disk/);
  assert.throws(
    () =>
      saveSkill(
        root,
        "localify",
        before.markdown.replace("name: localify", "name: other"),
        before.hash,
      ),
    /name stays localify/,
  );
  const saved = saveSkill(
    root,
    "localify",
    before.markdown.replace("---\n\n", "disable-model-invocation: true\n---\n\n"),
    before.hash,
  );
  assert.equal(saved.explicitOnly, true);
  assert.ok(
    existsSync(join(root, "spaces", "global", "skills", "localify", "agents", "openai.yaml")),
  );
});
