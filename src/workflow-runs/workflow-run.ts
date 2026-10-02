import { z } from "zod";

export const workflowRunSchema = z.object({
  databaseId: z.number(),
  workflowName: z.string(),
  headBranch: z.string(),
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
