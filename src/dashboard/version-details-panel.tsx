import { DrawerItem, NoItemsDetailItem } from "@k8slens/details-panel-components";
import { A, Button, Div, Span } from "@k8slens/element-components";
import { ArrowOutwardIcon, CloseIcon, FullscreenIcon } from "@k8slens/icon";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { type ReactNode, useEffect } from "react";
import { openResourceDetailsInjectable } from "../deployments/open-resource-details.injectable";
import { entriesOfVersion } from "../deployments/version-entries";
import { isReleasesWatch, watchOfKey } from "../watched-repositories/watched-repository";
import { openVersionInjectable } from "../workflow-runs/open-version.injectable";
import { workflowsTitleOf } from "../workflow-runs/version";
import { EntryDot } from "./entry-dot";
import { formatAge } from "./format-time-ago";
import { selectedVersionInjectable } from "./selected-version.injectable";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";
import { WorkflowRunCards } from "./workflow-run-cards";
import { openWorkflowsTabInjectable } from "./workflows-tab.injectable";

const HeaderButton = ({
  onClick,
  tooltip,
  children,
}: {
  onClick: () => void;
  tooltip: string;
  children: ReactNode;
}) => (
  <Button $onClick={onClick} $tooltip={tooltip} $interactive $padding="xs">
    {children}
  </Button>
);

const Section = ({ heading, children }: { heading: string; children: ReactNode }) => (
  <Div $flex={{ direction: "vertical", gap: "m" }} $padding={{ vertical: "xl" }}>
    <Span $font={{ size: "xl" }}>{heading}</Span>
    <Div>{children}</Div>
  </Div>
);

const VersionDetails = observer(
  ({ clusterId, watchKey, versionId }: { clusterId: string; watchKey: string; versionId: string }) => {
    const watchState = useInject(watchOnClusterInjectable)(clusterId, watchKey);
    const selected = useInject(selectedVersionInjectable)(clusterId);
    const openVersion = useInject(openVersionInjectable)();
    const openWorkflowsTab = useInject(openWorkflowsTabInjectable)();
    const openResourceDetails = useInject(openResourceDetailsInjectable)();
    const watch = watchOfKey(watchKey);
    const releases = isReleasesWatch(watch);
    const row = watchState.rows.find((each) => each.version.id === versionId);

    if (!row) {
      return (
        <Div $padding="xl">
          <Span $color="textMuted">This version is no longer among the latest ones.</Span>
        </Div>
      );
    }

    const { version } = row;
    const entries = entriesOfVersion(row.services, row.syncs);

    return (
      <>
        <Div
          $flex={{ direction: "horizontal", gap: "s", verticalAlign: "center" }}
          $padding={{ vertical: "m", horizontal: "xl" }}
          $backgroundColor="backgroundSecondary"
        >
          <Span $font={{ size: "l", bold: true }} $flexChild>
            {releases ? "Release" : "Commit"}: {version.label}
          </Span>
          <HeaderButton onClick={() => void openVersion(version)} tooltip="Open on GitHub">
            <ArrowOutwardIcon $size="s" />
          </HeaderButton>
          <HeaderButton
            onClick={() => void openWorkflowsTab({ clusterId, watchKey, versionId, label: workflowsTitleOf(row) })}
            tooltip="Open the workflows in a tab, with each job's steps and the end of a failed one's log"
          >
            <FullscreenIcon $size="s" />
          </HeaderButton>
          <HeaderButton onClick={selected.close} tooltip="Close">
            <CloseIcon $size="s" />
          </HeaderButton>
        </Div>

        {/* The header stays put; the details scroll beneath it. */}
        <Div $padding={{ horizontal: "xl" }} $flexChild $overflow={{ y: "auto" }} $style={{ minHeight: 0 }}>
          <Section heading="Properties">
            <DrawerItem name="Message">{version.title}</DrawerItem>
            {version.author && <DrawerItem name="Author">{version.author}</DrawerItem>}
            <DrawerItem name={releases ? "Published" : "Committed"}>
              {formatAge(version.at)} ago ({new Date(version.at).toLocaleString()})
            </DrawerItem>
            <DrawerItem name={releases ? "Tag" : "Commit"}>
              <A onClick={() => void openVersion(version)} $color="link">
                {releases ? version.label : version.id}
              </A>
            </DrawerItem>
            <DrawerItem name={releases ? "Repository" : "Branch"}>
              {releases ? watch.repository : `${watch.repository} · ${watch.branch}`}
            </DrawerItem>
            {version.prerelease && <DrawerItem name="Pre-release">Yes</DrawerItem>}
          </Section>

          <Section heading="On this cluster">
            {!row.services ? (
              <NoItemsDetailItem>Reading what the cluster runs…</NoItemsDetailItem>
            ) : entries.length === 0 ? (
              <NoItemsDetailItem>Nothing in this cluster runs it.</NoItemsDetailItem>
            ) : (
              entries.map((entry) => (
                <DrawerItem
                  key={`${entry.label}:${entry.name}`}
                  name={
                    entry.resource ? (
                      <A
                        onClick={() => entry.resource && void openResourceDetails(clusterId, entry.resource)}
                        $color="link"
                      >
                        <EntryDot entry={entry} />
                      </A>
                    ) : (
                      <EntryDot entry={entry} />
                    )
                  }
                >
                  {entry.label}
                </DrawerItem>
              ))
            )}
          </Section>

          <Section heading="Workflows">
            <WorkflowRunCards
              repository={watch.repository}
              row={row}
              onRerun={() => void watchState.refresh()}
              place={JSON.stringify(["panel", clusterId, watchKey, versionId])}
              compact
            />
          </Section>
        </Div>
      </>
    );
  },
);

/**
 * A version's details, sliding in over the dashboard from the right as a Kubernetes resource's do over
 * its list: what it is, what of the cluster runs it, and its workflows.
 */
export const VersionDetailsPanel = observer(({ clusterId }: { clusterId: string }) => {
  const selected = useInject(selectedVersionInjectable)(clusterId);
  const current = selected.current;

  useEffect(() => {
    if (!current) return undefined;

    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && !event.defaultPrevented && selected.close();

    window.addEventListener("keydown", closeOnEscape);

    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [current, selected]);

  if (!current) return null;

  return (
    <Div
      $flex={{ direction: "vertical" }}
      $backgroundColor="backgroundPrimary"
      $style={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(760px, 70%)",
        boxShadow: "-4px 0 16px rgba(0, 0, 0, 0.35)",
        // Above the column resize handles of the tables beneath it.
        zIndex: 100,
      }}
    >
      <VersionDetails clusterId={clusterId} watchKey={current.watchKey} versionId={current.versionId} />
    </Div>
  );
});
