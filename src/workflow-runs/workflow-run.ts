import { z } from "zod";

export const workflowRunSchema = z.object({
  databaseId: z.number(),
  workflowName: z.string(),
  headBranch: z.string(),
  /** The commit it ran on. */
  headSha: z.string(),
  /** What started it: "push", "pull_request", "release", "schedule"…, or "dynamic" for GitHub's own automation. */
  event: z.string(),
  status: z.string(),
  conclusion: z.string(),
});

export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const workflowRunJsonFields = Object.keys(workflowRunSchema.shape).join(",");

/**
 * Whether a version started the run. GitHub's own automation ("dynamic", such as Dependabot's updates or
 * Copilot's reviews) is recorded against whatever commit a branch was at when it ran, without building or
 * testing it, so it says nothing of the commit. A scheduled run does build the commit the branch is at.
 */
export const isStartedByVersion = (run: Pick<WorkflowRun, "event">) => run.event !== "dynamic";

export const runUrlOf = (repository: string, run: Pick<WorkflowRun, "databaseId">) =>
  `https://github.com/${repository}/actions/runs/${run.databaseId}`;

/**
 * The runs of a commit: those GitHub answers asking for the commit, with those of it among the repository's
 * latest runs. Asked by commit, GitHub answers from an index that can miss runs that started minutes ago, or
 * more; the list of the latest runs is current. Newest first, as GitHub lists them.
 */
export const runsOfCommitWith = (
  sha: string,
  askedByCommit: readonly WorkflowRun[],
  latest: readonly WorkflowRun[],
): WorkflowRun[] =>
  [...askedByCommit, ...latest.filter((run) => run.headSha === sha)]
    .filter((run, index, runs) => runs.findIndex((each) => each.databaseId === run.databaseId) === index)
    .sort((a, b) => b.databaseId - a.databaseId);
