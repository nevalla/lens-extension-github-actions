import { getInjectable2 } from "@k8slens/injectable";
import { observable, runInAction } from "mobx";
import { type GhProblem, ghProblemOf } from "./gh-problems";
import { ghInjectable } from "./gh.injectable";
import { isFinished, type RunJob, runJobsSchema } from "./run-jobs";
import { shellQuote } from "./shell-quote";
import { liveCheckSeconds } from "./track-activity.injectable";

export type RunJobsState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly jobs: readonly RunJob[] }
  | { readonly status: "failed"; readonly problem: GhProblem };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The jobs of one workflow run, asked for when first shown: once for a run whose jobs have all finished,
 * and again at the live interval while some are still running and something shows them.
 */
export const runJobsInjectable = getInjectable2({
  id: "github-actions-run-jobs",

  instantiate: (di) => {
    const gh = di.inject(ghInjectable)();

    return (repository: string, runId: number) => {
      const state = observable.box<RunJobsState>({ status: "loading" }, { deep: false });
      let watchers = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let loading: Promise<void> | undefined;
      // The run's status the jobs were last asked for: another one, as after a re-run, has other jobs.
      let lastStatus: string | undefined;

      // A run that failed before starting any job has none, and is as finished as one whose jobs all are.
      const finished = () => {
        const current = state.get();

        return current.status === "loaded" && current.jobs.every(isFinished);
      };

      // Like the checks of a watch, asking again would only fail again while gh needs the user.
      const waitsForUser = () => {
        const current = state.get();

        return current.status === "failed" && current.problem.waitsForUser;
      };

      const schedule = () => {
        clearTimeout(timer);
        if (watchers > 0 && !finished() && !waitsForUser())
          timer = setTimeout(() => void load(), liveCheckSeconds * 1000);
      };

      // One ask at a time: asking again meanwhile, as a re-run and its status changing both do, joins it.
      const load = () =>
        (loading ??= fetchJobs().finally(() => {
          loading = undefined;
          schedule();
        }));

      const fetchJobs = async () => {
        try {
          const { jobs } = runJobsSchema.parse(
            JSON.parse(await gh(`run view ${runId} --repo ${shellQuote(repository)} --json jobs`)),
          );

          runInAction(() => state.set({ status: "loaded", jobs }));
        } catch (error) {
          runInAction(() => state.set({ status: "failed", problem: ghProblemOf(messageOf(error), repository) }));
        }
      };

      return {
        get state() {
          return state.get();
        },

        /** Asks again now, as after re-running the run. */
        refresh: () => load(),

        /** Starts showing them, for the run in the status given; the function it returns stops. */
        watch: (runStatus: string) => {
          const changed = lastStatus !== undefined && lastStatus !== runStatus;

          lastStatus = runStatus;
          watchers++;
          if (changed || (watchers === 1 && !finished())) void load();

          return () => {
            if (--watchers === 0) clearTimeout(timer);
          };
        },
      };
    };
  },
});
