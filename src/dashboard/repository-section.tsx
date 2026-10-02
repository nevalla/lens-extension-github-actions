import { Button, Div, Span } from "@k8slens/element-components";
import { CheckCircleIcon, GitHubIcon, RefreshIcon } from "@k8slens/icon";
import { Table } from "@k8slens/table-contracts";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useEffect, useMemo } from "react";
import {
  followedLabelOf,
  isReleasesWatch,
  type WatchedRepository,
  watchKeyOf,
} from "../watched-repositories/watched-repository";
import { clusterRetrySeconds } from "../deployments/cluster-images.injectable";
import { liveCheckSeconds } from "../workflow-runs/track-activity.injectable";
import { versionsAsked, versionsWithRuns } from "../workflow-runs/track-sources.injectable";
import { gitOpsSyncsTableKind } from "./gitops-syncs-table.injectable";
import { GhProblemNotice } from "./gh-problem-notice";
import { Panel } from "./panel";
import { WorkflowDetails } from "./workflow-details";
import { servicesTableKind } from "./services-table.injectable";
import { StatCard } from "./stat-card";
import { versionsTableKind } from "./versions-table.injectable";
import { followWatchInjectable } from "../notifications/follow-watch.injectable";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";

// Lens's tables are as tall as where they are put, so each is given room for its rows, and scrolls past a dozen.
const tableHeight = (rows: number) => ({ height: 48 * (Math.min(Math.max(rows, 1), 12) + 1) });

const checkedLabel = (activity: { mode: "live" | "idle"; checkedAt: Date }) =>
  activity.mode === "live"
    ? `live · checking every ${liveCheckSeconds}s`
    : `checked ${activity.checkedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

export const RepositorySection = observer(({ clusterId, watch }: { clusterId: string; watch: WatchedRepository }) => {
  const watchKey = watchKeyOf(watch);
  const watchState = useInject(watchOnClusterInjectable)(clusterId, watchKey);
  const followWatch = useInject(followWatchInjectable)();
  const { activity, cluster, summary, rows } = watchState;
  const params = useMemo((): [string, string] => [clusterId, watchKey], [clusterId, watchKey]);
  const releases = isReleasesWatch(watch);
  const unit = releases ? "release" : "commit";
  const syncs = summary?.syncs ?? [];
  // A repository the cluster runs no images of, but applies with Flux or Argo CD: a GitOps repository.
  const gitOpsOnly = !!summary && summary.services.length === 0 && syncs.length > 0;
  const passing = rows.filter((row) => row.runs.length > 0 && row.runs.every((run) => run.conclusion === "success"));

  // Follows GitHub and the cluster while the dashboard shows them, and stops when it does not.
  // Notifications follow it too, for as long as the dashboard shows it.
  useEffect(() => followWatch(clusterId, watchKey), [followWatch, clusterId, watchKey]);

  return (
    <Div $flex={{ direction: "vertical", gap: "l" }}>
      <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
        <GitHubIcon $size="m" />
        <Span $font={{ size: "xl" }}>{watch.repository}</Span>
        <Span $color="textMuted" $font={{ size: "xl" }} $flexChild>
          {followedLabelOf(watch)}
        </Span>
        {activity.status === "loaded" && (
          <Span $color={activity.mode === "live" ? "primary" : "textMuted"}>{checkedLabel(activity)}</Span>
        )}
        <Button $onClick={() => void watchState.refresh()} $tooltip="Check now" $interactive>
          <RefreshIcon $size="s" />
        </Button>
      </Div>

      {activity.status === "failed" && (
        <Panel>
          <GhProblemNotice problem={activity.problem} hadData={false} />
        </Panel>
      )}

      {activity.status === "loaded" && activity.warning && (
        <Panel>
          <GhProblemNotice problem={activity.warning} hadData />
        </Panel>
      )}

      <Div $flex={{ direction: "horizontal", gap: "xl" }}>
        {gitOpsOnly ? (
          <StatCard
            icon={<CheckCircleIcon $size="m" />}
            title="Syncs"
            value={`${syncs.filter((sync) => sync.applied?.behind === 0 && !sync.pending).length}/${syncs.length}`}
            label="on the latest commit"
          />
        ) : (
          <StatCard
            icon={<CheckCircleIcon $size="m" />}
            title="Services"
            value={summary ? `${summary.onNewest}/${summary.services.length}` : "–"}
            label={`on the latest ${unit}`}
          />
        )}
        <StatCard
          icon={<GitHubIcon $size="m" />}
          title="Versions"
          value={
            !summary
              ? "–"
              : gitOpsOnly
                ? new Set(syncs.flatMap((sync) => (sync.applied ? [sync.applied.id] : []))).size
                : summary.versionsRunning
          }
          label={gitOpsOnly ? "applied" : "running"}
        />
        <StatCard
          icon={<RefreshIcon $size="m" />}
          title="Workflows"
          value={activity.status === "loaded" ? `${passing.length}/${rows.length}` : "–"}
          label={`recent ${unit}s passing`}
        />
      </Div>

      <Panel heading={releases ? "Recent releases" : "Recent commits"} aside={`last ${versionsWithRuns}`}>
        <Div $style={tableHeight(rows.length || versionsWithRuns)}>
          <Table kind={versionsTableKind} params={params} />
        </Div>
        <WorkflowDetails
          clusterId={clusterId}
          watchKey={watchKey}
          repository={watch.repository}
          rows={rows}
          onRerun={() => void watchState.refresh()}
        />
      </Panel>

      {syncs.length > 0 && (
        <Panel
          heading={`GitOps syncs (${syncs.length})`}
          aside="Kustomizations and Argo CD Applications applying this branch"
        >
          <Div $style={tableHeight(syncs.length)}>
            <Table kind={gitOpsSyncsTableKind} params={params} />
          </Div>
        </Panel>
      )}

      {!gitOpsOnly && (
        <Panel heading={`Services${summary ? ` (${summary.services.length})` : ""}`}>
          {cluster.status === "failed" ? (
            <Div $flex={{ direction: "vertical", gap: "xs" }}>
              <Span $color="warning">Could not read what this cluster runs: {cluster.message}</Span>
              <Span $color="textMuted">Trying again every {clusterRetrySeconds} seconds.</Span>
            </Div>
          ) : summary && summary.services.length === 0 ? (
            <Span $color="textMuted">
              Nothing in this cluster runs a build of the last {versionsAsked} {unit}s.
            </Span>
          ) : (
            <Div $style={tableHeight(summary?.services.length ?? 3)}>
              <Table kind={servicesTableKind} params={params} />
            </Div>
          )}
        </Panel>
      )}
    </Div>
  );
});
