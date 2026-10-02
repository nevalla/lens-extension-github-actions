import { CheckCircleIcon, ErrorIcon, ScheduleIcon } from "@k8slens/icon";
import type { FluxResource } from "../deployments/cluster-images";

export const FluxResourceIcon = ({ state }: { state: FluxResource["state"] }) => {
  switch (state) {
    case "ready":
      return <CheckCircleIcon $size="s" $color="success" />;
    case "reconciling":
      return <ScheduleIcon $size="s" $color="primary" />;
    case "failed":
      return <ErrorIcon $size="s" $color="critical" />;
  }
};
