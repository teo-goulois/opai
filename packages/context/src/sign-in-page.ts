// The page the browser shows when it comes back from a server's sign-in to
// mcp-oauth.ts: the logo, whether it worked, and what the sign-in serves. In
// the colors of the app, light or dark like the system, in French when the
// browser asks for it.

import { logoSvg } from "./brand.ts";

const TEXT = {
  en: {
    connected: (server: string) => `Connected to ${server}`,
    shared: "Claude Code, Codex and your other machines use this sign-in.",
    close: "You can close this tab.",
    failed: (server: string) => `The sign-in to ${server} failed`,
    retry: "Try again from the MCP page of Opai.",
  },
  fr: {
    connected: (server: string) => `Connecté à ${server}`,
    shared: "Claude Code, Codex et tes autres machines utilisent cette connexion.",
    close: "Tu peux fermer cet onglet.",
    failed: (server: string) => `La connexion à ${server} a échoué`,
    retry: "Réessaie depuis la page MCP d’Opai.",
  },
};

const escape = (text: string) =>
  text.replace(
    /[&<>"]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!,
  );

const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const CROSS =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';

/** The page, for a browser whose Accept-Language is `languages`. */
export function signInPage(options: {
  ok: boolean;
  server: string;
  error?: string | undefined;
  languages?: string | undefined;
}) {
  const lang = /^fr\b/i.test(options.languages ?? "") ? "fr" : "en";
  const text = TEXT[lang];
  const server = escape(options.server);
  const title = options.ok ? text.connected(server) : text.failed(server);
  const body = options.ok
    ? `<p>${text.shared}</p><p class="quiet">${text.close}</p>`
    : `<p class="error">${escape(options.error ?? "")}</p><p class="quiet">${text.retry}</p>`;
  return `<!doctype html>
<html lang="${lang}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Opai</title>
<style>
  :root {
    color-scheme: light dark;
    --page: #fafafa; --card: #ffffff; --line: #dedede;
    --text: #000000; --muted: #6c6c6c;
    --ok: #76ef6b33; --bad: #ff526333; --bad-text: #c4001a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --page: #000000; --card: #141414; --line: #383838;
      --text: #ffffff; --muted: #a3a3a3; --bad-text: #ff8a95;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
    background: var(--page); color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main {
    width: 100%; max-width: 420px; padding: 40px 32px; text-align: center;
    background: var(--card); border: 1px solid var(--line); border-radius: 16px;
  }
  .logo { display: block; height: 36px; width: auto; margin: 0 auto 32px; }
  .mark {
    width: 44px; height: 44px; margin: 0 auto 16px; border-radius: 50%;
    display: grid; place-items: center; background: var(--ok);
  }
  .mark.bad { background: var(--bad); }
  .mark svg { width: 22px; height: 22px; }
  h1 { margin: 0 0 8px; font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; color: var(--muted); }
  p + p { margin-top: 12px; }
  .quiet { font-size: 13px; }
  .error { color: var(--bad-text); overflow-wrap: anywhere; }
</style>
<main>
  ${logoSvg('class="logo" role="img" aria-label="Opai"')}
  <div class="mark${options.ok ? "" : " bad"}">${options.ok ? CHECK : CROSS}</div>
  <h1>${title}</h1>
  ${body}
</main>
${options.ok ? "<script>setTimeout(() => window.close(), 2500)</script>" : ""}
</html>
`;
}
