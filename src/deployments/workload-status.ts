/** How a workload stands: whether it rolled out, how many of its replicas are ready, and since when it is stable. */
export interface WorkloadStatus {
  /** Every replica runs the current template. */
  readonly rolledOut: boolean;
  readonly ready: number;
  readonly desired: number;
  /** When it last settled, for a Deployment, the only kind that records it: see Workload's settledAt. */
  readonly settledAt?: string;
}

interface Condition {
  readonly type?: string;
  readonly reason?: string;
  readonly lastUpdateTime?: string;
}

export const deploymentStatusOf = (deployment: {
  metadata: { generation?: number };
  spec: { replicas?: number };
  status?: {
    observedGeneration?: number;
    updatedReplicas?: number;
    availableReplicas?: number;
    readyReplicas?: number;
    conditions?: readonly Condition[];
  };
}): WorkloadStatus => {
  const desired = deployment.spec.replicas ?? 1;
  const status = deployment.status ?? {};
  // Kubernetes stamps "NewReplicaSetAvailable" whenever the Deployment becomes complete again: after a rollout,
  // and also after a scale or a replica that came back, so it tells since when it is stable, not deployed.
  const settled = status.conditions?.find(
    (condition) => condition.type === "Progressing" && condition.reason === "NewReplicaSetAvailable",
  );
  return {
    rolledOut:
      (status.observedGeneration ?? 0) >= (deployment.metadata.generation ?? 0) &&
      (status.updatedReplicas ?? 0) === desired &&
      (status.availableReplicas ?? 0) >= desired,
    ready: status.readyReplicas ?? 0,
    desired,
    settledAt: settled?.lastUpdateTime,
  };
};

export const statefulSetStatusOf = (statefulSet: {
  spec: { replicas?: number };
  status?: { updatedReplicas?: number; readyReplicas?: number };
}): WorkloadStatus => {
  const desired = statefulSet.spec.replicas ?? 1;
  const ready = statefulSet.status?.readyReplicas ?? 0;

  return { rolledOut: (statefulSet.status?.updatedReplicas ?? 0) === desired && ready === desired, ready, desired };
};

export const daemonSetStatusOf = ({
  status,
}: {
  status?: {
    desiredNumberScheduled?: number;
    updatedNumberScheduled?: number;
    numberAvailable?: number;
    numberReady?: number;
  };
}): WorkloadStatus => {
  const desired = status?.desiredNumberScheduled ?? 0;

  return {
    rolledOut: (status?.updatedNumberScheduled ?? 0) === desired && (status?.numberAvailable ?? 0) === desired,
    ready: status?.numberReady ?? 0,
    desired,
  };
};
