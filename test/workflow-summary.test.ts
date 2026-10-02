import { describe, expect, it } from "vitest";
import { opensByDefault } from "../src/workflow-runs/run-status";
import { summaryOf } from "../src/workflow-runs/version";
import { run } from "./fixtures";

describe("summaryOf", () => {
  it("counts the workflows that passed, with the status asking most for attention", () => {
    const summary = summaryOf({ runs: [run("ci"), run("deploy", "completed", "failure", 2)] });

    expect(summary.text).toBe("1/2 workflows passed");
    expect(summary.status?.label).toBe("Failed");
  });

  it("says one workflow, and has no status without runs", () => {
    expect(summaryOf({ runs: [run("ci")] }).text).toBe("1/1 workflow passed");
    expect(summaryOf({ runs: [] })).toEqual({ text: "No workflow runs of its own", status: undefined });
  });
});

describe("opensByDefault", () => {
  it("folds what succeeded or was skipped", () => {
    expect(opensByDefault(run("ci"))).toBe(false);
    expect(opensByDefault(run("ci", "completed", "skipped"))).toBe(false);
  });

  it("opens what failed, was cancelled or still runs", () => {
    expect(opensByDefault(run("ci", "completed", "failure"))).toBe(true);
    expect(opensByDefault(run("ci", "completed", "cancelled"))).toBe(true);
    expect(opensByDefault(run("ci", "in_progress", ""))).toBe(true);
  });
});
