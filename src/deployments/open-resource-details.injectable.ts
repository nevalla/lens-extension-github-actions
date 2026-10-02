import { navigateToKubeResourceDetailsInjectionToken } from "@k8slens/details-panel-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { appsV1, daemonSetKind, deploymentKind, statefulSetKind } from "@k8slens/kubernetes-contracts";
import { isNavigationSupersededError } from "@k8slens/navigation-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import type { FluxResource, Workload } from "./cluster-images";
import { helmReleaseKind, kustomizationKind } from "./flux-kinds";

const workloadKinds = { Deployment: deploymentKind, StatefulSet: statefulSetKind, DaemonSet: daemonSetKind } as const;
const fluxKinds = { Kustomization: kustomizationKind, HelmRelease: helmReleaseKind } as const;

/** Opens a workload's, or a Flux resource's, details panel in the cluster's view. */
export const openResourceDetailsInjectable = getInjectable2({
  id: "github-actions-open-resource-details",
  consumptions: [navigateToKubeResourceDetailsInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const navigateToKubeResourceDetails = di.inject(navigateToKubeResourceDetailsInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return () => async (clusterId: string, resource: Workload | FluxResource) => {
      try {
        await navigateToKubeResourceDetails({
          clusterId,
          ...("apiVersion" in resource
            ? { kind: fluxKinds[resource.kind], apiVersion: resource.apiVersion }
            : { kind: workloadKinds[resource.kind], apiVersion: appsV1 }),
          ref: { namespace: resource.namespace, name: resource.name },
        });
      } catch (error) {
        // The user went somewhere else before the details were shown: not a failure.
        if (!isNavigationSupersededError(error)) showErrorNotification((error as Error).message);
      }
    };
  },
});
