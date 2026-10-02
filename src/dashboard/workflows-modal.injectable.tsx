import { A, Div, Span } from "@k8slens/element-components";
import { getInjectable2 } from "@k8slens/injectable";
import { PlainButton } from "@k8slens/input-components";
import { ModalContainer, ModalContent, ModalFooter, ModalHeader } from "@k8slens/modal-components";
import {
  getModalInjectableBunch,
  getModalKind,
  type ModalProps,
  openModalInjectionToken,
  useRespondFromModal,
} from "@k8slens/modal-contracts";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { watchOfKey } from "../watched-repositories/watched-repository";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";
import { WorkflowRunsView, workflowsTitleOf } from "./workflow-runs-view";
import { openWorkflowsTabInjectable } from "./workflows-tab.injectable";

/** A version's workflows and their jobs, over the dashboard. */
export const workflowsModalKind = getModalKind<[clusterId: string, watchKey: string, versionId: string], void>()(
  "workflows",
);

const WorkflowsModal = observer(
  ({ input: [clusterId, watchKey, versionId] }: ModalProps<typeof workflowsModalKind>) => {
    const respond = useRespondFromModal(workflowsModalKind);
    const watchState = useInject(watchOnClusterInjectable)(clusterId, watchKey);
    const openWorkflowsTab = useInject(openWorkflowsTabInjectable)();
    const row = watchState.rows.find((each) => each.version.id === versionId);
    const { repository } = watchOfKey(watchKey);

    const openInTab = () => {
      respond();
      if (row) void openWorkflowsTab({ clusterId, watchKey, versionId, label: workflowsTitleOf(row) });
    };

    return (
      <ModalContainer>
        <ModalHeader>
          Workflows of {repository} {row ? workflowsTitleOf(row) : ""}
        </ModalHeader>
        <ModalContent>
          {/* Long matrix builds scroll here rather than outgrowing the window. */}
          <Div $style={{ width: 720, maxWidth: "80vw", maxHeight: "65vh", overflowY: "auto" }}>
            {row ? (
              <WorkflowRunsView repository={repository} row={row} onRerun={() => void watchState.refresh()} />
            ) : (
              <Span $color="textMuted">This version is no longer among the latest ones.</Span>
            )}
          </Div>
        </ModalContent>
        <ModalFooter>
          <Div $flex={{ direction: "horizontal", gap: "l", verticalAlign: "center" }}>
            {row && (
              <A onClick={openInTab} $color="link" $tooltip="Keep it open in a tab of its own, next to the dashboard">
                Open in a tab
              </A>
            )}
            <PlainButton onClick={() => respond()}>Close</PlainButton>
          </Div>
        </ModalFooter>
      </ModalContainer>
    );
  },
);

export const workflowsModalBunch = getModalInjectableBunch({
  kind: workflowsModalKind,
  Component: WorkflowsModal,
  onClose: () => undefined,
});

export const openWorkflowsModalInjectable = getInjectable2({
  id: "github-actions-open-workflows-modal",
  consumptions: [openModalInjectionToken],

  instantiate: (di) => {
    const openModal = di.inject(openModalInjectionToken.for(workflowsModalKind).for(di.scopeIds))();

    return () => openModal;
  },
});
