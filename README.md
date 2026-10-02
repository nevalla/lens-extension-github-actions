# GitHub Actions for Lens

Keep an eye on the GitHub Actions workflow runs behind each of your clusters, without leaving Lens.

## Features

- A **GitHub Actions** item under every cluster in the navigator, opening that cluster's dashboard of the latest commits or releases of each watched repository, with the status of their workflow runs and whether the cluster already runs them.
- An item in the status bar saying how the cluster you are looking at, or looked at last, stands: **Up to date**, **Behind**, **Deploying**, **Failing** or **Unreachable**, with the reason on hover. Click it to open the cluster's dashboard. It shows only for a cluster something is watched for. While it shows, it keeps that cluster's GitHub checks and cluster watches running, even with the dashboard closed.
- **GitHub Actions settings** in every cluster's right-click menu, where each cluster gets its own list of watched GitHub repositories, each following a branch's commits or the repository's releases, and how often to check it.

## Usage

Expand a cluster in the navigator and click **GitHub Actions** to open its dashboard. If nothing is set up for the cluster yet, click **Configure GitHub Actions** there, or right-click the cluster and choose **GitHub Actions settings**.

In the settings, enter a repository as `owner/name` and choose what to follow: **the commits of a branch** (`main` by default), for clusters that deploy every commit, or **releases**, with or without pre-releases such as release candidates, for clusters that deploy tagged releases. An optional tag pattern keeps only the releases whose tag matches, where `*` stands for anything: `v*` for a repository that also releases other things under tags such as `artifact-contract/v0.2.0`. Pick how often to refresh everything while nothing is happening, and click **Add**. Watched repositories show on the dashboard. Use **Edit** to change a repository's branch or check interval, and **Remove** to stop watching it. Each cluster's list is kept across restarts of Lens.

The dashboard opens with a banner saying how the cluster stands: **Up to date**, **Behind**, **Deploying**, or **Failing** when CI fails on a branch's latest commit or Flux fails to apply a service. Below it, for each watched repository:

- **Cards** for how many services run the latest commit, how many versions are running, and how many recent commits pass their workflows.
- **Services**: a table of every service the cluster runs from a build of the last 30 commits or releases, named after its image (such as `lens-cloud-backend`), with the version it runs and how many commits or releases behind the latest it is. Its **Flux** column names the Kustomization or HelmRelease that applies it, with its status and, for a HelmRelease, the chart version installed. When Flux has a newer chart, such as one built from a commit to the chart in the repository, the status says so while it waits to install, is installing (database migrations run then, for instance), or failed to install, and the recent commits mark which commit the installed chart was built from. When Flux image automation has picked up a newer build, the status follows it through Flux: **selected** by an ImagePolicy, **committed** to the GitOps repository by an ImageUpdateAutomation, **applying**, or **failed to apply**, then **rolling out**. Hover a service to see its workloads and Flux resources, and Flux's message when applying fails. Click a service to open its workload's details, and the Flux resource to open its details.
- **Flux syncs**, for a branch a Flux GitRepository of the cluster follows: a table of the Kustomizations applying it, with the commit each applied and a newer one on its way, fetched, being applied, or failed to apply (Flux's message on hover). This is what a GitOps repository, which deploys manifests rather than images, is followed by: watch it like any branch.
- **Recent commits** or **Recent releases**: a table of the five latest, each with its commit message (for a release, the message of the commit it was tagged on), its workflow results (hover for each workflow) and the services of the cluster that run its build. Click a commit id or tag to open it on GitHub.

For a branch, a service is recognised by the commit id, in full or abbreviated to at least 7 characters, in its image's tag, as in `backend:main-76cd335`. For releases, by its image's tag being the release's tag, with or without a leading `v`, as in `backend:v2026.9.3-rc.1`. The cluster's Deployments, StatefulSets and DaemonSets are read, and Flux's Kustomizations, HelmReleases, ImagePolicies and ImageUpdateAutomations when the cluster has them. A build counts as committed once an ImageUpdateAutomation next to its ImagePolicy has pushed after the build's commit was made, since Flux does not record which of its commits carries which tag. Opening the dashboard connects Lens to the cluster. If the cluster cannot be read, for instance while its connection is down, the dashboard says so and tries again every 30 seconds.

While the dashboard is open, the cluster is followed live, and GitHub is checked as often as there is something to see. While workflow runs are unfinished, or a service is on its way through Flux or rolling out, it checks every 15 seconds, asking only about the commits whose runs have not finished (**live** in the header). Otherwise it checks once a minute whether a new commit has landed, and refreshes everything at the branch's check interval. If GitHub's rate limit is reached, it waits for the check interval before trying again. The refresh button checks right away.

## Requirements

The workflow runs are read with the [GitHub CLI](https://cli.github.com/). Install it and sign in with `gh auth login` before using the dashboard.

What changed in each version is in [CHANGELOG.md](./CHANGELOG.md).
