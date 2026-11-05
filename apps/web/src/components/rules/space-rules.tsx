import type { SpaceConfig } from "@opai/context/space-view";
import {
  ItemDescription,
  ItemEnd,
  ItemList,
  ItemMain,
  ItemRow,
  ItemTitle,
} from "@opai/ui/components/ui/item-list";
import { PageSection, PageSectionTitle } from "@opai/ui/components/ui/page-header";
import { Switch } from "@opai/ui/components/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { effectiveRules, useSpaceData, type EffectiveRule } from "@/components/spaces/space-data";
import { Hint, SpaceHeader } from "@/components/spaces/space-ui";
import { m } from "@/paraglide/messages.js";
import { orpc } from "@/utils/orpc";

/** Turns a module of the base space on or off in a space. */
export function useSetModule() {
  const queryClient = useQueryClient();
  return useMutation(
    orpc.spaces.setModule.mutationOptions({
      onSuccess: (space) => {
        queryClient.setQueryData(orpc.spaces.get.queryKey({ input: { name: space.name } }), space);
        void queryClient.invalidateQueries({ queryKey: orpc.spaces.key() });
      },
    }),
  );
}

/** A switch for one module in one space. */
export function ModuleSwitch({
  space,
  module,
  label,
}: {
  space: SpaceConfig;
  module: string;
  label: string;
}) {
  const setModule = useSetModule();
  const enabled = setModule.isPending
    ? (setModule.variables?.enabled ?? !space.disable.includes(module))
    : !space.disable.includes(module);
  return (
    <Switch
      aria-label={label}
      checked={enabled}
      disabled={setModule.isPending}
      onCheckedChange={(checked) =>
        setModule.mutate({ name: space.name, module, enabled: checked })
      }
    />
  );
}

/** The rules tab: the space's own rule files, then what it gets from the base space. */
export function SpaceRules({ name }: { name: string }) {
  const { space, spaces, rules, ownSkills } = useSpaceData(name);
  const all = effectiveRules(space, spaces, rules);
  const own = all.filter((rule) => !rule.inherited);
  const inherited = all.filter((rule) => rule.inherited);
  const base = spaces.find((item) => item.base);
  const others = spaces.filter((item) => !item.base);

  return (
    <div className="flex flex-col gap-xl">
      <SpaceHeader space={space} skills={ownSkills.length} />

      <PageSection aria-labelledby="rules-own">
        <PageSectionTitle id="rules-own" count={own.length || undefined}>
          {space.base ? m.rules_scope_global() : m.rules_own({ space: name })}
        </PageSectionTitle>
        {own.length > 0 ? (
          <ItemList>
            {own.map((rule) => (
              <li key={rule.id}>
                <RuleItem rule={rule}>
                  {space.base && rule.module ? (
                    <span>
                      {m.rule_module_active_count({
                        count: others.filter((item) => !item.disable.includes(rule.module!)).length,
                        total: others.length,
                      })}
                    </span>
                  ) : null}
                </RuleItem>
              </li>
            ))}
          </ItemList>
        ) : (
          <Hint>{m.space_rules_none({ path: `spaces/${name}/AGENTS.md` })}</Hint>
        )}
      </PageSection>

      {inherited.length > 0 && base ? (
        <PageSection aria-labelledby="rules-inherited">
          <div className="flex flex-col gap-xxs">
            <PageSectionTitle id="rules-inherited" count={inherited.length}>
              {m.rules_inherited({ space: base.name })}
            </PageSectionTitle>
            <Hint>{m.rules_inherited_hint()}</Hint>
          </div>
          <ItemList>
            {inherited.map((rule) => (
              <li key={rule.id}>
                <RuleItem rule={rule}>
                  {rule.module ? (
                    <ModuleSwitch
                      space={space}
                      module={rule.module}
                      label={m.rule_module_in({ module: rule.title, space: name })}
                    />
                  ) : (
                    <span>{m.rule_always()}</span>
                  )}
                </RuleItem>
              </li>
            ))}
          </ItemList>
        </PageSection>
      ) : null}
    </div>
  );
}

function RuleItem({ rule, children }: { rule: EffectiveRule; children?: ReactNode }) {
  return (
    <ItemRow className="gap-m">
      <Link
        to="/spaces/$name/rules/$id"
        params={{ name: rule.space ?? "", id: rule.id }}
        className="-my-xs -ms-s flex min-w-0 flex-1 rounded-s py-xs ps-s outline-none transition-colors hover:bg-neutral-3 focus-visible:focus-ring"
      >
        <ItemMain>
          <ItemTitle>{rule.title}</ItemTitle>
          <ItemDescription>
            {rule.summary || rule.sections.map((section) => section.title).join(" · ")}
          </ItemDescription>
        </ItemMain>
      </Link>
      <ItemEnd>{children}</ItemEnd>
    </ItemRow>
  );
}
