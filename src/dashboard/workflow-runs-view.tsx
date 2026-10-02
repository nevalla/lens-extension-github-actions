import { A, Div, Pre, Span } from "@k8slens/element-components";
import { PlainButton } from "@k8slens/input-components";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useEffect } from "react";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { rerunFailedJobsInjectable } from "../workflow-runs/rerun-failed-jobs.injectable";
import { failedLogInjectable } from "../workflow-runs/failed-log.injectable";
import { durationOf, failedStepOf, isFailed, type RunJob, type RunStep } from "../workflow-runs/run-jobs";
import { runJobsInjectable } from "../workflow-runs/run-jobs.injectable";
import { runStatusOf } from "../workflow-runs/run-status";
import type { VersionRuns } from "../workflow-runs/version";
import type { WorkflowRun } from "../workflow-runs/workflow-run";
import { RunStatusIcon } from "./run-status-icon";

const runUrlOf = (repository: string, run: WorkflowRun) =>
  `https://github.com/${repository}/actions/runs/${run.databaseId}`;

const statusOf = (item: { status: string; conclusion?: string | null }) =>
  runStatusOf({ status: item.status, conclusion: item.conclusion ?? "" });

const StepRow = ({ step }: { step: RunStep }) => {
  const duration = durationOf(step);

  return (
    <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
      <RunStatusIcon status={statusOf(step)} />
      <Span>{step.name}</Span>
      {duration && <Span $color="textMuted">{duration}</Span>}
    </Div>
  );
};

const logColors = { error: "critical", warning: "warning", plain: undefined } as const;

/** The end of a failed job's log, asked for once when shown. */
const FailedLog = observer(({ repository, runId, job }: { repository: string; runId: number; job: RunJob }) => {
  const log = useInject(failedLogInjectable)(repository, runId, job.databaseId);
  const openLink = useInject(openVersionInjectable)();
  const { state } = log;

  useEffect(() => void log.load(), [log]);

  return (
    <Div $flex={{ direction: "vertical", gap: "xs" }}>
      {state.status === "loading" && <Span $color="textMuted">Loading the log…</Span>}
      {state.status === "failed" && (
        <Span $color="warning" $tooltip={state.problem.detail}>
          Could not read the log: {state.problem.title}
        </Span>
      )}
      {state.status === "loaded" && (
        <Pre
          $backgroundColor="backgroundPrimary"
          $padding="m"
          $border={{ color: "borderPrimary", width: "xxs", radius: "m" }}
          $overflow={{ x: "auto" }}
          $style={{ maxHeight: 360, margin: 0, fontSize: "0.85em" }}
        >
          {state.lines.map((line, index) => (
            <Span key={index} $color={logColors[line.kind]} $block>
              {line.text}
            </Span>
          ))}
        </Pre>
      )}
      <A onClick={() => void openLink({ url: job.url })} $color="link">
        Full log on GitHub
      </A>
    </Div>
  );
});

const JobRow = ({
  repository,
  runId,
  job,
  detailed,
}: {
  repository: string;
  runId: number;
  job: RunJob;
  detailed: boolean;
}) => {
  const openLink = useInject(openVersionInjectable)();
  const failedStep = failedStepOf(job);
  const duration = durationOf(job);

  return (
    <Div $flex={{ direction: "vertical", gap: "xs" }} $padding={{ left: "xl" }}>
      <Div $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}>
        <RunStatusIcon status={statusOf(job)} />
        <A onClick={() => void openLink({ url: job.url })} $tooltip="Open the job's log on GitHub" $color="link">
          {job.name}
        </A>
        {duration && <Span $color="textMuted">{duration}</Span>}
        {failedStep && <Span $color="critical">failed in {failedStep}</Span>}
      </Div>
      {/* In detail, as in a tab of its own: every step, and the end of a failed job's log. */}
      {detailed && job.steps && job.steps.length > 0 && (
        <Div $flex={{ direction: "vertical", gap: "xxs" }} $padding={{ left: "xl" }}>
          {job.steps.map((step) => (
            <StepRow key={`${step.number}-${step.name}`} step={step} />
          ))}
        </Div>
      )}
      {detailed && isFailed(job) && (
        <Div $padding={{ left: "xl" }}>
          <FailedLog repository={repository} runId={runId} job={job} />
        </Div>
      )}
    </Div>
  );
};

const RunDetails = observer(
  ({
    repository,
    run,
    version,
    onRerun,
    detailed,
  }: {
    repository: string;
    run: WorkflowRun;
    version: string;
    onRerun: () => void;
    detailed: boolean;
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
        {state.status === "loaded" &&
          state.jobs.map((job) => (
            <JobRow key={job.url} repository={repository} runId={run.databaseId} job={job} detailed={detailed} />
          ))}
      </Div>
    );
  },
);

/**
 * A version's workflows with their jobs: what the workflows dialog shows, and in detail, with every step and
 * the end of a failed job's log, what the workflows tab does.
 */
export const WorkflowRunsView = ({
  repository,
  row,
  onRerun,
  detailed = false,
}: {
  repository: string;
  row: VersionRuns;
  onRerun: () => void;
  detailed?: boolean;
}) => (
  <Div $flex={{ direction: "vertical", gap: "m" }}>
    {row.runs.map((run) => (
      <RunDetails
        key={run.databaseId}
        repository={repository}
        run={run}
        version={row.version.label}
        onRerun={onRerun}
        detailed={detailed}
      />
    ))}
  </Div>
);

/** What names a version's workflows: "76cd335", or "v1.2.0 · on main" for runs of the commit it was tagged on. */
export const workflowsTitleOf = (row: VersionRuns) => `${row.version.label}${row.runsOn ? ` · on ${row.runsOn}` : ""}`;
