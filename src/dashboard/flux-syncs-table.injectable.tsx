import { A, Code, Div, Span } from "@k8slens/element-components";
import { CheckCircleIcon, ErrorIcon, ScheduleIcon, WarningIcon } from "@k8slens/icon";
import {
  getTableColumnInjectableBunch,
  getTableInjectableBunch,
  getTableKind,
  type TableColumnCellProps,
} from "@k8slens/table-contracts";
import { useInject } from "@k8slens/use-inject";
import type { FluxSync } from "../deployments/flux-syncs";
import { openResourceDetailsInjectable } from "../deployments/open-resource-details.injectable";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { syncStatusOf } from "./flux-stage";
import { columnHeader, getWatchRowsBunch, type WatchTableParams } from "./watch-table";

/** A Kustomization with the cluster it is in, which is what opening its details asks for. */
interface Row extends FluxSync {
  readonly clusterId: string;
}

export const fluxSyncsTableKind = getTableKind<Row, WatchTableParams>("github-actions-flux-syncs");

export const fluxSyncsBunch = getWatchRowsBunch<Row>("flux-syncs", (watchState, clusterId) =>
  watchState.summary?.syncs.map((sync) => ({ ...sync, clusterId })),
);

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

const columns = [
  ["name", NameCell, columnHeader("Kustomization")],
  ["applied", AppliedCell, columnHeader("Applied")],
  ["status", StatusCell, columnHeader("Status")],
  ["source", SourceCell, columnHeader("Source")],
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
