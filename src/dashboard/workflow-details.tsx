import { A, Button, Div, Span } from "@k8slens/element-components";
import { CloseIcon } from "@k8slens/icon";
import { PlainButton } from "@k8slens/input-components";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useEffect } from "react";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { rerunFailedJobsInjectable } from "../workflow-runs/rerun-failed-jobs.injectable";
import { durationOf, failedStepOf, type RunJob } from "../workflow-runs/run-jobs";
import { runJobsInjectable } from "../workflow-runs/run-jobs.injectable";
import { runStatusOf } from "../workflow-runs/run-status";
import type { VersionRuns } from "../workflow-runs/version";
import type { WorkflowRun } from "../workflow-runs/workflow-run";
import { RunStatusIcon } from "./run-status-icon";
import { selectedVersionInjectable } from "./selected-version.injectable";

const runUrlOf = (repository: string, run: WorkflowRun) =>
  `https://github.com/${repository}/actions/runs/${run.databaseId}`;

const JobRow = ({ job }: { job: RunJob }) => {
  const openLink = useInject(openVersionInjectable)();
  const failedStep = failedStepOf(job);
  const duration = durationOf(job);

  return (
    <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }} $padding={{ left: "xl" }}>
      <RunStatusIcon status={runStatusOf({ status: job.status, conclusion: job.conclusion ?? "" })} />
      <A onClick={() => void openLink({ url: job.url })} $tooltip="Open the job's log on GitHub" $color="link">
        {job.name}
      </A>
      {duration && <Span $color="textMuted">{duration}</Span>}
      {failedStep && <Span $color="critical">failed in {failedStep}</Span>}
    </Div>
  );
};

const RunDetails = observer(
  ({
    repository,
    run,
    version,
    onRerun,
  }: {
    repository: string;
    run: WorkflowRun;
    version: string;
    onRerun: () => void;
  }) => {
    const jobs = useInject(runJobsInjectable)(repository, run.databaseId);
    const openLink = useInject(openVersionInjectable)();
    const rerunFailedJobs = useInject(rerunFailedJobsInjectable)();
    const status = runStatusOf(run);

    // The jobs are asked for again when the run's status changes, as when it was re-run.
    useEffect(() => jobs.watch(`${run.status}/${run.conclusion}`), [jobs, run.status, run.conclusion]);

    const rerun = async () => {
      if (await rerunFailedJobs(repository, run.databaseId, run.workflowName, version)) {
        onRerun();
        void jobs.refresh();
      }
    };

    const { state } = jobs;

    return (
      <Div $flex={{ direction: "vertical", gap: "xs" }}>
        <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
          <RunStatusIcon status={status} />
          <A
            onClick={() => void openLink({ url: runUrlOf(repository, run) })}
            $tooltip="Open the run on GitHub"
            $color="link"
          >
            {run.workflowName}
          </A>
          <Span $color="textMuted" $flexChild>
            {status.label}
          </Span>
          {status.color === "critical" && <PlainButton onClick={() => void rerun()}>Re-run failed jobs</PlainButton>}
        </Div>
        {state.status === "loading" && (
          <Span $color="textMuted" $padding={{ left: "xl" }}>
            Loading jobs…
          </Span>
        )}
        {state.status === "failed" && (
          <Span $color="warning" $padding={{ left: "xl" }} $tooltip={state.problem.detail}>
            Could not read the jobs: {state.problem.title}
          </Span>
        )}
        {state.status === "loaded" && state.jobs.map((job) => <JobRow key={job.url} job={job} />)}
      </Div>
    );
  },
);

/** The workflows of the version picked in the table, with their jobs, under the table. */
export const WorkflowDetails = observer(
  ({
    clusterId,
    watchKey,
    repository,
    rows,
    onRerun,
  }: {
    clusterId: string;
    watchKey: string;
    repository: string;
    rows: readonly VersionRuns[];
    onRerun: () => void;
  }) => {
    const selected = useInject(selectedVersionInjectable)(clusterId, watchKey);
    const row = rows.find((each) => each.version.id === selected.id);

    if (!row) return null;

    return (
      <Div $flex={{ direction: "vertical", gap: "m" }} $padding={{ top: "m" }}>
        <Div $flex={{ direction: "horizontal", verticalAlign: "center" }}>
          <Span $font={{ size: "l" }} $flexChild>
            Workflows of {row.version.label}
            {row.runsOn ? ` · on ${row.runsOn}` : ""}
          </Span>
          <Button $onClick={selected.clear} $tooltip="Close" $interactive>
            <CloseIcon $size="s" />
          </Button>
        </Div>
        {row.runs.map((run) => (
          <RunDetails
            key={run.databaseId}
            repository={repository}
            run={run}
            version={row.version.label}
            onRerun={onRerun}
          />
        ))}
      </Div>
    );
  },
);
