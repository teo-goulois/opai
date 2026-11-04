import { readFileSync } from "node:fs";
import { join } from "node:path";

import { listSkills, type Skill } from "../skills.ts";
import type { HandbookConfig } from "./config.ts";

// Blocks of a handbook page filled from the instance, each time the page is
// read or published, so they never go stale:
//
//   <!-- opai:skills --> … <!-- /opai:skills -->
//     every skill, grouped as handbook.json's `skills.groups` says, the rest
//     under "Other"
//   <!-- opai:include spaces/global/AGENTS.md --> … <!-- /opai:include -->
//     a file of the instance, shown as-is in a `text` fence
//
// What sits between the markers in the file is replaced; the rest of the page
// is written by hand.

const SKILLS = /<!-- opai:skills -->[\s\S]*?<!-- \/opai:skills -->/g;
const INCLUDE = /<!-- opai:include ([^\s>]+) -->[\s\S]*?<!-- \/opai:include -->/g;

/** The page with its blocks filled, and whether it had any. */
export function renderBlocks(root: string, markdown: string, config: HandbookConfig) {
  let generated = false;
  const filled = markdown
    .replace(SKILLS, () => {
      generated = true;
      return `<!-- opai:skills -->\n\n${skillList(root, config)}\n\n<!-- /opai:skills -->`;
    })
    .replace(INCLUDE, (_, path: string) => {
      generated = true;
      if (path.split("/").includes(".."))
        throw new Error(`opai:include leaves the instance: ${path}`);
      const text = readFileSync(join(root, path), "utf8").trim();
      return `<!-- opai:include ${path} -->\n\n\`\`\`text\n${text}\n\`\`\`\n\n<!-- /opai:include -->`;
    });
  return { markdown: filled, generated };
}

function skillList(root: string, config: HandbookConfig) {
  const skills = new Map(listSkills(root).map((skill) => [skill.name, skill]));
  const groups = config.skills?.groups ?? [];
  const grouped = new Set(groups.flatMap((group) => group.skills));
  const sections = [
    ...groups.map((group) => ({
      title: group.title,
      skills: group.skills.flatMap((name) => skills.get(name) ?? []),
    })),
    {
      title: groups.length > 0 ? "Other" : "Skills",
      skills: [...skills.values()]
        .filter((skill) => !grouped.has(skill.name))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
  ].filter((section) => section.skills.length > 0);
  return sections
    .map((section) =>
      [`## ${section.title}`, "", ...section.skills.map((skill) => skillLine(skill))].join("\n"),
    )
    .join("\n\n");
}

function skillLine(skill: Skill) {
  const summary = /^.*?[.!?](?=\s|$)/.exec(skill.description.trim())?.[0] ?? skill.description;
  return `- **\`${skill.name}\`**: ${summary} Source: ${owner(skill)}.`;
}

/** Who a skill comes from: its GitHub owner, its site, or the instance's owner. */
function owner(skill: Skill) {
  const source = skill.provenance?.source;
  if (source?.type === "github") {
    const [name] = source.repo.split("/");
    return `[${name}](https://github.com/${source.repo})`;
  }
  if (source?.type === "url") {
    const url = new URL(source.url);
    return `[${url.hostname}](${url.origin})`;
  }
  return "me, private";
}
