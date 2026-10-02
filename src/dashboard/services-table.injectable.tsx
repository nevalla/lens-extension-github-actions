import { CheckCircleIcon, ErrorIcon, ScheduleIcon, WarningIcon } from "@k8slens/icon";
import { A, Code, Div, getTooltipProps, Span } from "@k8slens/element-components";
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
import type { ReactNode } from "react";
import type { FluxResource, Workload } from "../deployments/cluster-images";
import { openResourceDetailsInjectable } from "../deployments/open-resource-details.injectable";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { isReleasesWatch, watchOfKey } from "../watched-repositories/watched-repository";
import { type ServiceRow, serviceLookOf, serviceStatusOf } from "./flux-stage";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";
import { ServiceTooltip } from "./service-tooltip";
import { FluxResourceIcon } from "./flux-resource-icon";

type Params = [clusterId: string, watchKey: string];

/** A service with the cluster it runs in, which is what opening its details asks for. */
interface Row extends ServiceRow {
  readonly clusterId: string;
}

export const servicesTableKind = getTableKind<Row, Params>("github-actions-services");

export const servicesBunch = getSubscribableInjectableBunch<readonly Row[], Params>()({
  id: "services",
  source: {
    instantiate: (di) => {
      const watchOnCluster = di.inject(watchOnClusterInjectable);

      return () => (clusterId, watchKey) => ({
        start: ({ push }) => {
          const watchState = watchOnCluster(clusterId, watchKey);
          const unit = isReleasesWatch(watchOfKey(watchKey)) ? "release" : "commit";
          const stopWatching = watchState.watch();
          const stopPushing = reaction(
            () => watchState.summary?.services,
            (services) => services && push(services.map((service) => ({ ...service, unit, clusterId }))),
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

export const servicesTable = getTableInjectableBunch({
  kind: servicesTableKind,
  getRowId: (service) => service.name,
  data: {
    instantiate: (di) => {
      const servicesOf = di.inject(servicesBunch.subscribable);

      return (...params) => servicesOf(...params);
    },
  },
});

type CellProps = TableColumnCellProps<Row>;

const StatusIcon = ({ row }: CellProps) => {
  switch (serviceLookOf(row)) {
    case "failed":
      return <ErrorIcon $size="s" $color="critical" />;
    case "progressing":
      return <ScheduleIcon $size="s" $color="primary" />;
    case "behind":
      return <WarningIcon $size="s" $color="notice" />;
    case "latest":
      return <CheckCircleIcon $size="s" $color="success" />;
  }
};

/** A link that opens a workload's or a Flux resource's details in the cluster's view. */
const DetailsLink = ({
  clusterId,
  resource,
  children,
}: {
  clusterId: string;
  resource: Workload | FluxResource;
  children: ReactNode;
}) => {
  const openResourceDetails = useInject(openResourceDetailsInjectable)();

  return (
    <A onClick={() => void openResourceDetails(clusterId, resource)} $color="link">
      {children}
    </A>
  );
};

// The status leads the name: a column of its own would take a share of the width as wide as any other.
const NameCell = ({ row }: CellProps) => {
  const [workload] = row.workloads;

  return (
    <Div
      $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}
      $tooltip={getTooltipProps({ Content: ServiceTooltip, contentProps: { service: row } })}
    >
      <StatusIcon row={row} />
      {workload ? (
        <DetailsLink clusterId={row.clusterId} resource={workload}>
          {row.name}
        </DetailsLink>
      ) : (
        <Span>{row.name}</Span>
      )}
    </Div>
  );
};

const VersionCell = ({ row }: CellProps) => {
  const openVersion = useInject(openVersionInjectable)();

  if (!row.running) return <Code>—</Code>;

  return (
    <A onClick={() => void openVersion(row.running!)} $tooltip="Open on GitHub" $color="link">
      <Code>{row.running.label}</Code>
    </A>
  );
};

const StateCell = ({ row }: CellProps) => (
  <Span $color={serviceLookOf(row) === "failed" ? "critical" : undefined}>{serviceStatusOf(row)}</Span>
);

const FluxCell = ({ row }: CellProps) =>
  row.flux ? (
    <Div
      $flex={{ direction: "horizontal", gap: "xs", verticalAlign: "center" }}
      $tooltip={row.flux.message ?? `${row.flux.kind} ${row.flux.namespace}/${row.flux.name}`}
    >
      <FluxResourceIcon state={row.flux.state} />
      <DetailsLink clusterId={row.clusterId} resource={row.flux}>
        {row.flux.kind} {row.flux.name}
      </DetailsLink>
      {row.chart?.applied && <Span $color="textMuted">· chart {row.chart.applied}</Span>}
    </Div>
  ) : (
    <Span $color="textMuted">—</Span>
  );

const workloadKindsOf = (workloads: readonly Workload[]) => {
  const counts = new Map<string, number>();

  for (const workload of workloads) counts.set(workload.kind, (counts.get(workload.kind) ?? 0) + 1);

  return [...counts].map(([kind, count]) => (count > 1 ? `${kind} ×${count}` : kind)).join(", ");
};

const WorkloadsCell = ({ row }: CellProps) => (
  <Span $tooltip={getTooltipProps({ Content: ServiceTooltip, contentProps: { service: row } })}>
    {workloadKindsOf(row.workloads) || "—"}
  </Span>
);

const header = (text: string) => () => <ColumnHeader>{text}</ColumnHeader>;
const ServiceHeader = header("Service");
const CommitHeader = header("Version");
const StateHeader = header("Status");
const WorkloadsHeader = header("Workloads");
const FluxHeader = header("Flux");

export const serviceNameColumn = getTableColumnInjectableBunch({
  id: "github-actions-service-name",
  kind: servicesTableKind,
  orderNumber: 20,
  Cell: NameCell,
  Header: ServiceHeader,
});

export const serviceCommitColumn = getTableColumnInjectableBunch({
  id: "github-actions-service-commit",
  kind: servicesTableKind,
  orderNumber: 30,
  Cell: VersionCell,
  Header: CommitHeader,
});

export const serviceStateColumn = getTableColumnInjectableBunch({
  id: "github-actions-service-state",
  kind: servicesTableKind,
  orderNumber: 40,
  Cell: StateCell,
  Header: StateHeader,
});

export const serviceWorkloadsColumn = getTableColumnInjectableBunch({
  id: "github-actions-service-workloads",
  kind: servicesTableKind,
  orderNumber: 50,
  Cell: WorkloadsCell,
  Header: WorkloadsHeader,
});

export const serviceFluxColumn = getTableColumnInjectableBunch({
  id: "github-actions-service-flux",
  kind: servicesTableKind,
  orderNumber: 45,
  Cell: FluxCell,
  Header: FluxHeader,
});
