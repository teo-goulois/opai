// opai spaces: the command line of space-edit.ts.
//
//   opai spaces list
//   opai spaces new <name> [--description <text>] [--path <folder>]...
//   opai spaces edit <name> [--description <text>] [--add-path <folder>]...
//                           [--remove-path <folder>]... [--default]
//   opai spaces archive <name>

import { homedir } from "node:os";
import { parseArgs } from "node:util";

import { archiveSpace, createSpace, previewFolder, SpaceError, updateSpace } from "./space-edit.ts";
import { homePath, loadSpaces, real, ROOT } from "./spaces.ts";

const USAGE = `usage: opai spaces <command>

  list                                        every space, its folders and role
  new <name> [--description d] [--path f]...  create a space that claims folders
  edit <name> [--description d] [--add-path f]... [--remove-path f]... [--default]
                                              change it; --default makes it the default space
  archive <name>                              move it to .local/archive/spaces/

A folder belongs to the space with the longest path containing it; folders no
space claims belong to the default space. A change applies from the next session.`;

/** What claiming folders changes, read before the change and said once it is made. */
function explain(name: string, folders: string[]) {
  const lines = folders.flatMap((folder) => {
    const preview = previewFolder(ROOT, name, folder);
    return [
      ...(preview.exists ? [] : [`  ${preview.folder} does not exist yet.`]),
      ...(preview.now && preview.now.space !== name
        ? [`  ${preview.folder} moves from ${preview.now.space} to ${name}.`]
        : []),
      ...preview.inside.map(
        (inside) => `  ${inside.path} stays in ${inside.space}: the longest path wins.`,
      ),
    ];
  });
  return () => {
    for (const line of lines) console.log(line);
  };
}

function main(argv: string[]) {
  const [command, ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      description: { type: "string" },
      path: { type: "string", multiple: true },
      "add-path": { type: "string", multiple: true },
      "remove-path": { type: "string", multiple: true },
      default: { type: "boolean" },
    },
  });
  const [name] = positionals;

  switch (command) {
    case "list": {
      for (const space of loadSpaces(ROOT)) {
        const role = space.base ? "  (base: every session)" : space.default ? "  (default)" : "";
        console.log(`${space.name}${role}`);
        if (space.description) console.log(`  ${space.description}`);
        for (const path of space.paths) console.log(`  ${homePath(path)}`);
      }
      return;
    }
    case "new": {
      if (!name) throw new SpaceError("new <name>");
      const said = explain(name, values.path ?? []);
      createSpace(ROOT, name, { description: values.description, paths: values.path });
      console.log(`Created spaces/${name}/space.yaml. Its rules go in spaces/${name}/AGENTS.md.`);
      said();
      return;
    }
    case "edit": {
      if (!name) throw new SpaceError("edit <name>");
      const space = loadSpaces(ROOT).find((candidate) => candidate.name === name);
      if (!space) throw new SpaceError(`No space named ${name}.`);
      const added = values["add-path"] ?? [];
      const removed = new Set(
        (values["remove-path"] ?? []).map((folder) =>
          real(folder.replace(/^~(?=\/|$)/, homedir()).replace(/\/+$/, "")),
        ),
      );
      const changesFolders = added.length > 0 || removed.size > 0;
      const said = explain(name, added);
      updateSpace(ROOT, name, {
        description: values.description,
        paths: changesFolders
          ? [...space.paths.filter((path) => !removed.has(path)), ...added]
          : undefined,
        makeDefault: values.default,
      });
      console.log(`Updated spaces/${name}/space.yaml.`);
      said();
      return;
    }
    case "archive": {
      if (!name) throw new SpaceError("archive <name>");
      console.log(`Archived ${name} to ${archiveSpace(ROOT, name)}. Move it back to restore it.`);
      return;
    }
    default:
      console.log(USAGE);
      if (command && command !== "help") process.exitCode = 2;
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  if (!(error instanceof SpaceError || (error instanceof Error && error.name === "TypeError")))
    throw error;
  console.error(`opai spaces: ${error.message}`);
  process.exitCode = 1;
}
