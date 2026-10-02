import { clusterNavigatorItemKind } from "@k8slens/cluster-contracts";
import { GitHubIcon } from "@k8slens/icon";
import { useInject } from "@k8slens/use-inject";
import { NavigatorItemIcon, NavigatorItemLabel, NavigatorLeafIndicator } from "@k8slens/navigator-components";
import {
  getNavigatorItemKind,
  getNavigatorItemKindInjectableBunch,
  type NavigatorItemProps,
} from "@k8slens/navigator-contracts";
import { computed } from "mobx";
import { openDashboardTabInjectable } from "../dashboard/dashboard-tab.injectable";

interface GithubActionsItem {
  readonly id: string;
  readonly name: string;
}

export const githubActionsNavigatorItemKind = getNavigatorItemKind<GithubActionsItem, [clusterId: string]>()(
  "github-actions",
);

// A leaf: what is watched is on the dashboard it opens, not under it.
const GithubActionsRow = ({ ids, item }: NavigatorItemProps<GithubActionsItem, typeof clusterNavigatorItemKind>) => {
  const openTab = useInject(openDashboardTabInjectable)();
  const [clusterId] = ids;

  return (
    <>
      <NavigatorLeafIndicator />
      <NavigatorItemIcon>
        {/* The mark is a filled disc, so at the slot's full size it reads heavier than the glyphs beside it. */}
        <GitHubIcon $size="s" />
      </NavigatorItemIcon>
      <NavigatorItemLabel onClick={() => void openTab(clusterId)}>{item.name}</NavigatorItemLabel>
    </>
  );
};

export const githubActionsNavigatorItemBunch = getNavigatorItemKindInjectableBunch({
  kind: githubActionsNavigatorItemKind,
  parentKind: clusterNavigatorItemKind,
  description: "The GitHub Actions dashboard of a cluster.",

  items: {
    instantiate: () => async () =>
      computed((): GithubActionsItem[] => [{ id: "github-actions", name: "GitHub Actions" }]),
  },

  Component: GithubActionsRow,
});
