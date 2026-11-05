import type {
  AgentAction,
  Automations,
  CodexAutomation,
  EntryRef,
  LaunchAgent,
  MachineAutomations,
  RegistryEntry,
} from "@opai/context/automations";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

import { launchText, rruleText } from "./schedule";

/** One automation that runs somewhere: a Codex automation or a launchd agent. */
export type Live = { machine: string | undefined } & (
  | { kind: "codex"; codex: CodexAutomation }
  | { kind: "launchd"; agent: LaunchAgent }
);

export const liveKey = (live: Live) =>
  `${live.machine ?? ""}:${live.kind === "codex" ? live.codex.path : live.agent.path}`;

export const liveEntry = (live: Live) =>
  live.kind === "codex" ? live.codex.entry : live.agent.entry;

export const liveDocumented = (live: Live) =>
  live.kind === "codex" ? live.codex.documented : live.agent.documented;

export const sameEntry = (a: EntryRef | undefined, b: EntryRef) =>
  a !== undefined && a.space === b.space && a.id === b.id;

export function findEntry(entries: RegistryEntry[], ref: EntryRef | undefined) {
  return ref ? entries.find((entry) => sameEntry(entry, ref)) : undefined;
}

/** Inline Markdown as plain text, for one line of a list. Starts with a capital. */
export function plain(markdown: string) {
  const text = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A field of an entry, by its label in English. */
export function field(entry: RegistryEntry | undefined, label: string) {
  const found = entry?.fields.find((item) => item.label.toLowerCase() === label.toLowerCase());
  return found ? plain(found.text) : undefined;
}

export type Tone = "ok" | "off" | "error";

export function liveStatus(live: Live): { tone: Tone; label: string } {
  if (live.kind === "codex") {
    if (live.codex.ended) return { tone: "off", label: m.automations_ended() };
    if (live.codex.status === "paused") return { tone: "off", label: m.automations_paused() };
    return { tone: "ok", label: m.automations_active() };
  }
  const state = live.agent.state;
  if (!state.loaded) return { tone: "off", label: m.automations_not_loaded() };
  if (state.pid) return { tone: "ok", label: m.automations_running() };
  if (state.lastExit) {
    return { tone: "error", label: m.automations_failed({ code: state.lastExit }) };
  }
  return { tone: "ok", label: m.automations_idle() };
}

export const liveSchedule = (live: Live) =>
  live.kind === "codex" ? rruleText(live.codex.schedule) : launchText(live.agent.schedule);

/** Its entry's title when it has one: "Postflow tunnel" says more than its label. */
export function liveName(live: Live, entries: RegistryEntry[]) {
  if (live.kind === "codex") return live.codex.name;
  return findEntry(entries, live.agent.entry)?.title ?? live.agent.label;
}

/** A launchd label shown next to its name when its entry also names another agent. */
export function sharedEntries(lives: Live[]) {
  const seen = new Map<string, number>();
  for (const live of lives) {
    const entry = liveEntry(live);
    if (entry)
      seen.set(`${entry.space}:${entry.id}`, (seen.get(`${entry.space}:${entry.id}`) ?? 0) + 1);
  }
  return (live: Live) => {
    const entry = liveEntry(live);
    return (
      live.kind === "launchd" &&
      entry !== undefined &&
      (seen.get(`${entry.space}:${entry.id}`) ?? 0) > 1
    );
  };
}

/** What it does: its entry's What, else the prompt's first line or the command. */
export function liveWhat(live: Live, entries: RegistryEntry[]) {
  const what = field(findEntry(entries, liveEntry(live)), "What");
  if (what) return what;
  return live.kind === "codex" ? live.codex.summary : live.agent.command;
}

/** "Codex app" or "launchd", and the machine: "This Mac" or its name. */
export function liveWhere(live: Live) {
  return m.automations_runs_on({
    runner: live.kind === "codex" ? m.automations_codex() : m.automations_launchd(),
    machine: live.machine ?? m.automations_this_machine(),
  });
}

/** The automations of a machine, yours apart from those apps installed. */
export function machineLives(automations: MachineAutomations, machine: string | undefined) {
  const launchd = automations.launchd ?? [];
  return {
    codex: automations.codex.map((codex): Live => ({ machine, kind: "codex", codex })),
    launchd: launchd
      .filter((agent) => !agent.fromApp)
      .map((agent): Live => ({ machine, kind: "launchd", agent })),
    apps: launchd
      .filter((agent) => agent.fromApp)
      .map((agent): Live => ({ machine, kind: "launchd", agent })),
  };
}

export type Machine = {
  /** Undefined for this Mac. */
  name: string | undefined;
  automations: MachineAutomations | undefined;
  error: Error | null;
};

/** This Mac, then each machine of machines.json, read through SSH (a few seconds each). */
export function useMachines(automations: Automations): Machine[] {
  const remote = useQueries({
    queries: automations.machines.map((name) =>
      orpc.automations.machine.queryOptions({
        input: { name },
        staleTime: 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      }),
    ),
  });
  return [
    { name: undefined, automations, error: null },
    ...automations.machines.map((name, index) => ({
      name,
      automations: remote[index]?.data,
      error: remote[index]?.error ?? null,
    })),
  ];
}

/** Every automation of every machine read so far, apps' agents left out. */
export function allLives(machines: Machine[]) {
  return machines.flatMap((machine) => {
    if (!machine.automations) return [];
    const lives = machineLives(machine.automations, machine.name);
    return [...lives.codex, ...lives.launchd];
  });
}

/** What the page can do to an automation of this machine. */
export type AutomationActions = {
  setStatus: (path: string, status: CodexAutomation["status"]) => void;
  archive: (path: string) => void;
  agent: (label: string, action: AgentAction) => void;
  /** The automation an action is running on: its path or label. */
  pending: string | undefined;
  error: string | undefined;
};

export function useAutomationActions(): AutomationActions {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  const options = {
    onSettled: () => {
      setPending(undefined);
      void queryClient.invalidateQueries({ queryKey: orpc.automations.list.key() });
    },
    onError: (failure: Error) => setError(failure.message),
  };
  const status = useMutation(orpc.automations.codexStatus.mutationOptions(options));
  const archive = useMutation(orpc.automations.archiveCodex.mutationOptions(options));
  const agent = useMutation(orpc.automations.agent.mutationOptions(options));
  const start = (target: string) => {
    setError(undefined);
    setPending(target);
  };
  return {
    setStatus: (path, next) => {
      start(path);
      status.mutate({ path, status: next });
    },
    archive: (path) => {
      start(path);
      archive.mutate({ path });
    },
    agent: (label, action) => {
      start(label);
      agent.mutate({ label, action });
    },
    pending,
    error,
  };
}
