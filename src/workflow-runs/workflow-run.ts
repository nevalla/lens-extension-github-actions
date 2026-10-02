import { z } from "zod";

export const workflowRunSchema = z.object({
  databaseId: z.number(),
  workflowName: z.string(),
  headBranch: z.string(),
  status: z.string(),
  conclusion: z.string(),
});

export type WorkflowRun = z.infer<typeof workflowRunSchema>;

export const workflowRunJsonFields = Object.keys(workflowRunSchema.shape).join(",");
