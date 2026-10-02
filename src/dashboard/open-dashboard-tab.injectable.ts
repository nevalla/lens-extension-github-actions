import { getTabKind } from "@k8slens/tab-contracts";
import { getOpenClusterTabInjectable } from "../cluster/get-open-cluster-tab-injectable";

// One tab per cluster: its id is the cluster's id. Apart from the tab itself, so what opens it, such as a
// notification, does not depend on everything the tab renders.
export const dashboardTabKind = getTabKind()("github-actions-dashboard");

export const openDashboardTabInjectable = getOpenClusterTabInjectable(
  "github-actions-open-dashboard-tab",
  dashboardTabKind,
);
