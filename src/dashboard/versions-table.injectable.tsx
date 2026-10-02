import { A, Code, Div, getTooltipProps, Span } from "@k8slens/element-components";
import {
  getTableColumnInjectableBunch,
  getTableInjectableBunch,
  getTableKind,
  type TableColumnCellProps,
} from "@k8slens/table-contracts";
import { useInject } from "@k8slens/use-inject";
import type { VersionSync } from "../deployments/gitops-syncs";
import type { VersionService } from "../deployments/version-services";
import { isReleasesWatch, watchOfKey } from "../watched-repositories/watched-repository";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { overallStatusOf } from "../workflow-runs/run-status";
import { CommitRunsTooltip } from "./commit-runs-tooltip";
import { formatAge } from "./format-time-ago";
import { RunStatusIcon } from "./run-status-icon";
import { ServiceTooltip } from "./service-tooltip";
import { type DotColor, StatusDot } from "./status-dot";
import type { VersionRow } from "./watch-on-cluster.injectable";
import { columnHeader, getWatchRowsBunch, type WatchTableParams } from "./watch-table";

/** A row with what its services are counted in, as the tooltips say it. */
interface Row extends VersionRow {
  readonly unit: "commit" | "release";
}

export const versionsTableKind = getTableKind<Row, WatchTableParams>("github-actions-versions");

export const versionRowsBunch = getWatchRowsBunch<Row>("version-rows", (watchState, _clusterId, watchKey) => {
  const unit = isReleasesWatch(watchOfKey(watchKey)) ? "release" : "commit";

  return watchState.activity.status === "loading" ? undefined : watchState.rows.map((row) => ({ ...row, unit }));
});

export const versionsTable = getTableInjectableBunch({
  kind: versionsTableKind,
  getRowId: (row) => row.version.id,
  data: {
    instantiate: (di) => {
      const versionRowsOf = di.inject(versionRowsBunch.subscribable);

      return (...params) => versionRowsOf(...params);
    },
  },
});

type CellProps = TableColumnCellProps<Row>;

const runsTooltip = (row: Row) =>
  getTooltipProps({ Content: CommitRunsTooltip, contentProps: { runs: row.runs, runsOn: row.runsOn } });

// The CI status leads the version: a column of its own would take a share of the width as wide as any other.
const VersionCell = ({ row }: CellProps) => {
  const openVersion = useInject(openVersionInjectable)();

  return (
    <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
      {row.runs.length > 0 && (
        <Div $tooltip={runsTooltip(row)}>
          <RunStatusIcon status={overallStatusOf(row.runs)} />
        </Div>
      )}
      <A
        onClick={() => void openVersion(row.version)}
        $tooltip={row.version.prerelease ? "Pre-release · open on GitHub" : "Open on GitHub"}
        $color="link"
      >
        <Code>{row.version.label}</Code>
      </A>
    </Div>
  );
};

const TitleCell = ({ row }: CellProps) =>
  row.version.title !== row.version.label ? <Span $tooltip={row.version.title}>{row.version.title}</Span> : null;

const ChecksCell = ({ row }: CellProps) =>
  row.runs.length === 0 ? (
    <Span $color="textMuted">—</Span>
  ) : (
    <Span $tooltip={runsTooltip(row)}>
      {row.runs.filter((run) => run.conclusion === "success").length}/{row.runs.length} passed
      {row.runsOn && <Span $color="textMuted"> · on {row.runsOn}</Span>}
    </Span>
  );

const dotColors: Record<VersionService["state"], DotColor> = {
  running: "success",
  "rolling-out": "primary",
  "picked-up": "notice",
  failed: "critical",
};

const serviceStateLabels: Record<VersionService["state"], string> = {
  running: "running",
  "rolling-out": "rolling out",
  "picked-up": "picked up by Flux",
  failed: "failed to apply",
};

const syncStateLabels: Record<VersionSync["state"], string> = {
  running: "applied",
  "rolling-out": "applying",
  "picked-up": "fetched, not applied yet",
  failed: "failed to apply",
};

/** A service, a Kustomization or an Application in the cell, with what its dot means. */
interface Entry {
  readonly name: string;
  readonly state: VersionService["state"];
  readonly label: string;
}

const entriesOf = (row: Row): Entry[] => [
  ...(row.services ?? []).map(({ name, state }) => ({ name, state, label: serviceStateLabels[state] })),
  ...(row.syncs ?? []).map(({ name, state, sync }) => ({
    name,
    state,
    label: `${sync.resource.kind} ${syncStateLabels[state]}`,
  })),
];

const EntryDot = ({ entry }: { entry: Entry }) => (
  <Div $flex={{ direction: "horizontal", gap: "xxs", verticalAlign: "center" }}>
    <StatusDot color={dotColors[entry.state]} />
    <Span>{entry.name}</Span>
  </Div>
);

const EntriesTooltip = ({ entries }: { entries: readonly Entry[] }) => (
  <Div $flex={{ direction: "vertical", gap: "xs" }}>
    {entries.map((entry) => (
      <Div key={entry.name} $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
        <EntryDot entry={entry} />
        <Span $color="textMuted">{entry.label}</Span>
      </Div>
    ))}
  </Div>
);

// One line, as every row of a table is: the first service, Kustomization or Application, and how many more, all of them on hover.
const InClusterCell = ({ row }: CellProps) => {
  const entries = entriesOf(row);
  const [first, ...others] = entries;
  const [onlyService] = row.services ?? [];

  if (!first) return null;

  return (
    <Div
      $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}
      $tooltip={
        others.length === 0 && onlyService
          ? getTooltipProps({
              Content: ServiceTooltip,
              contentProps: { service: { ...onlyService.service, unit: row.unit } },
            })
          : getTooltipProps({ Content: EntriesTooltip, contentProps: { entries } })
      }
    >
      <EntryDot entry={first} />
      {others.length > 0 && <Span $color="textMuted">+{others.length} more</Span>}
    </Div>
  );
};

const AgeCell = ({ row }: CellProps) => <Span>{formatAge(row.version.at)}</Span>;

const columns = [
  ["version", VersionCell, columnHeader("Version")],
  ["title", TitleCell, columnHeader("Message")],
  ["checks", ChecksCell, columnHeader("Workflows")],
  ["in-cluster", InClusterCell, columnHeader("In cluster")],
  ["age", AgeCell, columnHeader("Age")],
] as const;

export const [versionColumn, versionTitleColumn, versionChecksColumn, versionInClusterColumn, versionAgeColumn] =
  columns.map(([id, Cell, Header], index) =>
    getTableColumnInjectableBunch({
      id: `github-actions-version-${id}`,
      kind: versionsTableKind,
      orderNumber: (index + 1) * 10,
      Cell,
      Header,
    }),
  );
