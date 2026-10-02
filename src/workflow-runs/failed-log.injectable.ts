import { getInjectable2 } from "@k8slens/injectable";
import { observable, runInAction } from "mobx";
import { type LogLine, failedLogLinesOf } from "./failed-log";
import { type GhProblem, ghProblemOf } from "./gh-problems";
import { ghInjectable } from "./gh.injectable";
import { shellQuote } from "./shell-quote";

export type FailedLogState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly lines: readonly LogLine[] }
  | { readonly status: "failed"; readonly problem: GhProblem };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The end of a failed job's log, asked for once when first shown: a finished job's log does not change. */
export const failedLogInjectable = getInjectable2({
  id: "github-actions-failed-log",

  instantiate: (di) => {
    const gh = di.inject(ghInjectable)();

    return (repository: string, runId: number, jobId: number) => {
      const state = observable.box<FailedLogState>({ status: "loading" }, { deep: false });
      let asked: Promise<void> | undefined;

      const load = async () => {
        try {
          const output = await gh(`run view ${runId} --repo ${shellQuote(repository)} --log-failed --job ${jobId}`);

          runInAction(() => state.set({ status: "loaded", lines: failedLogLinesOf(output) }));
        } catch (error) {
          // A log that could not be had is asked for again the next time it is shown.
          asked = undefined;
          runInAction(() => state.set({ status: "failed", problem: ghProblemOf(messageOf(error), repository) }));
        }
      };

      return {
        get state() {
          return state.get();
        },

        /** Asks for the log, unless it was asked for already. */
        load: () => (asked ??= load()),
      };
    };
  },
});
