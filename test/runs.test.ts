import { describe, expect, it } from "vitest";
import { formatAge } from "../src/dashboard/format-time-ago";
import { overallStatusOf, runStatusOf } from "../src/workflow-runs/run-status";
import { shellQuote } from "../src/workflow-runs/shell-quote";
import { trackSourcesInjectable } from "../src/workflow-runs/track-sources.injectable";
import { toVersionRuns } from "../src/workflow-runs/version";
import { commit, run } from "./fixtures";

describe("runStatusOf", () => {
  it.each([
    ["in_progress", "", "In progress"],
    ["queued", "", "Queued"],
    ["completed", "success", "Success"],
    ["completed", "failure", "Failed"],
    ["completed", "startup_failure", "Failed"],
    ["completed", "timed_out", "Timed out"],
    ["completed", "action_required", "Action required"],
    ["completed", "cancelled", "Cancelled"],
    ["completed", "skipped", "Skipped"],
  ])("%s / %s → %s", (status, conclusion, label) => {
    expect(runStatusOf(run("build", status, conclusion)).label).toBe(label);
  });
});

describe("overallStatusOf", () => {
  it("shows what most needs attention", () => {
    const success = run("a");
    const failed = run("b", "completed", "failure");
    const running = run("c", "in_progress", "");

    expect(overallStatusOf([success, success]).label).toBe("Success");
    expect(overallStatusOf([success, failed]).label).toBe("Failed");
    expect(overallStatusOf([success, failed, running]).label).toBe("In progress");
  });
});

describe("toVersionRuns", () => {
  it("keeps the newest run of each workflow, by name", () => {
    const newest = [
      run("tests", "completed", "success", 3),
      run("build", "completed", "success", 2),
      run("tests", "completed", "failure", 1),
    ];

    const { runs } = toVersionRuns(commit("abc"), newest);

    expect(runs.map((each) => [each.workflowName, each.databaseId])).toEqual([
      ["build", 2],
      ["tests", 3],
    ]);
  });
});

describe("shellQuote", () => {
  it.each([
    ["main", "'main'"],
    ["feature/x y", "'feature/x y'"],
    ["it's", `'it'\\''s'`],
    ["$(rm -rf /)", "'$(rm -rf /)'"],
  ])("%s → %s", (value, expected) => {
    expect(shellQuote(value)).toBe(expected);
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-10-02T12:00:00Z");

  it.each([
    ["2026-10-02T11:59:30Z", "now"],
    ["2026-10-02T11:55:00Z", "5m"],
    ["2026-10-02T09:00:00Z", "3h"],
    ["2026-09-29T12:00:00Z", "3d"],
    ["2026-10-02T12:05:00Z", "now"], // a clock slightly behind is not the future
  ])("%s → %s", (at, expected) => {
    expect(formatAge(at, now)).toBe(expected);
  });
});

describe("releases and their runs", () => {
  const releases = JSON.stringify([
    { tagName: "v1.2.0", name: "v1.2.0", isPrerelease: false, publishedAt: "2026-10-01T08:00:00Z" },
  ]);
  const sha = "05c6a4f".padEnd(40, "0");
  const run = (workflowName: string, headBranch: string, conclusion = "success") => ({
    databaseId: workflowName.length + headBranch.length,
    workflowName,
    headBranch,
    status: "completed",
    conclusion,
  });

  const sourceRunning = (runs: object[]) => {
    const gh = async (command: string) => {
      if (command.includes("release list")) return releases;
      if (command.includes("repo view")) return "main\n";
      if (command.includes("run list")) return JSON.stringify(runs);
      if (command.includes("/commits/")) return JSON.stringify({ sha, title: "chore(main): release 1.2.0" });
      throw new Error(`unexpected ${command}`);
    };

    return (trackSourcesInjectable as any).instantiate({ inject: () => () => gh })()({
      repository: "o/app",
      track: "releases",
      branch: "",
      intervalMinutes: 5,
    });
  };

  it("shows a release's own runs when its tag started some", async () => {
    const { recent } = await sourceRunning([run("release", "v1.2.0"), run("ci", "main")]).all();

    expect(recent[0].runs.map((each: { workflowName: string }) => each.workflowName)).toEqual(["release"]);
    expect(recent[0].runsOn).toBeUndefined();
  });

  it("shows the tagged commit's runs on the default branch when the tag started none", async () => {
    const { recent } = await sourceRunning([
      run("ci", "main", "failure"),
      run("CodeQL", "main"),
      run("tests", "feature-x"),
    ]).all();

    expect(recent[0].runs.map((each: { workflowName: string }) => each.workflowName)).toEqual(["ci", "CodeQL"]);
    expect(recent[0].runsOn).toBe("main");
  });

  it("shows nothing when the commit only has runs of pull requests", async () => {
    const { recent } = await sourceRunning([run("tests", "feature-x")]).all();

    expect(recent[0].runs).toEqual([]);
    expect(recent[0].runsOn).toBeUndefined();
  });

  it("shows nothing when the commit has no runs at all", async () => {
    const { recent } = await sourceRunning([]).all();

    expect(recent[0].runs).toEqual([]);
    expect(recent[0].runsOn).toBeUndefined();
  });
});
