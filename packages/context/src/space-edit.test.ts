import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";

import { makeFixture } from "./fixture.ts";
import { archiveSpace, createSpace, previewFolder, SpaceError, updateSpace } from "./space-edit.ts";
import { loadSpaces, which } from "./spaces.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const { root, work } = fixture;

const yaml = (name: string) => readFileSync(join(root, "spaces", name, "space.yaml"), "utf8");
const spaceOf = (folder: string) => which(root, folder)?.space.name;

test("creates a space that claims its folders from the next session", () => {
  const folder = join(work, "lab");
  mkdirSync(folder, { recursive: true });
  const space = createSpace(root, "lab", {
    description: "Experiments: anything goes",
    paths: [`${folder}/`],
  });
  assert.equal(space.name, "lab");
  assert.equal(
    yaml("lab"),
    `name: lab\ndescription: "Experiments: anything goes"\npaths:\n  - ${folder}\n`,
  );
  assert.equal(
    loadSpaces(root).find((s) => s.name === "lab")?.description,
    "Experiments: anything goes",
  );
  assert.equal(spaceOf(join(folder, "x")), "lab");
});

test("refuses a bad name, an existing space, a relative folder or one claimed elsewhere", () => {
  const refused = (work: () => unknown, message: RegExp) =>
    assert.throws(work, (error) => error instanceof SpaceError && message.test(error.message));
  refused(() => createSpace(root, "Lab"), /lowercase/);
  refused(() => createSpace(root, "lab"), /already exists/);
  refused(() => createSpace(root, "rel", { paths: ["code/x"] }), /starts with \/ or ~\//);
  refused(
    () => createSpace(root, "twin", { paths: [join(work, "client")] }),
    /already a folder of client/,
  );
  assert.equal(existsSync(join(root, "spaces", "twin")), false);
});

test("changes the description and the folders, keeping the other lines", () => {
  const file = join(root, "spaces", "client", "space.yaml");
  writeFileSync(file, `${yaml("client")}# kept\ndisable:\n  - handbook\n`);
  const other = join(work, "client-two");
  updateSpace(root, "client", {
    description: "The client's work",
    paths: [join(work, "client"), other],
  });
  assert.equal(
    yaml("client"),
    [
      "name: client",
      `description: "The client's work"`,
      "paths:",
      `  - ${join(work, "client")}`,
      `  - ${other}`,
      "# kept",
      "disable:",
      "  - handbook",
      "",
    ].join("\n"),
  );
  updateSpace(root, "client", { description: "", paths: [join(work, "client")] });
  assert.doesNotMatch(yaml("client"), /description|client-two/);
  assert.throws(() => updateSpace(root, "global", { paths: [work] }), /base space/);
});

test("makes another space the default one", () => {
  updateSpace(root, "lab", { makeDefault: true });
  assert.deepEqual(
    loadSpaces(root)
      .filter((space) => space.default)
      .map((space) => space.name),
    ["lab"],
  );
  assert.doesNotMatch(yaml("perso"), /default/);
  assert.equal(spaceOf(fixture.outside), "lab");
  updateSpace(root, "perso", { makeDefault: true });
  assert.equal(spaceOf(fixture.outside), "perso");
});

test("previews what claiming a folder changes", () => {
  const preview = previewFolder(root, "lab", join(work, "client"));
  assert.equal(preview.taken, "client");
  assert.deepEqual(preview.now, { space: "client", path: join(work, "client") });
  assert.deepEqual(preview.inside, [{ space: "billing", path: join(work, "client", "billing") }]);
  const parent = previewFolder(root, "lab", work);
  assert.equal(parent.taken, undefined);
  assert.equal(parent.now?.space, "perso");
  assert.equal(parent.now?.path, undefined);
  assert.equal(previewFolder(root, "lab", join(work, "nowhere")).exists, false);
});

test("archives a space, never the base or the default one", () => {
  assert.throws(() => archiveSpace(root, "global"), /base space/);
  assert.throws(() => archiveSpace(root, "perso"), /default space/);
  const target = archiveSpace(root, "lab");
  assert.match(target, /\.local\/archive\/spaces\/lab-\d{8}-\d{6}$/);
  assert.equal(existsSync(join(root, "spaces", "lab")), false);
  assert.equal(spaceOf(join(work, "lab")), "perso");
  assert.throws(() => archiveSpace(root, "lab"), /No space named lab/);
});
