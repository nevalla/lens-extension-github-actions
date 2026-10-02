import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rerunFailedJobsInjectable } from "../src/workflow-runs/rerun-failed-jobs.injectable";
import { durationOf, failedStepOf, isFinished, runJobsSchema } from "../src/workflow-runs/run-jobs";
import { runJobsInjectable } from "../src/workflow-runs/run-jobs.injectable";

describe("durationOf", () => {
  it.each([
    [{ startedAt: "2026-10-02T10:00:00Z", completedAt: "2026-10-02T10:00:45Z" }, "45s"],
    [{ startedAt: "2026-10-02T10:00:00Z", completedAt: "2026-10-02T10:02:10Z" }, "2m 10s"],
    [{ startedAt: "2026-10-02T10:00:00Z", completedAt: "2026-10-02T11:03:00Z" }, "1h 3m"],
    [{ startedAt: "2026-10-02T10:00:00Z", completedAt: null }, "5m 0s"], // still running
    [{ startedAt: null, completedAt: null }, undefined], // queued
  ])("%o → %s", (job, expected) => {
    expect(durationOf(job, Date.parse("2026-10-02T10:05:00Z"))).toBe(expected);
  });
});

describe("failedStepOf", () => {
  it("names the step a job failed in", () => {
    expect(
      failedStepOf({
        steps: [
          { name: "Checkout", status: "completed", conclusion: "success" },
          { name: "Run tests", status: "completed", conclusion: "failure" },
        ],
      }),
    ).toBe("Run tests");
    expect(failedStepOf({ steps: [] })).toBeUndefined();
    expect(failedStepOf({ steps: null })).toBeUndefined();
  });
});

describe("runJobsSchema", () => {
  it("reads what gh run view --json jobs prints", () => {
    const { jobs } = runJobsSchema.parse(
      JSON.parse(readFileSync(new URL("./gh-run-jobs.json", import.meta.url), "utf8")),
    );

    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every((job) => job.url.startsWith("https://github.com/"))).toBe(true);
  });
});

describe("runJobsInjectable", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const job = (status: string) => ({
    databaseId: 1,
    name: "build",
    status,
    conclusion: status === "completed" ? "success" : null,
    url: "https://github.com/o/app/x",
  });

  it("asks again while jobs run, and stops once they finished", async () => {
    let status = "in_progress";
    const commands: string[] = [];
    const gh = async (args: string) => (commands.push(args), JSON.stringify({ jobs: [job(status)] }));
    const jobs = (runJobsInjectable as any).instantiate({ inject: () => () => gh })("o/app", 42);

    jobs.watch("in_progress/");
    await vi.advanceTimersByTimeAsync(0);
    expect(jobs.state.jobs.every(isFinished)).toBe(false);

    status = "completed";
    await vi.advanceTimersByTimeAsync(15_000);
    const asked = commands.length;
    await vi.advanceTimersByTimeAsync(60_000);

    expect(jobs.state.jobs.every(isFinished)).toBe(true);
    expect(commands.length).toBe(asked);
    expect(commands[0]).toBe("run view 42 --repo 'o/app' --json jobs");
  });
});

describe("runJobsInjectable, after a re-run", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("asks again once, when the run's status changes", async () => {
    let calls = 0;
    const gh = async () => (calls++, JSON.stringify({ jobs: [] }));
    const jobs = (runJobsInjectable as any).instantiate({ inject: () => () => gh })("o/app", 42);

    const stop = jobs.watch("completed/failure");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toBe(1); // no jobs to wait for: finished

    stop();
    jobs.watch("queued/");
    void jobs.refresh(); // the re-run's own refresh joins the reload
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toBe(2);
  });
});

describe("rerunFailedJobsInjectable", () => {
  const rerunWith = (confirmed: boolean, gh: (args: string) => Promise<string>) => {
    const notifications: string[] = [];
    const inject = (token: any) => {
      if (token?.id === "github-actions-gh") return () => gh;
      if (String(token?.id ?? "").includes("notification"))
        return () => (message: string) => notifications.push(message);
      return () => async () => confirmed;
    };
    const rerun = (rerunFailedJobsInjectable as any).instantiate({ inject, scopeIds: [] })();

    return { rerun, notifications };
  };

  it("re-runs nothing unless confirmed", async () => {
    const gh = vi.fn(async () => "");
    const { rerun } = rerunWith(false, gh);

    expect(await rerun("o/app", 42, "build", "aaaaaaa")).toBe(false);
    expect(gh).not.toHaveBeenCalled();
  });

  it("re-runs the failed jobs once confirmed", async () => {
    const gh = vi.fn(async () => "");
    const { rerun } = rerunWith(true, gh);

    expect(await rerun("o/app", 42, "build", "aaaaaaa")).toBe(true);
    expect(gh).toHaveBeenCalledWith("run rerun 42 --repo 'o/app' --failed");
  });

  it("says why it could not", async () => {
    const { rerun, notifications } = rerunWith(true, async () => {
      throw new Error("gh: Resource not accessible by integration (HTTP 403)");
    });

    expect(await rerun("o/app", 42, "build", "aaaaaaa")).toBe(false);
    expect(notifications[0]).toContain("Could not re-run build");
  });
});
