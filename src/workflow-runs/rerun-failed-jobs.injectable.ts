import { getInjectable2 } from "@k8slens/injectable";
import { openModalInjectionToken } from "@k8slens/modal-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { ghProblemOf } from "./gh-problems";
import { ghInjectable } from "./gh.injectable";
import { rerunModalKind } from "./rerun-modal.injectable";
import { shellQuote } from "./shell-quote";

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Re-runs the failed jobs of a workflow run, once the user confirmed, and answers whether it did; what
 * shows the run checks again then, so the new attempt shows up.
 */
export const rerunFailedJobsInjectable = getInjectable2({
  id: "github-actions-rerun-failed-jobs",
  consumptions: [openModalInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const gh = di.inject(ghInjectable)();
    const confirm = di.inject(openModalInjectionToken.for(rerunModalKind).for(di.scopeIds))();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return () =>
      async (repository: string, runId: number, workflowName: string, version: string): Promise<boolean> => {
        if (!(await confirm(workflowName, version))) return false;

        try {
          await gh(`run rerun ${runId} --repo ${shellQuote(repository)} --failed`);

          return true;
        } catch (error) {
          const problem = ghProblemOf(messageOf(error), repository);

          showErrorNotification(`Could not re-run ${workflowName}: ${problem.title} ${problem.fix}`);

          return false;
        }
      };
  },
});
