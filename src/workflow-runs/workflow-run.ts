import { z } from "zod";

export const workflowRunSchema = z.object({
  databaseId: z.number(),
  displayTitle: z.string(),
  workflowName: z.string(),
  headBranch: z.string(),
  headSha: z.string(),
  event: z.string(),
  status: z.string(),
  conclusion: z.string(),
  createdAt: z.string(),
  url: z.string(),
});

export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const workflowRunJsonFields = Object.keys(workflowRunSchema.shape).join(",");
