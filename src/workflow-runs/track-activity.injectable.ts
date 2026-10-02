import { getInjectable2 } from "@k8slens/injectable";
import { observable, runInAction } from "mobx";
import { watchOfKey } from "../watched-repositories/watched-repository";
import { trackSourcesInjectable } from "./track-sources.injectable";
import type { Version, VersionRuns } from "./version";

/** How often the branch is checked while something is moving: a run unfinished, or a deployment under way. */
export const liveCheckSeconds = 15;
/** How often the newest version is checked for while nothing is moving. */
const idleHeadCheckSeconds = 60;
/** A version this young with no runs yet is expected to start some. */
const awaitingRunsMinutes = 10;

export type TrackActivityState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      /** The latest versions, newest first. */
      readonly versions: readonly Version[];
      /** The most recent of them, with their runs. */
      readonly recent: readonly VersionRuns[];
      readonly checkedAt: Date;
      /** Live while something is moving, so it is checked every {@link liveCheckSeconds}. */
      readonly mode: "live" | "idle";
      /** Why the last check did not go through, while what was had before stands. */
      readonly warning?: string;
    }
  | { readonly status: "failed"; readonly message: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const isRateLimit = (message: string) => /rate limit/i.test(message);

const isUnfinished = ({ version, runs }: VersionRuns, now: number) =>
  runs.some((run) => run.status !== "completed") ||
  (runs.length === 0 && now - new Date(version.at).getTime() < awaitingRunsMinutes * 60_000);

/**
 * The latest versions of a watch and their runs, for as long as something watches them. Checked
 * often while runs are unfinished or a watcher says a deployment is under way, and rarely otherwise:
 * then only the newest version is asked for, which is what tells a new one has landed.
 */
export const trackActivityInjectable = getInjectable2({
  id: "github-actions-track-activity",

  instantiate: (di) => {
    const sourceOf = di.inject(trackSourcesInjectable)();

    return (watchKey: string) => {
      const watch = watchOfKey(watchKey);
      const { intervalMinutes } = watch;
      const source = sourceOf(watch);
      const state = observable.box<TrackActivityState>({ status: "loading" }, { deep: false });
      const busyWatchers = new Set<() => boolean>();
      let watchers = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let checking: Promise<void> | undefined;
      let lastFullCheck = 0;

      const loaded = () => {
        const current = state.get();

        return current.status === "loaded" ? current : undefined;
      };

      const isLive = (recent: readonly VersionRuns[]) => {
        const now = Date.now();

        return recent.some((each) => isUnfinished(each, now)) || [...busyWatchers].some((isBusy) => isBusy());
      };

      const set = (recent: readonly VersionRuns[], versions: readonly Version[], warning?: string) =>
        runInAction(() =>
          state.set({
            status: "loaded",
            versions,
            recent,
            checkedAt: new Date(),
            mode: isLive(recent) ? "live" : "idle",
            warning,
          }),
        );

      const checkAll = async () => {
        const { versions, recent } = await source.all();

        lastFullCheck = Date.now();
        set(recent, versions);
      };

      /** Asks again only for what can have changed since the last check. */
      const checkChanges = async () => {
        const previous = loaded();

        if (!previous || Date.now() - lastFullCheck >= intervalMinutes * 60_000) return checkAll();
        if ((await source.headOf()) !== previous.versions[0]?.id) return checkAll();

        const now = Date.now();
        const recent = await Promise.all(
          previous.recent.map((each) => (isUnfinished(each, now) ? source.runsOf(each.version) : each)),
        );

        set(recent, previous.versions);
      };

      const nextCheckInSeconds = () => {
        const current = loaded();

        if (current?.warning && isRateLimit(current.warning)) return intervalMinutes * 60;

        return current?.mode === "live" ? liveCheckSeconds : idleHeadCheckSeconds;
      };

      const schedule = () => {
        clearTimeout(timer);
        if (watchers > 0) timer = setTimeout(() => void check(checkChanges), nextCheckInSeconds() * 1000);
      };

      const check = (how: () => Promise<void>) =>
        (checking ??= how()
          .catch((error) => {
            const previous = loaded();
            const message = messageOf(error);

            runInAction(() =>
              state.set(
                previous
                  ? {
                      ...previous,
                      warning: isRateLimit(message)
                        ? `GitHub's rate limit is reached; checking again in ${intervalMinutes} min.`
                        : message,
                    }
                  : { status: "failed", message },
              ),
            );
          })
          .finally(() => {
            checking = undefined;
            schedule();
          }));

      return {
        get state() {
          return state.get();
        },

        refresh: () => check(checkAll),

        /**
         * Starts checking; the function it returns stops. `isBusy` keeps the checks live while it says
         * something is under way that new runs or commits may follow, such as a deployment.
         */
        watch: (isBusy?: () => boolean) => {
          if (isBusy) busyWatchers.add(isBusy);
          if (watchers++ === 0) void check(loaded() ? checkChanges : checkAll);

          return () => {
            if (isBusy) busyWatchers.delete(isBusy);
            if (--watchers === 0) clearTimeout(timer);
          };
        },
      };
    };
  },
});
