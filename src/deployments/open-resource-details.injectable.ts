import { navigateToKubeResourceDetailsInjectionToken } from "@k8slens/details-panel-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import {
  appsV1,
  batchV1,
  cronJobKind,
  daemonSetKind,
  deploymentKind,
  statefulSetKind,
} from "@k8slens/kubernetes-contracts";
import { isNavigationSupersededError } from "@k8slens/navigation-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import type { DeployResource, Workload } from "./cluster-images";
import { applicationKind } from "./argo-kinds";
import { helmReleaseKind, kustomizationKind } from "./flux-kinds";

const workloadKinds = {
  Deployment: { kind: deploymentKind, apiVersion: appsV1 },
  StatefulSet: { kind: statefulSetKind, apiVersion: appsV1 },
  DaemonSet: { kind: daemonSetKind, apiVersion: appsV1 },
  CronJob: { kind: cronJobKind, apiVersion: batchV1 },
} as const;
const deployerKinds = {
  Kustomization: kustomizationKind,
  HelmRelease: helmReleaseKind,
  Application: applicationKind,
} as const;

/** Opens a workload's, a Flux resource's or an Argo CD Application's details panel in the cluster's view. */
export const openResourceDetailsInjectable = getInjectable2({
  id: "github-actions-open-resource-details",
  consumptions: [navigateToKubeResourceDetailsInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const navigateToKubeResourceDetails = di.inject(navigateToKubeResourceDetailsInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return () => async (clusterId: string, resource: Workload | DeployResource) => {
      try {
        await navigateToKubeResourceDetails({
          clusterId,
          ...("apiVersion" in resource
            ? { kind: deployerKinds[resource.kind], apiVersion: resource.apiVersion }
            : workloadKinds[resource.kind]),
          ref: { namespace: resource.namespace, name: resource.name },
        });
      } catch (error) {
        // The user went somewhere else before the details were shown: not a failure.
        if (!isNavigationSupersededError(error)) showErrorNotification((error as Error).message);
      }
    };
  },
});
