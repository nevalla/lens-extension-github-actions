import { getInjectable2 } from "@k8slens/injectable";
import { action, observable } from "mobx";

/** Which version's workflows are shown in detail, for one watch on one cluster; none at first. */
export const selectedVersionInjectable = getInjectable2({
  id: "github-actions-selected-version",

  instantiate: () => (_clusterId: string, _watchKey: string) => {
    const selected = observable.box<string | undefined>(undefined);

    return {
      get id() {
        return selected.get();
      },

      /** Shows a version's workflows, or hides them when they were shown already. */
      toggle: action((id: string) => selected.set(selected.get() === id ? undefined : id)),

      clear: action(() => selected.set(undefined)),
    };
  },
});
