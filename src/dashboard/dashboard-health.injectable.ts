import { getInjectable2 } from "@k8slens/injectable";
import { computed } from "mobx";
import { watchedRepositoriesStoreInjectable } from "../watched-repositories/watched-repositories-store.injectable";
import { overallStatusOf } from "../workflow-runs/run-status";
import { followedLabelOf, watchKeyOf } from "../watched-repositories/watched-repository";
import { serviceLookOf } from "./flux-stage";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";

export interface DashboardHealth {
  readonly state: "checking" | "unreachable" | "failing" | "deploying" | "behind" | "up-to-date" | "nothing-deployed";
  readonly message: string;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** One line on how what is watched stands in a cluster, most pressing first. */
export const dashboardHealthInjectable = getInjectable2({
  id: "github-actions-dashboard-health",

  instantiate: (di) => {
    const storeOf = di.inject(watchedRepositoriesStoreInjectable);
    const watchOnCluster = di.inject(watchOnClusterInjectable);

    return (clusterId: string) =>
      computed((): DashboardHealth => {
        const watches = (storeOf(clusterId).all ?? []).map((watch) => ({
          watch,
          state: watchOnCluster(clusterId, watchKeyOf(watch)),
        }));

        const unreadable = watches.find(({ state }) => state.cluster.status === "failed")?.state.cluster;

        if (unreadable?.status === "failed")
          return {
            state: "unreachable",
            message: `Could not read what this cluster runs: ${unreadable.message}. Trying again.`,
          };

        // GitHub not answering leaves no summary, which is not "still checking": it would say so forever.
        const unfetched = watches.find(({ state }) => state.activity.status === "failed");

        if (unfetched?.state.activity.status === "failed")
          return {
            state: "unreachable",
            message: `Could not read ${unfetched.watch.repository} from GitHub: ${unfetched.state.activity.message}. Trying again.`,
          };

        if (watches.some(({ state }) => !state.summary))
          return { state: "checking", message: "Checking GitHub and the cluster…" };

        const failing = watches.filter(({ state }) => {
          const head = state.rows[0];

          return head && head.runs.length > 0 && overallStatusOf(head.runs).color === "critical";
        });

        if (failing.length > 0)
          return {
            state: "failing",
            message: `CI fails on the latest version of ${failing.map(({ watch }) => `${watch.repository} ${followedLabelOf(watch)}`).join(", ")}.`,
          };

        const services = watches.flatMap(({ state }) => state.summary?.services ?? []);
        // The same reading of a service as its row in the table, so the two never disagree.
        const fluxFailing = services.filter((service) => serviceLookOf(service) === "failed");

        const syncs = watches.flatMap(({ state }) => state.summary?.syncs ?? []);
        const syncsFailing = syncs.filter((sync) => sync.pending?.stage === "failed");

        if (fluxFailing.length > 0 || syncsFailing.length > 0)
          return {
            state: "failing",
            message: `Flux fails to apply ${[
              ...fluxFailing.map((service) => service.name),
              ...syncsFailing.map((sync) => `Kustomization ${sync.kustomization.name}`),
            ].join(", ")}.`,
          };

        if (services.length === 0 && syncs.length === 0)
          return {
            state: "nothing-deployed",
            message: "Nothing in this cluster runs a build of what is watched.",
          };

        const deploying = services.filter((service) => serviceLookOf(service) === "progressing");

        const syncsDeploying = syncs.filter((sync) => sync.pending);

        if (deploying.length > 0)
          return {
            state: "deploying",
            message: `${plural(deploying.length, "service is", "services are")} rolling out, upgrading a chart, or picked up by Flux.`,
          };

        if (syncsDeploying.length > 0)
          return {
            state: "deploying",
            message: `Flux is applying a newer commit with ${plural(syncsDeploying.length, "Kustomization", "Kustomizations")}.`,
          };

        const behind = services.filter((service) => (service.running?.behind ?? 0) > 0);
        const syncsBehind = syncs.filter((sync) => (sync.applied?.behind ?? 0) > 0);

        if (behind.length > 0)
          return {
            state: "behind",
            message: `${behind.length} of ${plural(services.length, "service runs", "services run")} an older version than the latest.`,
          };

        if (syncsBehind.length > 0)
          return {
            state: "behind",
            message: `${syncsBehind.length} of ${plural(syncs.length, "Kustomization has", "Kustomizations have")} applied an older commit than the latest.`,
          };

        return {
          state: "up-to-date",
          message:
            services.length > 0 ? "Every service runs the latest version." : "Flux has applied the latest commit.",
        };
      });
  },
});
