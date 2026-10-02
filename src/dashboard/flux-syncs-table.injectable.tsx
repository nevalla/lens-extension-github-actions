import { A, Code, Div, Span } from "@k8slens/element-components";
import { CheckCircleIcon, ErrorIcon, ScheduleIcon, WarningIcon } from "@k8slens/icon";
import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { ColumnHeader } from "@k8slens/table-components";
import {
  getTableColumnInjectableBunch,
  getTableInjectableBunch,
  getTableKind,
  type TableColumnCellProps,
} from "@k8slens/table-contracts";
import { useInject } from "@k8slens/use-inject";
import { reaction } from "mobx";
import type { FluxSync } from "../deployments/flux-syncs";
import { openResourceDetailsInjectable } from "../deployments/open-resource-details.injectable";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";

type Params = [clusterId: string, watchKey: string];

/** A Kustomization with the cluster it is in, which is what opening its details asks for. */
interface Row extends FluxSync {
  readonly clusterId: string;
}

export const fluxSyncsTableKind = getTableKind<Row, Params>("github-actions-flux-syncs");

export const fluxSyncsBunch = getSubscribableInjectableBunch<readonly Row[], Params>()({
  id: "flux-syncs",
  source: {
    instantiate: (di) => {
      const watchOnCluster = di.inject(watchOnClusterInjectable);

      return () => (clusterId, watchKey) => ({
        start: ({ push }) => {
          const watchState = watchOnCluster(clusterId, watchKey);
          const stopWatching = watchState.watch();
          const stopPushing = reaction(
            () => watchState.summary?.syncs,
            (syncs) => syncs && push(syncs.map((sync) => ({ ...sync, clusterId }))),
            { fireImmediately: true },
          );

          return () => {
            stopPushing();
            stopWatching();
          };
        },
      });
    },
  },
});

export const fluxSyncsTable = getTableInjectableBunch({
  kind: fluxSyncsTableKind,
  getRowId: (row) => `${row.kustomization.namespace}/${row.kustomization.name}`,
  data: {
    instantiate: (di) => {
      const syncsOf = di.inject(fluxSyncsBunch.subscribable);

      return (...params) => syncsOf(...params);
    },
  },
});

type CellProps = TableColumnCellProps<Row>;

// A commit older than the versions watched is as far behind as can be told, and maybe more.
const behindLabel = ({ behind, at }: NonNullable<FluxSync["applied"]>) =>
  behind === 0 ? "Latest" : `${behind}${at ? "" : "+"} ${behind === 1 && at ? "commit" : "commits"} behind`;

export const syncStatusOf = ({ applied, pending }: FluxSync) => {
  switch (pending?.stage) {
    case "fetched":
      return `${pending.label} fetched, not applied yet`;
    case "applying":
      return `Applying ${pending.label}`;
    case "failed":
      return `Failed to apply ${pending.label}`;
  }

  return applied ? behindLabel(applied) : "Not applied yet";
};

const StatusIcon = ({ row }: CellProps) => {
  if (row.pending?.stage === "failed") return <ErrorIcon $size="s" $color="critical" />;
  if (row.pending) return <ScheduleIcon $size="s" $color="primary" />;

  return row.applied?.behind === 0 ? (
    <CheckCircleIcon $size="s" $color="success" />
  ) : (
    <WarningIcon $size="s" $color="notice" />
  );
};

// The status leads the name: a column of its own would take a share of the width as wide as any other.
const NameCell = ({ row }: CellProps) => {
  const openResourceDetails = useInject(openResourceDetailsInjectable)();

  return (
    <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
      <StatusIcon row={row} />
      <A onClick={() => void openResourceDetails(row.clusterId, row.kustomization)} $color="link">
        {row.kustomization.name}
      </A>
    </Div>
  );
};

const AppliedCell = ({ row }: CellProps) => {
  const openVersion = useInject(openVersionInjectable)();

  if (!row.applied) return <Code>—</Code>;

  return (
    <A onClick={() => void openVersion(row.applied!)} $tooltip="Open on GitHub" $color="link">
      <Code>{row.applied.label}</Code>
    </A>
  );
};

const StatusCell = ({ row }: CellProps) => (
  <Span
    $color={row.pending?.stage === "failed" ? "critical" : undefined}
    $tooltip={row.pending?.stage === "failed" ? row.kustomization.message : undefined}
  >
    {syncStatusOf(row)}
  </Span>
);

const SourceCell = ({ row }: CellProps) => (
  <Span $color="textMuted">
    GitRepository {row.source.namespace}/{row.source.name}
  </Span>
);

const header = (text: string) => () => <ColumnHeader>{text}</ColumnHeader>;

const columns = [
  ["name", NameCell, header("Kustomization")],
  ["applied", AppliedCell, header("Applied")],
  ["status", StatusCell, header("Status")],
  ["source", SourceCell, header("Source")],
] as const;

export const [fluxSyncNameColumn, fluxSyncAppliedColumn, fluxSyncStatusColumn, fluxSyncSourceColumn] = columns.map(
  ([id, Cell, Header], index) =>
    getTableColumnInjectableBunch({
      id: `github-actions-flux-sync-${id}`,
      kind: fluxSyncsTableKind,
      orderNumber: (index + 1) * 10,
      Cell,
      Header,
    }),
);
