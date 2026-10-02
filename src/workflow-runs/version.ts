import type { WorkflowRun } from "./workflow-run";

/** One version of what a watch follows: a commit of a branch, or a release. Newest first wherever listed. */
export interface Version {
  /** The commit's id, or the release's tag: what identifies it, and what an image is built from. */
  readonly id: string;
  /** What names it in a cell: the short commit id, or the tag. */
  readonly label: string;
  /** The first line of the commit message, or the release's name. */
  readonly title: string;
  /** When it was committed or published. */
  readonly at: string;
  readonly prerelease?: boolean;
  /** Its page on GitHub. */
  readonly url: string;
}

export interface VersionRuns {
  readonly version: Version;
  /** The newest run of each workflow, by workflow name. */
  readonly runs: readonly WorkflowRun[];
}

/** A version with the runs GitHub lists for it, newest first. */
export const toVersionRuns = (version: Version, newestFirst: readonly WorkflowRun[]): VersionRuns => ({
  version,
  // A workflow run again on the same commit replaces what it said before.
  runs: newestFirst
    .filter((run, index) => newestFirst.findIndex((each) => each.workflowName === run.workflowName) === index)
    .sort((a, b) => a.workflowName.localeCompare(b.workflowName)),
});
