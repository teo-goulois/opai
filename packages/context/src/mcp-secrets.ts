// The secrets of the MCP servers: the ${NAME} their mcp.json holds. They live
// in the instance's Infisical project (.infisical.yaml), folder /mcp, in its
// default environment, next to the sign-ins of mcp-oauth.ts. At launch, opai
// claude and opai codex read from there the ones the session's servers name
// and the environment lacks, and nothing else of the project.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stringify as stringifyYaml } from "yaml";

import { McpError } from "./mcp-servers.ts";

export const SECRETS_FOLDER = "/mcp";
const VARIABLE = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}/g;

/** The variables a server's values name, or those of any value. */
export function variables(value: unknown): string[] {
  const names = [...(JSON.stringify(value) ?? "").matchAll(VARIABLE)].map((match) => match[1]!);
  // HOME locates files; it is never a secret.
  return [...new Set(names)].filter((name) => name !== "HOME");
}

/** The Infisical environment of the instance's project, or undefined without one. */
export function infisicalEnv(root: string): string | undefined {
  const file = join(root, ".infisical.yaml");
  if (!existsSync(file)) return undefined;
  const match = /^\s*default-environment:\s*["']?([\w-]+)/m.exec(readFileSync(file, "utf8"));
  return match?.[1] ?? "dev";
}

function infisical(root: string, args: string[]) {
  const env = infisicalEnv(root);
  if (!env) throw new McpError("the instance has no Infisical project (.infisical.yaml)");
  try {
    // From the instance, so a profile bound to it picks the organization.
    return execFileSync("infisical", [...args, `--env=${env}`, "--silent"], {
      cwd: root,
      encoding: "utf8",
      timeout: 20_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const lines = String((error as { stderr?: unknown }).stderr ?? "")
      .split("\n")
      .map((line) => line.trim());
    // The API's message when there is one; else the last line that says something.
    const reason =
      lines
        .find((line) => line.startsWith("Message:"))
        ?.slice("Message:".length)
        .trim() ??
      lines
        .filter(
          (line) =>
            line &&
            !/^(warning|new release|to update|using profile|if this issue continues)/i.test(line),
        )
        .at(-1);
    throw new McpError(`Infisical: ${reason ?? (error as Error).message}`);
  }
}

/** The secrets of the folder, by name; only `names` when given. */
export function readSecrets(root: string, names?: string[]): Record<string, string> {
  const output = infisical(root, ["export", `--path=${SECRETS_FOLDER}`, "--format=json"]);
  const secrets = JSON.parse(output) as { key: string; value: string }[];
  const wanted = names && new Set(names);
  return Object.fromEntries(
    secrets
      .filter((secret) => !wanted || wanted.has(secret.key))
      .map((secret) => [secret.key, secret.value]),
  );
}

/** Writes secrets into the folder, creating it the first time. Values never go in arguments. */
export function storeSecrets(root: string, values: Record<string, string>) {
  if (Object.keys(values).length === 0) return;
  try {
    infisical(root, ["secrets", "folders", "create", "--name=mcp", "--path=/"]);
  } catch (error) {
    if (!/exist/i.test((error as Error).message)) throw error;
  }
  const folder = mkdtempSync(join(tmpdir(), "opai-secrets-"));
  try {
    const file = join(folder, "secrets.yaml");
    writeFileSync(file, stringifyYaml(values), { mode: 0o600 });
    infisical(root, ["secrets", "set", `--path=${SECRETS_FOLDER}`, `--file=${file}`]);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

/** Removes a secret from the folder. */
export function deleteSecret(root: string, name: string) {
  infisical(root, ["secrets", "delete", name, `--path=${SECRETS_FOLDER}`, "--type=shared"]);
}
