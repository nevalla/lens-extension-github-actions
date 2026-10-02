import { openLinkInBrowserInjectionToken } from "@k8slens/electron-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import type { Version } from "./version";

export const openVersionInjectable = getInjectable2({
  id: "github-actions-open-version",
  consumptions: [openLinkInBrowserInjectionToken],

  instantiate: (di) => {
    const openLinkInBrowser = di.inject(openLinkInBrowserInjectionToken)();

    // A commit's page lists the checks its runs made; a release's page, what it ships.
    return () => (version: Pick<Version, "url">) => openLinkInBrowser(version.url);
  },
});
