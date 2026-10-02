import { connectClusterInjectionToken } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import {
  appsV1,
  daemonSetKind,
  deploymentKind,
  kubeResourcesInjectionToken,
  statefulSetKind,
} from "@k8slens/kubernetes-contracts";
import type { Subscribable } from "@k8slens/subscribable";
import { computed, type IComputedValue, observable, runInAction } from "mobx";
import {
  type ClusterImages,
  type FluxResource,
  fluxOwnerOf,
  type GitSource,
  type HelmChart,
  fluxStateOf,
  type ImageAutomation,
  type ImageSelection,
  type Workload,
} from "./cluster-images";
import {
  commitOfRevision,
  gitRepositoryKind,
  githubRepositoryOfUrl,
  helmChartKind,
  helmReleaseKind,
  helmToolkitV2,
  helmToolkitV2beta2,
  imagePolicyKind,
  imageToolkitV1,
  imageToolkitV1beta2,
  imageUpdateAutomationKind,
  kustomizationKind,
  kustomizeToolkitV1,
  selectedImageOf,
  sourceToolkitV1,
  sourceToolkitV1beta2,
} from "./flux-kinds";

export type ClusterImagesState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly images: ClusterImages }
  | { readonly status: "failed"; readonly message: string };

type Source<T> = IComputedValue<readonly T[]>;

interface Template {
  metadata?: { labels?: Record<string, string> };
  spec?: { containers?: { image?: string }[]; initContainers?: { image?: string }[] };
}

const imagesOf = (template?: Template) =>
  [...(template?.spec?.containers ?? []), ...(template?.spec?.initContainers ?? [])].flatMap((container) =>
    container.image ? [container.image] : [],
  );

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const none = <T>() => computed((): readonly T[] => []);

/** How long after failing to read the cluster it is tried again, while something still watches. */
export const clusterRetrySeconds = 30;

