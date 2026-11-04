// opai skills: the command line of skills.ts. opai also calls `launch` to get
// the arguments it adds when it starts Claude Code or Codex.
//
//   opai skills list
//   opai skills add <source> [--space <name>] [--name <name>] [--notes <text>]
//   opai skills source <name> <source> [--notes <text>]
//   opai skills update <name> [--apply] [--force]
//   opai skills new <name> [--space <name>] [--description <text>]
//   opai skills move <name> <space>
//   opai skills remove <name>
//   opai skills link
//   opai skills check
//
// A source is owner/repo/path (GitHub), a GitHub URL, the URL of a SKILL.md,
// or a folder.

import { parseArgs } from "node:util";

import {
  addSkill,
  checkSkills,
  describeSource,
  launchArgs,
  link,
  listSkills,
  moveSkill,
  newSkill,
  recordSource,
  removeSkill,
  SkillError,
  updateSkill,
} from "./skills.ts";
import { ROOT } from "./spaces.ts";

const USAGE = `usage: opai skills <command>

  list                                     every skill, by space
  add <source> [--space s] [--name n]      import a skill, with its provenance
  source <name> <source>                   record where an existing skill comes from
  update <name> [--apply] [--force]        compare with its source, take the new version
  new <name> [--space s] [--description d] start a skill
  move <name> <space>                      move a skill to another space
  remove <name>                            delete a skill
  link                                     make the links of Claude Code and Codex match
  check                                    report what is wrong

A source is owner/repo/path (GitHub), a GitHub URL, the URL of a SKILL.md, or a folder.`;

function report(lines: string[], label: string) {
  for (const line of lines) console.log(`${label} ${line}`);
}

async function main(argv: string[]) {
  const [command, ...rest] = argv;

  if (command === "launch") {
    // opai reads one argument per line.
    const [tool, ...args] = rest;
    if (tool !== "claude" && tool !== "codex") throw new SkillError("launch claude|codex");
    const extra = launchArgs(
      ROOT,
      tool,
      process.cwd(),
      args.filter((arg) => arg !== "--"),
    );
    if (extra.length > 0) process.stdout.write(`${extra.join("\n")}\n`);
    return;
  }

  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      space: { type: "string" },
      name: { type: "string" },
      notes: { type: "string" },
      description: { type: "string" },
      apply: { type: "boolean" },
      force: { type: "boolean" },
    },
  });

  switch (command) {
    case "list": {
      const skills = listSkills(ROOT);
      let space = "";
      for (const skill of skills) {
        if (skill.space !== space) {
          space = skill.space;
          console.log(`\n${space}`);
        }
        const notes = [
          skill.explicitOnly ? "explicit only" : "",
          skill.provenance ? `from ${describeSource(skill.provenance.source)}` : "",
          skill.modified ? "changed here" : "",
        ].filter(Boolean);
        console.log(`  ${skill.name}${notes.length > 0 ? `  (${notes.join(", ")})` : ""}`);
      }
      return;
    }
    case "add": {
      const [source] = positionals;
      if (!source) throw new SkillError("add <source>");
      const skill = await addSkill(ROOT, source, values);
      console.log(`Added ${skill.name} to ${skill.space}: ${skill.folder}`);
      return;
    }
    case "source": {
      const [name, source] = positionals;
      if (!name || !source) throw new SkillError("source <name> <source>");
      const { skill, same } = await recordSource(ROOT, name, source, values.notes);
      console.log(
        `${skill.name} comes from ${describeSource(skill.provenance!.source)}; ` +
          (same ? "it matches upstream." : "it differs from upstream: see opai skills update."),
      );
      return;
    }
    case "update": {
      const [name] = positionals;
      if (!name) throw new SkillError("update <name>");
      const result = await updateSkill(ROOT, name, values);
      if (!result.diff) console.log(`${name} matches its source.`);
      else {
        console.log(result.diff);
        if (result.applied) console.log(`Updated ${name} from its source.`);
        else if (!result.upstreamChanged) {
          console.log(
            `Upstream has not changed since the last import; the diff is our own changes.`,
          );
        } else console.log(`Upstream changed. Take it with: opai skills update ${name} --apply`);
      }
      return;
    }
    case "new": {
      const [name] = positionals;
      if (!name) throw new SkillError("new <name>");
      const skill = newSkill(ROOT, name, values);
      console.log(`Started ${skill.folder}/SKILL.md`);
      return;
    }
    case "move": {
      const [name, space] = positionals;
      if (!name || !space) throw new SkillError("move <name> <space>");
      const skill = moveSkill(ROOT, name, space);
      console.log(`Moved ${name} to ${skill.folder}`);
      return;
    }
    case "remove": {
      const [name] = positionals;
      if (!name) throw new SkillError("remove <name>");
      const skill = removeSkill(ROOT, name);
      console.log(`Removed ${skill.folder}`);
      return;
    }
    case "link": {
      const result = link(ROOT);
      report(result.added, "linked");
      report(result.removed, "unlinked");
      report(result.policies, "policy");
      report(result.conflicts, "conflict:");
      if (result.conflicts.length > 0) process.exitCode = 1;
      return;
    }
    case "check": {
      const problems = checkSkills(ROOT);
      for (const problem of problems) console.log(problem);
      if (problems.length > 0) process.exitCode = 1;
      else console.log("Skills are in order.");
      return;
    }
    default:
      console.log(USAGE);
      if (command && command !== "help") process.exitCode = 2;
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof SkillError || (error instanceof Error && error.name === "TypeError")))
    throw error;
  console.error(`opai skills: ${error.message}`);
  process.exitCode = 1;
}
