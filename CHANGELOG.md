# Changelog

What changed in each version of this extension, newest first.

## 0.1.0

First release.

- A **GitHub Actions** item under each cluster in the navigator opens the cluster's dashboard: a health banner, and for each watched repository the latest commits or releases with their workflow results, the services the cluster runs of them and how far behind each is, and the Kustomizations applying a GitOps repository.
- Shows the Argo CD Application that deploys each service, and the Applications syncing a watched branch, with what each synced, is syncing, or failed to sync.
- Follows a newer build through Flux: selected by image automation, committed to the GitOps repository, applied by its Kustomization or HelmRelease, Helm chart upgrades (where migrations run), the rollout, or failing to apply, with Flux's message.
- **GitHub Actions settings** in every cluster's right-click menu: choose which repositories to watch for that cluster, following the commits of a branch, or releases with or without pre-releases, optionally only those whose tag matches a pattern such as `v*`.
- A status bar item shows how the cluster you are looking at stands, and opens its dashboard.
- Notifies when services go live on a newer version, CI fails, something fails to apply, or the cluster or GitHub cannot be read, for the clusters followed; each watch chooses which.
- Says why reading GitHub fails and what to do, such as gh not installed or signed out, and pauses checking until you check again when only you can fix it.
- Checks GitHub through the GitHub CLI every 15 seconds while runs are unfinished or a deployment is under way, and once a minute for new commits otherwise. Links open commits, releases and Kubernetes resources.
