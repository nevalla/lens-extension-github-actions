import { describe, expect, it } from "vitest";
import { daemonSetStatusOf, deploymentStatusOf, statefulSetStatusOf } from "../src/deployments/workload-status";

describe("deploymentStatusOf", () => {
  it("counts ready replicas and takes since when it is stable", () => {
    expect(
      deploymentStatusOf({
        metadata: { generation: 3 },
        spec: { replicas: 2 },
        status: {
          observedGeneration: 3,
          updatedReplicas: 2,
          availableReplicas: 2,
          readyReplicas: 2,
          conditions: [
            { type: "Available", lastUpdateTime: "2026-10-03T08:00:00Z" },
            { type: "Progressing", reason: "NewReplicaSetAvailable", lastUpdateTime: "2026-10-03T09:00:00Z" },
          ],
        },
      }),
    ).toEqual({ rolledOut: true, ready: 2, desired: 2, settledAt: "2026-10-03T09:00:00Z" });
  });

  it("is not stable while a rollout is under way", () => {
    expect(
      deploymentStatusOf({
        metadata: { generation: 4 },
        spec: { replicas: 2 },
        status: {
          observedGeneration: 4,
          updatedReplicas: 1,
          readyReplicas: 1,
          conditions: [{ type: "Progressing", reason: "ReplicaSetUpdated" }],
        },
      }),
    ).toEqual({ rolledOut: false, ready: 1, desired: 2, settledAt: undefined });
  });
});

describe("statefulSetStatusOf and daemonSetStatusOf", () => {
  it("count ready replicas, with no time they are stable since", () => {
    expect(statefulSetStatusOf({ spec: { replicas: 3 }, status: { updatedReplicas: 3, readyReplicas: 3 } })).toEqual({
      rolledOut: true,
      ready: 3,
      desired: 3,
    });
    expect(
      daemonSetStatusOf({
        status: { desiredNumberScheduled: 4, updatedNumberScheduled: 4, numberAvailable: 3, numberReady: 3 },
      }),
    ).toEqual({ rolledOut: false, ready: 3, desired: 4 });
  });
});
