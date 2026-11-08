import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { codexServer } from "./mcp-servers.ts";
import { forgetNeedsAuth, prepareLaunch } from "./mcp-oauth.ts";
import { umamiEnv } from "./analytics/umami.ts";
import { readSecrets, storeSecrets, variables } from "./mcp-secrets.ts";

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
  "export "*) cat "${base}/store" ;;
  "secrets folders") printf 'Response Code: 400 Bad Request\nMessage: Folder with name mcp already exists in path /\nIf this issue continues, get support at https://infisical.com/slack\n' >&2; exit 1 ;;
  "secrets set") for arg in "$@"; do case "$arg" in --file=*) cp "\${arg#--file=}" "${base}/stored" ;; esac; done ;;
esac
`,
);
chmodSync(join(bin, "infisical"), 0o755);
const signIn = {
  name: "docs",
  url: "https://docs.example/mcp",
  issuer: "https://auth.example",
  tokenEndpoint: "https://auth.example/token",
  clientId: "c",
  authMethod: "none",
  accessToken: "a",
  signedInAt: 0,
  refreshedAt: 0,
  by: "laptop",
};
writeFileSync(
  join(base, "store"),
  JSON.stringify([
    { key: "API_TOKEN", value: "t0k" },
    { key: "OTHER", value: "x" },
    { key: "OAUTH_DOCS", value: JSON.stringify(signIn) },
    { key: "UMAMI_ADMIN_API_KEY", value: "umami" },
  ]),
);
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
  const servers = { x: { url: "https://x", headers: { Authorization: "Bearer ${API_TOKEN}" } } };
  assert.deepEqual(prepareLaunch(root, servers, {}).secrets, { API_TOKEN: "t0k" });
  assert.deepEqual(prepareLaunch(root, servers, { API_TOKEN: "set" }).secrets, {});
  const calls = readFileSync(join(base, "calls"), "utf8");
  assert.match(calls, /export --path=\/mcp --format=json --env=prod --silent/);
  assert.equal(readSecrets(root).API_TOKEN, "t0k");
});

test("a server Opai signed in to gets the helper, for Claude Code and Codex", () => {
  const { servers } = prepareLaunch(
    root,
    {
      docs: { url: "https://docs.example/mcp" },
      moved: { url: "https://elsewhere.example/mcp" },
      own: { url: "https://docs.example/mcp", headers: { Authorization: "Bearer ${API_TOKEN}" } },
    },
    { API_TOKEN: "set" },
  );
  assert.match(servers.docs!.headersHelper!, /mcp-cli\.ts' token 'docs'$/);
  assert.match(servers.docs!.headersHelper!, /^OPAI_HOME=/);
  // Another URL under the name, or a server with its own token, keeps its own sign-in.
  assert.equal(servers.moved!.headersHelper, undefined);
  assert.equal(servers.own!.headersHelper, undefined);
  assert.equal(codexServer(servers.docs!)!.http_headers_helper, servers.docs!.headersHelper);
});

test("storing writes a file, never the value in the arguments, into the folder that exists", () => {
  storeSecrets(root, { NEW_TOKEN: "s3cret value" });
  assert.equal(readFileSync(join(base, "stored"), "utf8"), "NEW_TOKEN: s3cret value\n");
  assert.ok(!readFileSync(join(base, "calls"), "utf8").includes("s3cret"));
});

test("the Umami keys the server lacks come from the root folder, and only them", () => {
  const { env } = umamiEnv(root, { UMAMI_URL: "https://umami.example" });
  assert.equal(env.UMAMI_ADMIN_API_KEY, "umami");
  assert.equal(env.UMAMI_URL, "https://umami.example");
  assert.equal(env.API_TOKEN, undefined);
  assert.match(
    readFileSync(join(base, "calls"), "utf8"),
    /export --path=\/ --format=json --env=prod/,
  );
  // The environment wins over Infisical.
  assert.equal(umamiEnv(root, { UMAMI_ADMIN_API_KEY: "mine" }).env.UMAMI_ADMIN_API_KEY, "mine");
});

test("without an Infisical project or with a failing CLI, a launch goes on", () => {
  const plain = join(base, "plain");
  mkdirSync(plain);
  const servers = { x: { url: "https://x", headers: { H: "${Y}" } } };
  assert.deepEqual(prepareLaunch(plain, servers, {}).secrets, {});
  writeFileSync(join(bin, "infisical"), "#!/bin/sh\necho 'Error: not logged in' >&2\nexit 1\n");
  const warnings: string[] = [];
  const result = prepareLaunch(root, servers, {}, (warning) => warnings.push(warning));
  // The sign-ins are unknown, not none: the tools' configs are left as they are.
  assert.deepEqual(result, { secrets: {}, servers, signedIn: undefined });
  assert.match(warnings[0]!, /not logged in/);
});

test("signed out of Infisical, the Umami keys say why they are missing", () => {
  const other = join(base, "other");
  mkdirSync(other);
  writeFileSync(
    join(other, ".infisical.yaml"),
    "secrets-management:\n    default-environment: prod\n",
  );
  writeFileSync(
    join(bin, "infisical"),
    "#!/bin/sh\necho 'error: no logged in details, try running [infisical login]' >&2\necho 'Unable to fetch secrets' >&2\nexit 1\n",
  );
  const { env, infisical } = umamiEnv(other, {});
  assert.equal(env.UMAMI_ADMIN_API_KEY, undefined);
  assert.match(infisical!, /^Infisical: no logged in details/);
});

test("a server Opai signed in to leaves Claude Code's needs-auth cache", () => {
  const home = join(base, "home");
  const files = [join(root, "claude"), join(home, ".claude")].map((folder) => {
    mkdirSync(folder, { recursive: true });
    const file = join(folder, "mcp-needs-auth-cache.json");
    writeFileSync(file, JSON.stringify({ docs: { timestamp: 1 }, other: { timestamp: 2 } }));
    return file;
  });
  forgetNeedsAuth(root, ["docs"], home);
  for (const file of files) {
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { other: { timestamp: 2 } });
  }
});
