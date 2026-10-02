import type { ClusterImages, FluxResource, GitSource, HelmChart, Workload } from "../src/deployments/cluster-images";
import type { Version } from "../src/workflow-runs/version";
import type { WorkflowRun } from "../src/workflow-runs/workflow-run";

export const sha = (prefix: string) => prefix.padEnd(40, "0");

export const commit = (prefix: string, at = "2026-10-01T08:00:00Z"): Version => ({
  id: sha(prefix),
  label: prefix.slice(0, 7),
  title: `commit ${prefix}`,
  at,
  url: `https://github.com/o/r/commit/${sha(prefix)}`,
});

export const release = (tag: string, at = "2026-10-01T08:00:00Z"): Version => ({
  id: tag,
  label: tag,
  title: tag,
  at,
  url: `https://github.com/o/r/releases/tag/${tag}`,
});

export const workload = (name: string, image: string, overrides: Partial<Workload> = {}): Workload => ({
  kind: "Deployment",
  namespace: "apps",
  name,
  images: [image],
  rolledOut: true,
  ...overrides,
});

export const helmRelease = (name: string, overrides: Partial<FluxResource> = {}): FluxResource => ({
  kind: "HelmRelease",
  apiVersion: "helm.toolkit.fluxcd.io/v2" as never,
  namespace: "apps",
  name,
  state: "ready",
  ...overrides,
});

export const kustomization = (name: string, overrides: Partial<FluxResource> = {}): FluxResource => ({
  kind: "Kustomization",
  apiVersion: "kustomize.toolkit.fluxcd.io/v1" as never,
  namespace: "flux-system",
  name,
  state: "ready",
  sourceRef: { kind: "GitRepository", namespace: "flux-system", name },
  ...overrides,
});

export const gitSource = (name: string, overrides: Partial<GitSource> = {}): GitSource => ({
  namespace: "flux-system",
  name,
  repository: "o/gitops",
  branch: "main",
  ...overrides,
});

export const helmChart = (name: string, overrides: Partial<HelmChart> = {}): HelmChart => ({
  namespace: "flux-system",
  name,
  ...overrides,
});

export const cluster = (overrides: Partial<ClusterImages> = {}): ClusterImages => ({
  workloads: [],
  imageSelections: [],
  fluxResources: [],
  imageAutomations: [],
  helmCharts: [],
  gitSources: [],
  ...overrides,
});

export const run = (
  workflowName: string,
  status = "completed",
  conclusion = "success",
  databaseId = 1,
): WorkflowRun => ({
  databaseId,
  workflowName,
  headBranch: "main",
  status,
  conclusion,
});
