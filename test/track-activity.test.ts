import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchKeyOf } from "../src/watched-repositories/watched-repository";
import { trackActivityInjectable } from "../src/workflow-runs/track-activity.injectable";
import { commit } from "./fixtures";

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("checking when gh fails", () => {
  let failure: string | undefined;
  let calls = 0;

  const source = {
    headOf: async () => {
      calls++;
      if (failure) throw new Error(failure);
      return commit("aaaaaaa").id;
    },
    all: async () => {
      calls++;
      if (failure) throw new Error(failure);
      return { versions: [commit("aaaaaaa")], recent: [{ version: commit("aaaaaaa"), runs: [] }] };
    },
    runsOf: async (version: ReturnType<typeof commit>) => ({ version, runs: [] }),
  };

  const activityOf = () =>
    (trackActivityInjectable as any).instantiate({ inject: () => () => () => source })(
      watchKeyOf({ repository: "o/app", branch: "main", intervalMinutes: 5 }),
    );

  beforeEach(() => {
    vi.useFakeTimers();
    calls = 0;
  });

  afterEach(() => vi.useRealTimers());

  it("pauses while gh is signed out, and resumes when checked again", async () => {
    failure = "To get started with GitHub CLI, please run:  gh auth login";
    const activity = activityOf();

    activity.watch();
    await settle();
    await vi.advanceTimersByTimeAsync(10 * 60_000);

    expect(activity.state.problem.cause).toBe("not-signed-in");
    expect(calls).toBe(1);

    failure = undefined;
    await activity.refresh();
    await vi.advanceTimersByTimeAsync(61_000);

    expect(activity.state.status).toBe("loaded");
    expect(calls).toBeGreaterThan(2);
  });

  it("checks again when something new follows a paused watch", async () => {
    failure = "gh: Bad credentials (HTTP 401)";
    const activity = activityOf();

    activity.watch();
    await settle();
    failure = undefined;
    activity.watch();
    await settle();

    expect(activity.state.status).toBe("loaded");
  });

  it("keeps checking while GitHub cannot be reached", async () => {
    failure = undefined;
    const activity = activityOf();

    activity.watch();
    await settle();
    failure = "error connecting to api.github.com";
    await vi.advanceTimersByTimeAsync(61_000);
    const callsWhileOffline = calls;
    await vi.advanceTimersByTimeAsync(61_000);

    expect(activity.state.warning?.cause).toBe("offline");
    expect(calls).toBeGreaterThan(callsWhileOffline);
  });
});
