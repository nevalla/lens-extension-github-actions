import { getSubscribableInjectableBunch } from "@k8slens/subscribable";
import { ColumnHeader } from "@k8slens/table-components";
import { reaction } from "mobx";
import { watchOnClusterInjectable } from "./watch-on-cluster.injectable";

/** What every table of a watch is rendered for: the cluster, and the watch as its key. */
export type WatchTableParams = [clusterId: string, watchKey: string];

type WatchOnCluster = ReturnType<ReturnType<(typeof watchOnClusterInjectable)["instantiate"]>>;

/**
 * The rows of a table of one watch on one cluster, pushed as they change for as long as the table is
 * on screen: `rowsOf` picks them, undefined while there are none to show yet.
 */
export const getWatchRowsBunch = <Row,>(
  id: string,
  rowsOf: (watchState: WatchOnCluster, clusterId: string, watchKey: string) => readonly Row[] | undefined,
) =>
  getSubscribableInjectableBunch<readonly Row[], WatchTableParams>()({
    id,
    source: {
      instantiate: (di) => {
        const watchOnCluster = di.inject(watchOnClusterInjectable);

        return () => (clusterId, watchKey) => ({
          start: ({ push }) => {
            const watchState = watchOnCluster(clusterId, watchKey);
            const stopWatching = watchState.watch();
            const stopPushing = reaction(
              () => rowsOf(watchState, clusterId, watchKey),
              (rows) => rows && push(rows),
              { fireImmediately: true },
            );

            return () => {
              stopPushing();
              stopWatching();
            };
          },
        });
      },
    },
  });

export const columnHeader = (text: string) => () => <ColumnHeader>{text}</ColumnHeader>;
