import { getInjectable2 } from "@k8slens/injectable";
import { action, computed, observable } from "mobx";
import { followedLabelOf, isSameWatch, type WatchedRepository } from "./watched-repository";
import { watchedRepositoriesStoreInjectable } from "./watched-repositories-store.injectable";

const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;
const defaultBranch = "main";
const defaultIntervalMinutes = 5;

export type Track = NonNullable<WatchedRepository["track"]>;
export type Notify = NonNullable<WatchedRepository["notify"]>;

export const watchedRepositoryFormInjectable = getInjectable2({
  id: "github-actions-watched-repository-form",

  instantiate: (di) => {
    const storeOf = di.inject(watchedRepositoriesStoreInjectable);

    return (clusterId: string) => {
      const store = storeOf(clusterId);

      const repository = observable.box("");
      const track = observable.box<Track>("branch");
      const branch = observable.box(defaultBranch);
      const includePrereleases = observable.box(true);
      const tagPattern = observable.box("");
      const intervalMinutes = observable.box(defaultIntervalMinutes);
      const notify = observable.box<Notify>("all");
      const editing = observable.box<WatchedRepository | undefined>(undefined, { deep: false });

      const draft = computed((): WatchedRepository =>
        track.get() === "releases"
          ? {
              repository: repository.get().trim(),
              track: "releases",
              branch: "",
              includePrereleases: includePrereleases.get(),
              tagPattern: tagPattern.get().trim() || undefined,
              intervalMinutes: intervalMinutes.get(),
              notify: notify.get(),
            }
          : {
              repository: repository.get().trim(),
              track: "branch",
              branch: branch.get().trim(),
              intervalMinutes: intervalMinutes.get(),
              notify: notify.get(),
            },
      );

      const error = computed(() => {
        const watch = draft.get();
        const previous = editing.get();

        if (watch.repository === "") return undefined;
        if (!repositoryPattern.test(watch.repository)) return 'Write the repository as "owner/name".';
        if (watch.track === "branch" && watch.branch === "") return "Name a branch.";
        if (watch.tagPattern && /\s/.test(watch.tagPattern))
          return "A tag pattern has no spaces, such as v* or artifact-contract/v*.";
        if (!(previous && isSameWatch(previous, watch)) && store.has(watch))
          return `${watch.repository} ${followedLabelOf(watch)} is already watched.`;

        return undefined;
      });

      const reset = action(() => {
        repository.set("");
        track.set("branch");
        branch.set(defaultBranch);
        includePrereleases.set(true);
        tagPattern.set("");
        intervalMinutes.set(defaultIntervalMinutes);
        notify.set("all");
        editing.set(undefined);
      });

      const form = {
        repository,
        track,
        branch,
        includePrereleases,
        tagPattern,
        intervalMinutes,
        notify,

        get isEditing() {
          return editing.get() !== undefined;
        },

        get error() {
          return error.get();
        },

        get canSubmit() {
          return draft.get().repository !== "" && error.get() === undefined;
        },

        edit: action((watch: WatchedRepository) => {
          repository.set(watch.repository);
          track.set(watch.track ?? "branch");
          branch.set(watch.branch || defaultBranch);
          includePrereleases.set(watch.includePrereleases ?? true);
          tagPattern.set(watch.tagPattern ?? "");
          intervalMinutes.set(watch.intervalMinutes);
          notify.set(watch.notify ?? "all");
          editing.set(watch);
        }),

        cancel: reset,

        submit: async () => {
          if (!form.canSubmit) return;

          const previous = editing.get();

          await (previous ? store.replace(previous, draft.get()) : store.add(draft.get()));
          reset();
        },
      };

      return form;
    };
  },
});