/** What a cluster runs and how Flux is getting it there, kept current for as long as something watches it. */
export const clusterImagesInjectable = getInjectable2({
  id: "github-actions-cluster-images",
  consumptions: [connectClusterInjectionToken, kubeResourcesInjectionToken],

  instantiate: (di) => {
    const connectCluster = di.inject(connectClusterInjectionToken);
    const kubeResources = di.inject(kubeResourcesInjectionToken)();

    return (clusterId: string) => {
      const sources = observable.box<
        | {
            workloads: Source<Workload>[];
            imageSelections: Source<ImageSelection>;
            fluxResources: Source<FluxResource>[];
            imageAutomations: Source<ImageAutomation>;
            helmCharts: Source<HelmChart>;
            gitSources: Source<GitSource>;
          }
        | undefined
      >(undefined, { deep: false });
      const failure = observable.box<string | undefined>(undefined);
      let disposers: (() => void)[] = [];
      let watchers = 0;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      // Tells a start still connecting apart from the watch it was started for, once that has stopped.
      let generation = 0;

      const follow = async <T, R>(
        subscribable: Subscribable<readonly T[]>,
        toItems: (resource: T) => R[],
      ): Promise<Source<R>> => {
        const startedFor = generation;
        const subscription = subscribable.subscribe();

        subscription.claim();
        if (startedFor === generation) disposers.push(subscription.dispose);
        else subscription.dispose();

        const resources = await subscription.value;

        return computed(() => resources.get().flatMap(toItems));
      };

      /** Follows the first version the cluster serves; none when Flux's part is not installed. */
      const followOptional = <R>(...attempts: (() => Promise<Source<R>>)[]) =>
        attempts
          .reduce((previous, attempt) => previous.catch(attempt), Promise.reject<Source<R>>(new Error("not served")))
          .catch(() => none<R>());

      const workloadOf =
        (kind: Workload["kind"], rolledOutOf: (resource: any) => boolean) =>
        (resource: {
          metadata: { namespace: string; name: string; labels?: Record<string, string> };
          spec: { template?: Template };
        }): Workload[] => [
          {
            kind,
            namespace: resource.metadata.namespace,
            name: resource.metadata.name,
            images: imagesOf(resource.spec.template),
            rolledOut: rolledOutOf(resource),
            owner: fluxOwnerOf({ ...resource.spec.template?.metadata?.labels, ...resource.metadata.labels }),
          },
        ];

      const fluxResourceOf =
        (kind: FluxResource["kind"], apiVersion: FluxResource["apiVersion"]) =>
        (resource: {
          metadata: { namespace: string; name: string };
          spec?: { sourceRef?: { kind: string; name: string; namespace?: string } };
          status?: {
            conditions?: readonly any[];
            lastAppliedRevision?: string;
            lastAttemptedRevision?: string;
            helmChart?: string;
            history?: readonly { chartVersion?: string; status?: string }[];
          };
        }): FluxResource[] => {
          const status = resource.status ?? {};

          return [
            {
              kind,
              apiVersion,
              namespace: resource.metadata.namespace,
              name: resource.metadata.name,
              ...fluxStateOf(status.conditions),
              revision: status.lastAppliedRevision ?? status.lastAttemptedRevision,
              sourceRef:
                kind === "Kustomization" && resource.spec?.sourceRef
                  ? {
                      kind: resource.spec.sourceRef.kind,
                      name: resource.spec.sourceRef.name,
                      namespace: resource.spec.sourceRef.namespace ?? resource.metadata.namespace,
                    }
                  : undefined,
              appliedCommit: kind === "Kustomization" ? commitOfRevision(status.lastAppliedRevision) : undefined,
              attemptedCommit: kind === "Kustomization" ? commitOfRevision(status.lastAttemptedRevision) : undefined,
              chart:
                kind === "HelmRelease"
                  ? {
                      helmChart: status.helmChart,
                      // Flux 2.3 and later keep a history of what was released; before, the applied revision is the chart version.
                      applied:
                        status.history?.find((release) => release.status === "deployed")?.chartVersion ??
                        status.lastAppliedRevision,
                      attempted: status.lastAttemptedRevision,
                    }
                  : undefined,
            },
          ];
        };

      const gitSourceOf = (repository: {
        metadata: { namespace: string; name: string };
        spec: { url: string; ref?: { branch?: string } };
        status?: { artifact?: { revision?: string } };
      }): GitSource[] => [
        {
          namespace: repository.metadata.namespace,
          name: repository.metadata.name,
          repository: githubRepositoryOfUrl(repository.spec.url),
          branch: repository.spec.ref?.branch,
          commit: commitOfRevision(repository.status?.artifact?.revision),
        },
      ];

      const helmChartOf = (chart: {
        metadata: { namespace: string; name: string };
        status?: { artifact?: { revision?: string }; observedSourceArtifactRevision?: string };
      }): HelmChart[] => [
        {
          namespace: chart.metadata.namespace,
          name: chart.metadata.name,
          version: chart.status?.artifact?.revision,
          sourceCommit: commitOfRevision(chart.status?.observedSourceArtifactRevision),
        },
      ];

      const imageSelectionOf = (policy: {
        metadata: { namespace: string; name: string };
        status?: Parameters<typeof selectedImageOf>[0];
      }): ImageSelection[] => {
        const image = selectedImageOf(policy.status);

        return image ? [{ namespace: policy.metadata.namespace, name: policy.metadata.name, image }] : [];
      };

      const imageAutomationOf = (automation: {
        metadata: { namespace: string; name: string };
        status?: { lastPushTime?: string; lastPushCommit?: string };
      }): ImageAutomation[] => [
        {
          namespace: automation.metadata.namespace,
          name: automation.metadata.name,
          lastPushTime: automation.status?.lastPushTime,
          lastPushCommit: automation.status?.lastPushCommit,
        },
      ];

      const start = async () => {
        const startedFor = generation;

        try {
          await connectCluster(clusterId);

          if (startedFor !== generation) return;

          const [
            deployments,
            statefulSets,
            daemonSets,
            imageSelections,
            kustomizations,
            helmReleases,
            imageAutomations,
            helmCharts,
            gitSources,
          ] = await Promise.all([
            follow(
              kubeResources(deploymentKind, appsV1, clusterId),
              workloadOf("Deployment", (deployment) => {
                const replicas = deployment.spec.replicas ?? 1;
                const status = deployment.status ?? {};

                return (
                  (status.observedGeneration ?? 0) >= (deployment.metadata.generation ?? 0) &&
                  (status.updatedReplicas ?? 0) === replicas &&
                  (status.availableReplicas ?? 0) >= replicas
                );
              }),
            ),
            follow(
              kubeResources(statefulSetKind, appsV1, clusterId),
              workloadOf("StatefulSet", (statefulSet) => {
                const replicas = statefulSet.spec.replicas ?? 1;

                return (
                  (statefulSet.status?.updatedReplicas ?? 0) === replicas &&
                  (statefulSet.status?.readyReplicas ?? 0) === replicas
                );
              }),
            ),
            follow(
              kubeResources(daemonSetKind, appsV1, clusterId),
              workloadOf("DaemonSet", ({ status }) => {
                const desired = status?.desiredNumberScheduled ?? 0;

                return (status?.updatedNumberScheduled ?? 0) === desired && (status?.numberAvailable ?? 0) === desired;
              }),
            ),
            // Flux and each of its parts are optional, and served in versions that depend on Flux's.
            followOptional(
              () => follow(kubeResources(imagePolicyKind, imageToolkitV1, clusterId), imageSelectionOf),
              () => follow(kubeResources(imagePolicyKind, imageToolkitV1beta2, clusterId), imageSelectionOf),
            ),
            followOptional(() =>
              follow(
                kubeResources(kustomizationKind, kustomizeToolkitV1, clusterId),
                fluxResourceOf("Kustomization", kustomizeToolkitV1),
              ),
            ),
            followOptional(
              () =>
                follow(
                  kubeResources(helmReleaseKind, helmToolkitV2, clusterId),
                  fluxResourceOf("HelmRelease", helmToolkitV2),
                ),
              () =>
                follow(
                  kubeResources(helmReleaseKind, helmToolkitV2beta2, clusterId),
                  fluxResourceOf("HelmRelease", helmToolkitV2beta2),
                ),
            ),
            followOptional(
              () => follow(kubeResources(imageUpdateAutomationKind, imageToolkitV1, clusterId), imageAutomationOf),
              () => follow(kubeResources(imageUpdateAutomationKind, imageToolkitV1beta2, clusterId), imageAutomationOf),
            ),
            followOptional(
              () => follow(kubeResources(helmChartKind, sourceToolkitV1, clusterId), helmChartOf),
              () => follow(kubeResources(helmChartKind, sourceToolkitV1beta2, clusterId), helmChartOf),
            ),
            followOptional(
              () => follow(kubeResources(gitRepositoryKind, sourceToolkitV1, clusterId), gitSourceOf),
              () => follow(kubeResources(gitRepositoryKind, sourceToolkitV1beta2, clusterId), gitSourceOf),
            ),
          ]);

          if (startedFor !== generation) return;

          runInAction(() => {
            failure.set(undefined);
            sources.set({
              workloads: [deployments, statefulSets, daemonSets],
              imageSelections,
              fluxResources: [kustomizations, helmReleases],
              imageAutomations,
              helmCharts,
              gitSources,
            });
          });
        } catch (error) {
          if (startedFor !== generation) return;

          // What was subscribed before the failure is let go, and all of it asked for again in a while:
          // a connection that dropped, or a cluster that was unreachable, comes back without a reopen.
          disposers.forEach((dispose) => dispose());
          disposers = [];
          runInAction(() => failure.set(messageOf(error)));
          retryTimer = setTimeout(() => {
            if (startedFor === generation) void start();
          }, clusterRetrySeconds * 1000);
        }
      };

      const state = computed((): ClusterImagesState => {
        const message = failure.get();
        const loaded = sources.get();

        if (message) return { status: "failed", message };
        if (!loaded) return { status: "loading" };

        return {
          status: "loaded",
          images: {
            workloads: loaded.workloads.flatMap((source) => source.get()),
            imageSelections: loaded.imageSelections.get(),
            fluxResources: loaded.fluxResources.flatMap((source) => source.get()),
            imageAutomations: loaded.imageAutomations.get(),
            helmCharts: loaded.helmCharts.get(),
            gitSources: loaded.gitSources.get(),
          },
        };
      });

      return {
        get state() {
          return state.get();
        },

        /** Starts following the cluster; the function it returns stops. */
        watch: () => {
          if (watchers++ === 0) void start();

          return () => {
            if (--watchers > 0) return;

            generation++;
            clearTimeout(retryTimer);
            runInAction(() => failure.set(undefined));
            disposers.forEach((dispose) => dispose());
            disposers = [];
            runInAction(() => sources.set(undefined));
          };
        },
      };
    };
  },
});
