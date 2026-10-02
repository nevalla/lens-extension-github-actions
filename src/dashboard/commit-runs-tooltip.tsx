import { Div, Span } from "@k8slens/element-components";
import { runStatusOf } from "../workflow-runs/run-status";
import type { WorkflowRun } from "../workflow-runs/workflow-run";
import { RunStatusIcon } from "./run-status-icon";

export const CommitRunsTooltip = ({ runs }: { runs: readonly WorkflowRun[] }) => (
  <Div $flex={{ direction: "vertical", gap: "xs" }}>
    {runs.map((run) => {
      const status = runStatusOf(run);

      return (
        <Div key={run.databaseId} $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
          <RunStatusIcon status={status} />
          <Span>{run.workflowName}</Span>
          <Span $color="textMuted">{status.label}</Span>
        </Div>
      );
    })}
  </Div>
);
