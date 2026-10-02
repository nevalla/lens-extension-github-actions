import { describe, expect, it } from "vitest";
import { failedLogLinesOf } from "../src/workflow-runs/failed-log";
import { failedLogInjectable } from "../src/workflow-runs/failed-log.injectable";

// Shaped like what "gh run view --log-failed" prints: job, step and timestamp columns, a byte-order mark
// on the first line of a step, colours, and GitHub's grouping and error markers.
const output = [
  "tests\tRun tests\t﻿2026-10-01T08:00:00.0000000Z ##[group]Run npm test",
  "tests\tRun tests\t2026-10-01T08:00:00.1000000Z npm test",
  "tests\tRun tests\t2026-10-01T08:00:00.2000000Z ##[endgroup]",
  "tests\tRun tests\t2026-10-01T08:00:01.0000000Z",
  "tests\tRun tests\t2026-10-01T08:00:05.0000000Z \u001b[31m✗ adds numbers\u001b[0m",
  "tests\tRun tests\t2026-10-01T08:00:05.1000000Z ##[warning]Node.js 16 actions are deprecated.",
  "tests\tRun tests\t2026-10-01T08:00:05.2000000Z ##[error]Process completed with exit code 1.",
  "",
].join("\n");

describe("failedLogLinesOf", () => {
  it("keeps what the log says, without its columns, colours and grouping", () => {
    expect(failedLogLinesOf(output)).toEqual([
      { text: "npm test", kind: "plain" },
      { text: "✗ adds numbers", kind: "plain" },
      { text: "Node.js 16 actions are deprecated.", kind: "warning" },
      { text: "Process completed with exit code 1.", kind: "error" },
    ]);
  });

  it("marks the errors and warnings of Kubernetes' tools, which log in klog's format", () => {
    const klog = [
      'e2e\tCreate cluster\t2026-10-01T08:00:00.0000000Z E1002 14:09:14.046485   12195 memcache.go:381] "Couldn\'t get current server API group list"',
      "e2e\tCreate cluster\t2026-10-01T08:00:00.1000000Z W1002 14:09:15.000001   12195 loader.go:222] Config not found",
      "e2e\tCreate cluster\t2026-10-01T08:00:00.2000000Z E2E tests failed",
    ].join("\n");

    expect(failedLogLinesOf(klog).map((line) => line.kind)).toEqual(["error", "warning", "plain"]);
  });

  it("keeps the last lines only", () => {
    expect(failedLogLinesOf(output, 2).map((line) => line.kind)).toEqual(["warning", "error"]);
  });
});

describe("failedLogInjectable", () => {
  it("asks once, and again after it could not", async () => {
    let calls = 0;
    let fail = true;
    const gh = async (args: string) => {
      calls++;
      if (fail) throw new Error("gh: log not found");
      expect(args).toBe("run view 1 --repo 'o/app' --log-failed --job 2");
      return output;
    };
    const log = (failedLogInjectable as any).instantiate({ inject: () => () => gh })("o/app", 1, 2);

    await log.load();
    expect(log.state.status).toBe("failed");

    fail = false;
    await log.load();
    await log.load();

    expect(log.state.status).toBe("loaded");
    expect(calls).toBe(2);
  });
});
