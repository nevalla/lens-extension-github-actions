# Changelog

What changed in each version of this extension, newest first.

## 0.2.0

- Added a status bar item showing how the cluster you are looking at stands, opening its dashboard when clicked.
- Added a GitHub Actions item under each cluster in the navigator, opening the cluster's GitHub Actions dashboard. For each watched branch it summarises how many versions the cluster runs, lists each service with the commit it runs, how far behind it is, the Flux resource that applies it, the chart its HelmRelease installs and a newer chart on its way, and how far Flux has got with a newer build, and shows the latest commits with their CI result and the services that run them. It checks GitHub every 15 seconds while runs are unfinished or a deployment is under way, and once a minute for new commits otherwise, and opens a commit's checks on GitHub when clicked. A cluster with nothing set up is offered to configure GitHub Actions.
- A watched branch that a Flux GitRepository of the cluster follows, such as a GitOps repository, shows the Kustomizations applying it, and which commit each fetched, is applying, applied, or failed to apply.
- Added **GitHub Actions settings** to the right-click menu of every cluster, where you choose which GitHub repositories to watch for that cluster, following either the commits of a branch or the repository's releases, with or without pre-releases, and optionally only those whose tag matches a pattern such as `v*`.

## 0.1.0

- Created the extension.
