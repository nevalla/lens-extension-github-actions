import { Div, Span } from "@k8slens/element-components";
import { type ServiceRow, serviceStatusOf } from "./flux-stage";

const short = (sha: string) => sha.slice(0, 7);

const stageExplanations = {
  selected: "An ImagePolicy has selected the image; image automation has not committed it yet.",
  committed: "Image automation has pushed to the GitOps repository since; waiting for Flux to apply it.",
  applying: "The Kustomization or HelmRelease is reconciling.",
  failed: "The Kustomization or HelmRelease failed to apply.",
} as const;

const chartStageLabels = {
  waiting: "built by Flux, waiting to install",
  upgrading: "installing",
  failed: "failed to install",
} as const;

export const ServiceTooltip = ({ service }: { service: ServiceRow }) => (
  <Div $flex={{ direction: "vertical", gap: "xs" }}>
    <Span $font={{ bold: true }}>
      {service.name}: {serviceStatusOf(service)}
    </Span>

    {service.pickedUp && <Span $color="textMuted">{stageExplanations[service.pickedUp.stage]}</Span>}

    <Div $flex={{ direction: "vertical", gap: "xxs" }}>
      {service.workloads.map((workload) => (
        <Span key={`${workload.kind}/${workload.namespace}/${workload.name}`}>
          {workload.kind} {workload.namespace}/{workload.name}
          {workload.rolledOut ? "" : " (rolling out)"}
        </Span>
      ))}
      {service.pickedUp?.imageSelections.map((selection) => (
        <Span key={`${selection.namespace}/${selection.name}`}>
          ImagePolicy {selection.namespace}/{selection.name} selected {service.pickedUp!.label}
        </Span>
      ))}
      {service.pickedUp?.imageAutomations.map((automation) => (
        <Span key={`${automation.namespace}/${automation.name}`}>
          ImageUpdateAutomation {automation.namespace}/{automation.name} pushed
          {automation.lastPushCommit ? ` ${short(automation.lastPushCommit)}` : ""}
        </Span>
      ))}
      {service.flux && (
        <Span>
          {service.flux.kind} {service.flux.namespace}/{service.flux.name}: {service.flux.state}
          {service.flux.revision ? ` at ${service.flux.revision}` : ""}
        </Span>
      )}
      {service.chart && (
        <Span>
          Chart {service.chart.applied ?? "not installed"}
          {service.chart.pending
            ? `, ${service.chart.pending.version} ${chartStageLabels[service.chart.pending.stage]}`
            : ""}
          {service.chart.sourceCommit
            ? `, built from ${service.chart.source?.label ?? service.chart.sourceCommit.slice(0, 7)}`
            : ""}
        </Span>
      )}
    </Div>

    {service.flux?.state === "failed" && service.flux.message && <Span $color="critical">{service.flux.message}</Span>}
  </Div>
);
