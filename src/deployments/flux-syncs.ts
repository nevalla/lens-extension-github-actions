import type { Version } from "../workflow-runs/version";
import type { ClusterImages, FluxResource, GitSource } from "./cluster-images";
import type { VersionOnTrack } from "./services";

/**
 * A Kustomization applying the watched branch: what it applied, and a newer commit on its way, fetched
 * by its GitRepository and not applied yet, being applied, or failed to apply.
 */
export interface FluxSync {
  readonly kustomization: FluxResource;
  readonly source: GitSource;
  /** The commit applied, short when it is not one of the versions watched. */
  readonly applied?: VersionOnTrack;
  readonly pending?: VersionOnTrack & { readonly stage: "fetched" | "applying" | "failed" };
}

const onTrackOf = (
  sha: string | undefined,
  repository: string,
  versions: readonly Version[],
): VersionOnTrack | undefined => {
  if (!sha) return undefined;

  const behind = versions.findIndex((version) => version.id === sha);

  // A commit older than the versions watched is still named, as far behind as can be told.
  return behind === -1
    ? {
        id: sha,
        label: sha.slice(0, 7),
        at: "",
        behind: versions.length,
        url: `https://github.com/${repository}/commit/${sha}`,
      }
    : { id: sha, label: versions[behind].label, at: versions[behind].at, behind, url: versions[behind].url };
};

const pendingOf = (kustomization: FluxResource, source: GitSource) => {
  const { appliedCommit, attemptedCommit, state } = kustomization;

  if (state === "failed") return { commit: attemptedCommit ?? source.commit, stage: "failed" as const };
  if (state === "reconciling") return { commit: source.commit ?? attemptedCommit, stage: "applying" as const };
  if (source.commit && source.commit !== appliedCommit) return { commit: source.commit, stage: "fetched" as const };

  return undefined;
};

/** The Kustomizations applying a repository's branch from a GitRepository of the cluster, most behind first. */
export const fluxSyncsOf = (
  repository: string,
  branch: string,
  versions: readonly Version[],
  { fluxResources, gitSources }: ClusterImages,
): FluxSync[] => {
  const sources = gitSources.filter(
    (source) => source.repository === repository.toLowerCase() && source.branch === branch,
  );

  return fluxResources
    .flatMap((kustomization): FluxSync[] => {
      const source = sources.find(
        (each) =>
          kustomization.sourceRef?.kind === "GitRepository" &&
          each.namespace === kustomization.sourceRef.namespace &&
          each.name === kustomization.sourceRef.name,
      );

      if (!source) return [];

      const pending = pendingOf(kustomization, source);
      const pendingOnTrack = onTrackOf(pending?.commit, repository, versions);

      return [
        {
          kustomization,
          source,
          applied: onTrackOf(kustomization.appliedCommit, repository, versions),
          // Failing counts even on the applied commit: applying it again is what fails.
          pending:
            pending &&
            pendingOnTrack &&
            (pending.stage === "failed" || pendingOnTrack.id !== kustomization.appliedCommit)
              ? { ...pendingOnTrack, stage: pending.stage }
              : undefined,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(!!b.pending) - Number(!!a.pending) ||
        (b.applied?.behind ?? 0) - (a.applied?.behind ?? 0) ||
        a.kustomization.name.localeCompare(b.kustomization.name),
    );
};

/** One Kustomization as it stands for one version. */
export interface VersionSync {
  readonly name: string;
  readonly state: "running" | "rolling-out" | "picked-up" | "failed";
  readonly sync: FluxSync;
}

const pendingStates = { fetched: "picked-up", applying: "rolling-out", failed: "failed" } as const;

/** The Kustomizations that applied, are applying, fetched, or failed to apply one version. */
export const syncsOfVersion = (id: string, syncs: readonly FluxSync[]): VersionSync[] =>
  syncs.flatMap((sync): VersionSync[] => {
    const name = sync.kustomization.name;

    if (sync.pending?.id === id) return [{ name, state: pendingStates[sync.pending.stage], sync }];
    if (sync.applied?.id === id) return [{ name, state: "running", sync }];

    return [];
  });
