import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { launchSecrets, readSecrets, storeSecrets, variables } from "./mcp-secrets.ts";

// A fake infisical on the PATH: `export` prints a JSON store, `secrets set`
// copies the file it is given, the arguments are logged.
const base = mkdtempSync(join(tmpdir(), "opai-secrets-"));
const root = join(base, "root");
const bin = join(base, "bin");
mkdirSync(root);
mkdirSync(bin);
writeFileSync(
  join(root, ".infisical.yaml"),
  "secrets-management:\n    default-environment: prod\n",
);
writeFileSync(
  join(bin, "infisical"),
  `#!/bin/sh
echo "$@" >> "${base}/calls"
case "$1 $2" in
  "export "*) echo '[{"key":"API_TOKEN","value":"t0k"},{"key":"OTHER","value":"x"}]' ;;
  "secrets set") for arg in "$@"; do case "$arg" in --file=*) cp "\${arg#--file=}" "${base}/stored" ;; esac; done ;;
esac
`,
);
chmodSync(join(bin, "infisical"), 0o755);
const path = process.env.PATH;
process.env.PATH = `${bin}:${path}`;
after(() => {
  process.env.PATH = path;
  rmSync(base, { recursive: true, force: true });
});

test("the variables a server names, HOME left out", () => {
  assert.deepEqual(
    variables({
      command: "${HOME}/x",
      env: { A: "${A}", B: "${B:-b}" },
      headers: { Authorization: "Bearer ${A}" },
    }),
    ["A", "B"],
  );
});

test("a launch reads only the missing secrets, from the folder and environment of the project", () => {
  const servers = [{ url: "https://x", headers: { Authorization: "Bearer ${API_TOKEN}" } }];
  assert.deepEqual(launchSecrets(root, servers, {}), { API_TOKEN: "t0k" });
  assert.deepEqual(launchSecrets(root, servers, { API_TOKEN: "set" }), {});
  const calls = readFileSync(join(base, "calls"), "utf8");
  assert.match(calls, /export --path=\/mcp --format=json --env=prod --silent/);
  assert.deepEqual(readSecrets(root), { API_TOKEN: "t0k", OTHER: "x" });
});

test("storing writes a file, never the value in the arguments", () => {
  storeSecrets(root, { NEW_TOKEN: "s3cret value" });
  assert.equal(readFileSync(join(base, "stored"), "utf8"), "NEW_TOKEN: s3cret value\n");
  assert.ok(!readFileSync(join(base, "calls"), "utf8").includes("s3cret"));
});

test("without an Infisical project or with a failing CLI, a launch goes on", () => {
  const plain = join(base, "plain");
  mkdirSync(plain);
  assert.deepEqual(launchSecrets(plain, [{ url: "https://x", headers: { H: "${Y}" } }], {}), {});
  writeFileSync(join(bin, "infisical"), "#!/bin/sh\necho 'Error: not logged in' >&2\nexit 1\n");
  const warnings: string[] = [];
  const result = launchSecrets(root, [{ url: "https://x", headers: { H: "${Y}" } }], {}, (w) =>
    warnings.push(w),
  );
  assert.deepEqual(result, {});
  assert.match(warnings[0]!, /not logged in/);
});
