import type { KubernetesApiVersion } from "@k8slens/kubernetes-contracts";
import type { Condition } from "./flux-kinds";

/** The Kustomization or HelmRelease that applies something. */
export interface FluxOwnerRef {
  readonly kind: "Kustomization" | "HelmRelease";
  readonly namespace: string;
  readonly name: string;
}

export interface Workload {
  readonly kind: "Deployment" | "StatefulSet" | "DaemonSet";
  readonly namespace: string;
  readonly name: string;
  readonly images: readonly string[];
  /** Every replica runs the current template. */
  readonly rolledOut: boolean;
  readonly owner?: FluxOwnerRef;
}

export interface ImageSelection {
  readonly namespace: string;
  readonly name: string;
  readonly image: string;
}

/** What a HelmRelease has installed and is installing. */
export interface ReleasedChart {
  /** The HelmChart it installs from, as "namespace/name". */
  readonly helmChart?: string;
  /** The chart version installed last. */
  readonly applied?: string;
  /** The chart version tried last, the same as the applied one unless installing it is under way or failed. */
  readonly attempted?: string;
}

export interface FluxResource extends FluxOwnerRef {
  /** The version the cluster serves it in, which is what opening its details asks for. */
  readonly apiVersion: KubernetesApiVersion;
  /** For a HelmRelease. */
  readonly chart?: ReleasedChart;
  /** For a Kustomization: the source it applies, and the commits it applied and tried last. */
  readonly sourceRef?: { readonly kind: string; readonly namespace: string; readonly name: string };
  readonly appliedCommit?: string;
  readonly attemptedCommit?: string;
  readonly state: "ready" | "reconciling" | "failed";
  readonly message?: string;
  readonly revision?: string;
}

/** A Git repository Flux fetches. */
export interface GitSource {
  readonly namespace: string;
  readonly name: string;
  /** "owner/name", when it is on GitHub. */
  readonly repository?: string;
  readonly branch?: string;
  /** The commit fetched last. */
  readonly commit?: string;
}

export interface HelmChart {
  readonly namespace: string;
  readonly name: string;
  /** The chart version built last. */
  readonly version?: string;
  /** The commit it was built from, for a chart in a Git repository. */
  readonly sourceCommit?: string;
}

export interface ImageAutomation {
  readonly namespace: string;
  readonly name: string;
  readonly lastPushTime?: string;
  readonly lastPushCommit?: string;
}

/** What a cluster runs, what Flux has selected to run, and how Flux is getting it there. */
export interface ClusterImages {
  readonly workloads: readonly Workload[];
  readonly imageSelections: readonly ImageSelection[];
  readonly fluxResources: readonly FluxResource[];
  readonly imageAutomations: readonly ImageAutomation[];
  readonly helmCharts: readonly HelmChart[];
  readonly gitSources: readonly GitSource[];
}

export const fluxOwnerOf = (labels: Readonly<Record<string, string>> = {}): FluxOwnerRef | undefined => {
  const helmRelease = labels["helm.toolkit.fluxcd.io/name"];
  const kustomization = labels["kustomize.toolkit.fluxcd.io/name"];

  // A HelmRelease is the nearer owner: it is usually applied by a Kustomization itself.
  if (helmRelease)
    return { kind: "HelmRelease", name: helmRelease, namespace: labels["helm.toolkit.fluxcd.io/namespace"] ?? "" };
  if (kustomization)
    return {
      kind: "Kustomization",
      name: kustomization,
      namespace: labels["kustomize.toolkit.fluxcd.io/namespace"] ?? "",
    };

  return undefined;
};

export const fluxStateOf = (conditions: readonly Condition[] = []): Pick<FluxResource, "state" | "message"> => {
  const ready = conditions.find((condition) => condition.type === "Ready");
  const reconciling = conditions.find((condition) => condition.type === "Reconciling" && condition.status === "True");

  // Reconciling again after failing is failing, retried: Flux says so with "ProgressingWithRetry".
  if (reconciling?.reason === "ProgressingWithRetry" && ready?.status === "False")
    return { state: "failed", message: ready.message };
  if (reconciling || !ready || ready.status === "Unknown") return { state: "reconciling", message: ready?.message };

  return { state: ready.status === "True" ? "ready" : "failed", message: ready.message };
};

export const isSameFluxResource = (a: FluxOwnerRef, b: FluxOwnerRef) =>
  a.kind === b.kind && a.namespace === b.namespace && a.name === b.name;

const tagOf = (image: string) => {
  const withoutDigest = image.split("@")[0];
  const lastSegment = withoutDigest.slice(withoutDigest.lastIndexOf("/") + 1);

  return lastSegment.includes(":") ? lastSegment.slice(lastSegment.indexOf(":") + 1) : "";
};

/** What an image is of, without its registry and tag: "lens-cloud-backend" for "….amazonaws.com/lens-cloud-backend:main-76cd335". */
export const imageNameOf = (image: string) => {
  const withoutDigest = image.split("@")[0];
  const lastSegment = withoutDigest.slice(withoutDigest.lastIndexOf("/") + 1);

  return lastSegment.split(":")[0];
};

/** Whether an image's tag names the commit, in full or abbreviated, as in "main-76cd335" or "sha-76cd335…". */
export const imageIsOfCommit = (image: string, sha: string) =>
  tagOf(image)
    .split(/[^0-9a-f]+/i)
    .some((word) => word.length >= 7 && sha.toLowerCase().startsWith(word.toLowerCase()));

const withoutV = (tag: string) => tag.replace(/^v(?=\d)/, "");

/** Whether an image's tag is the release's tag, with or without a leading "v": "backend:v2026.9.3-rc.1" for "v2026.9.3-rc.1". */
export const imageIsOfRelease = (image: string, tag: string) => {
  const imageTag = tagOf(image);

  return imageTag !== "" && withoutV(imageTag) === withoutV(tag);
};
