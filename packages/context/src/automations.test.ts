import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";

import { Effect } from "effect";

import {
  archiveCodex,
  getCodexFile,
  getRegistry,
  listRegistries,
  parseLaunchctlList,
  parseRemote,
  setCodexStatus,
  updateCodexFile,
  readCodexAutomations,
  readLaunchAgents,
  updateRegistry,
} from "./automations.ts";
import { makeFixture } from "./fixture.ts";

const fixture = makeFixture();
after(fixture.cleanup);
const { root } = fixture;

function write(path: string, text: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

const codex = join(dirname(root), "codex-home");
write(
  join(codex, "automations", "daily-recap", "automation.toml"),
  'id = "daily-recap"\nname = "Daily recap"\nkind = "heartbeat"\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY;BYHOUR=21;BYMINUTE=20"\nprompt = "Write the recap.\\nThen stop."\n',
);
write(
  join(codex, "automations", "old-check", "automation.toml"),
  'id = "old-check"\nname = "Old check"\nkind = "cron"\nstatus = "PAUSED"\nrrule = "DTSTART:20260715T073623Z\\nRRULE:FREQ=HOURLY;INTERVAL=2;UNTIL=20260718T073623Z"\nprompt = ""\n',
);
write(
  join(root, "spaces", "perso", "context", "ops.md"),
  "# Ops\n\n- `daily-recap` writes the recap.\n- `dev.example.sync` syncs.\n",
);

test("finds the registry of each space", () => {
  assert.deepEqual(listRegistries(root), [{ space: "perso", path: "spaces/perso/context/ops.md" }]);
});

test("reads Codex automations, and which ones the registry names", () => {
  const ops = "`daily-recap` writes the recap.";
  const [recap, old] = readCodexAutomations([codex], ops, new Date("2026-11-04T12:00:00Z"));
  assert.equal(recap?.id, "daily-recap");
  assert.equal(recap?.status, "active");
  assert.equal(recap?.summary, "Write the recap.");
  assert.equal(recap?.documented, true);
  assert.equal(old?.status, "paused");
  assert.equal(old?.schedule, "FREQ=HOURLY;INTERVAL=2;UNTIL=20260718T073623Z");
  assert.equal(old?.ended, true);
  assert.equal(old?.documented, false);
});

test("reads launchctl list", () => {
  const states = parseLaunchctlList("PID\tStatus\tLabel\n123\t0\tdev.a\n-\t78\tdev.b\n");
  assert.deepEqual(states.get("dev.a"), { pid: 123, lastExit: 0 });
  assert.deepEqual(states.get("dev.b"), { lastExit: 78 });
});

test(
  "reads launchd agents, hides assignments, and tells apart those of apps",
  { skip: process.platform !== "darwin" },
  () => {
    const folder = join(dirname(root), "LaunchAgents");
    const plist = (label: string, args: string[], extra = "") =>
      `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map((arg) => `<string>${arg}</string>`).join("")}</array>${extra}</dict></plist>\n`;
    write(
      join(folder, "dev.example.sync.plist"),
      plist(
        "dev.example.sync",
        ["/usr/bin/env", "-i", "TOKEN=secret", "/opt/tools/sync.sh"],
        "<key>StartInterval</key><integer>600</integer><key>RunAtLoad</key><true/>",
      ),
    );
    write(
      join(folder, "com.vendor.updater.plist"),
      plist("com.vendor.updater", ["/Applications/Vendor.app/Contents/MacOS/updater"]),
    );
    const [vendor, sync] = readLaunchAgents(
      folder,
      "PID\tStatus\tLabel\n-\t0\tdev.example.sync\n",
      "`dev.example.sync` syncs.",
    );
    assert.equal(sync?.command, "/usr/bin/env -i TOKEN=… /opt/tools/sync.sh");
    assert.doesNotMatch(sync?.command ?? "", /secret/);
    assert.deepEqual(sync?.schedule, { everySeconds: 600, atLoad: true, keepAlive: false });
    assert.deepEqual(sync?.state, { loaded: true, lastExit: 0 });
    assert.equal(sync?.fromApp, false);
    assert.equal(sync?.documented, true);
    assert.equal(vendor?.fromApp, true);
    assert.deepEqual(vendor?.state, { loaded: false });
  },
);

test("edits the registry, and refuses a stale edit", async () => {
  const registry = await Effect.runPromise(getRegistry(root, "perso"));
  assert.deepEqual(
    registry.sections.map((heading) => heading.title),
    ["Ops"],
  );
  await Effect.runPromise(updateRegistry(root, "perso", "# Ops\n\nNothing runs.\n", registry.hash));
  const stale = await Effect.runPromise(
    Effect.flip(updateRegistry(root, "perso", "# Ops\n", registry.hash)),
  );
  assert.equal(stale._tag, "StaleWrite");
  const missing = await Effect.runPromise(Effect.flip(getRegistry(root, "client")));
  assert.equal(missing._tag, "RegistryNotFound");
});

const instanceFile = join(root, "codex", "automations", "nightly", "automation.toml");
write(
  instanceFile,
  'version = 1\nid = "nightly"\nname = "Nightly"\nkind = "cron"\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY"\nprompt = "Build."\nupdated_at = 1\n',
);

test("pauses and resumes a Codex automation of the instance", async () => {
  await Effect.runPromise(setCodexStatus(root, instanceFile, "paused"));
  assert.match(readFileSync(instanceFile, "utf8"), /^status = "PAUSED"$/m);
  assert.doesNotMatch(readFileSync(instanceFile, "utf8"), /^updated_at = 1$/m);
  await Effect.runPromise(setCodexStatus(root, instanceFile, "active"));
  assert.match(readFileSync(instanceFile, "utf8"), /^status = "ACTIVE"$/m);
});

test("refuses a file outside the automation folders", async () => {
  const outside = join(dirname(root), "elsewhere.toml");
  write(outside, 'status = "ACTIVE"\n');
  const error = await Effect.runPromise(Effect.flip(setCodexStatus(root, outside, "paused")));
  assert.equal(error._tag, "AutomationNotFound");
});

test("edits an automation.toml only into a valid one with the same id", async () => {
  const file = await Effect.runPromise(getCodexFile(root, instanceFile));
  assert.equal(file.id, "nightly");
  const invalid = await Effect.runPromise(
    Effect.flip(updateCodexFile(root, instanceFile, "id = ", file.hash)),
  );
  assert.equal(invalid._tag, "AutomationInvalid");
  const renamed = await Effect.runPromise(
    Effect.flip(
      updateCodexFile(root, instanceFile, file.text.replace('"nightly"', '"other"'), file.hash),
    ),
  );
  assert.equal(renamed._tag, "AutomationInvalid");
  const saved = await Effect.runPromise(
    updateCodexFile(
      root,
      instanceFile,
      file.text.replace('"Build."', '"Build and test."'),
      file.hash,
    ),
  );
  assert.match(saved.text, /Build and test/);
});

test("archives a Codex automation into the instance's .local", async () => {
  const target = await Effect.runPromise(archiveCodex(root, instanceFile));
  assert.equal(existsSync(dirname(instanceFile)), false);
  assert.match(target, /\.local\/archive\/codex-automations\/nightly-\d{8}-\d{6}$/);
});

test("reads what the remote script prints", () => {
  const source = parseRemote(
    [
      "@@home /Users/runner",
      "@@codex /Users/runner/.codex/automations/a/automation.toml",
      'id = "a"',
      "",
      "@@plist /Users/runner/Library/LaunchAgents/dev.x.plist",
      '{"Label":"dev.x","ProgramArguments":["/usr/local/bin/x"]}',
      "@@launchctl",
      "PID\tStatus\tLabel",
      "12\t0\tdev.x",
      "",
    ].join("\n"),
  );
  assert.equal(source.home, "/Users/runner");
  assert.equal(source.codex[0]?.text.trim(), 'id = "a"');
  assert.equal(source.plists?.[0]?.data.Label, "dev.x");
  assert.match(source.launchctl, /12\t0\tdev\.x/);
});
