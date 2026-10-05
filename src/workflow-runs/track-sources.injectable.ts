import { getInjectable2 } from "@k8slens/injectable";
import { z } from "zod";
import { isReleasesWatch, tagMatches, type WatchedRepository } from "../watched-repositories/watched-repository";
import { ghInjectable } from "./gh.injectable";
import { shellQuote } from "./shell-quote";
import { toVersionRuns, type Version, type VersionRuns } from "./version";
import { runsOfCommitWith, type WorkflowRun, workflowRunJsonFields, workflowRunSchema } from "./workflow-run";

/** How far back a running service can be placed. */
export const versionsAsked = 30;
/** Releases asked for when only those of a tag pattern count, so enough of them are left. */
const releasesAskedForPattern = 100;
/** The versions whose runs are shown. */
export const versionsWithRuns = 5;
// Comfortably more than the workflows one commit triggers.
const runsAskedPerCommit = 30;
// The repository's latest runs, which the runs of its newest commits are among, for a busy one too.
const latestRunsAsked = 100;

const commitsJq = `[.[] | {sha, title: (.commit.message | split("\\n")[0]), committedAt: .commit.committer.date, author: (.author.login // .commit.author.name)}]`;

const commitJq = `{sha, title: (.commit.message | split("\\n")[0])}`;

const commitSchema = z.object({
  sha: z.string(),
  title: z.string(),
  committedAt: z.string(),
  author: z.string().nullish(),
});

const releaseSchema = z.object({
  tagName: z.string(),
  name: z.string(),
  isPrerelease: z.boolean(),
  publishedAt: z.string(),
});

/** Where the versions of one watch come from. */
export interface TrackSource {
  /** The newest version, in one call: what tells a new one has landed. */
  readonly headOf: () => Promise<string | undefined>;
  /** The latest versions, newest first, and the runs of the most recent of them. */
  readonly all: () => Promise<{ versions: readonly Version[]; recent: readonly VersionRuns[] }>;
  /** The runs of one version again, for a version whose runs have not all finished. */
  readonly runsOf: (version: Version) => Promise<VersionRuns>;
}

export const trackSourcesInjectable = getInjectable2({
  id: "github-actions-track-sources",

  instantiate: (di) => {
    const gh = di.inject(ghInjectable)();
    const ghJson = async (args: string) => JSON.parse(await gh(args));

    const runList = async (repository: string, extraArgs: string, limit: number) =>
      z
        .array(workflowRunSchema)
        .parse(
          await ghJson(
            `run list --repo ${shellQuote(repository)}${extraArgs} --limit ${limit} --json ${workflowRunJsonFields}`,
          ),
        );

    // Versions rechecked together each ask for the latest runs: they share the one answer while it is coming.
    const latestInFlight = new Map<string, Promise<WorkflowRun[]>>();
    const latestRunsOf = (repository: string) => {
      const kept = latestInFlight.get(repository);

      if (kept) return kept;

      const latest = runList(repository, "", latestRunsAsked).finally(() => latestInFlight.delete(repository));

      latestInFlight.set(repository, latest);

      return latest;
    };

    const runsOfCommit = async (repository: string, sha: string, latest: readonly WorkflowRun[]) =>
      runsOfCommitWith(sha, await runList(repository, ` --commit ${shellQuote(sha)}`, runsAskedPerCommit), latest);

    // Asked for the id alone, GitHub answers with just that rather than the whole commit and its diff.
    const commitOf = async (repository: string, ref: string) =>
      (
        await gh(
          `api -H ${shellQuote("Accept: application/vnd.github.sha")} ${shellQuote(`repos/${repository}/commits/${encodeURIComponent(ref)}`)}`,
        )
      ).trim();

    const taggedCommitOf = async (repository: string, tag: string) =>
      z
        .object({ sha: z.string(), title: z.string() })
        .parse(
          await ghJson(
            `api ${shellQuote(`repos/${repository}/commits/${encodeURIComponent(tag)}`)} --jq ${shellQuote(commitJq)}`,
          ),
        );

    /**
     * Runs are asked per commit, because GitHub answers a filter by branch from an index that lags
     * behind by weeks on busy repositories. A run's branch is the tag for a release's runs, and a pull
     * request from another branch may run on the same commit, so only the runs of what is followed count.
     */
    const runsOf = async (
      repository: string,
      ref: string,
      sha: string,
      version: Version,
      latest: readonly WorkflowRun[],
    ) =>
      toVersionRuns(
        version,
        (await runsOfCommit(repository, sha, latest)).filter((run) => run.headBranch === ref),
      );

    const branchSource = (repository: string, branch: string): TrackSource => {
      const latestCommits = async () =>
        z
          .array(commitSchema)
          .parse(
            await ghJson(
              `api ${shellQuote(`repos/${repository}/commits?sha=${encodeURIComponent(branch)}&per_page=${versionsAsked}`)} --jq ${shellQuote(commitsJq)}`,
            ),
          )
          .map((commit): Version => ({
            id: commit.sha,
            label: commit.sha.slice(0, 7),
            title: commit.title,
            at: commit.committedAt,
            author: commit.author ?? undefined,
            url: `https://github.com/${repository}/commit/${commit.sha}`,
          }));

      return {
        headOf: () => commitOf(repository, branch),

        all: async () => {
          const [versions, latest] = await Promise.all([latestCommits(), latestRunsOf(repository)]);
          const recent = await Promise.all(
            versions
              .slice(0, versionsWithRuns)
              .map((version) => runsOf(repository, branch, version.id, version, latest)),
          );

          return { versions, recent };
        },

        runsOf: async (version) => runsOf(repository, branch, version.id, version, await latestRunsOf(repository)),
      };
    };

    const releasesSource = (repository: string, includePrereleases: boolean, tagPattern?: string): TrackSource => {
      const latestReleases = async () =>
        z
          .array(releaseSchema)
          .parse(
            await ghJson(
              `release list --repo ${shellQuote(repository)} --limit ${tagPattern ? releasesAskedForPattern : versionsAsked} --exclude-drafts --json tagName,name,isPrerelease,publishedAt`,
            ),
          )
          .filter((release) => (includePrereleases || !release.isPrerelease) && tagMatches(tagPattern, release.tagName))
          .slice(0, versionsAsked)
          .map((release): Version => ({
            id: release.tagName,
            label: release.tagName,
            title: release.name || release.tagName,
            at: release.publishedAt,
            prerelease: release.isPrerelease,
            url: `https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tagName)}`,
          }));

      // A release's tag rarely moves, so what it points to is asked for once and kept until the extension
      // reloads: a tag force-moved meanwhile shows its old commit until then.
      const taggedCommits = new Map<string, Promise<{ sha: string; title: string }>>();
      const taggedCommitOfRelease = (tag: string) => {
        const kept = taggedCommits.get(tag);

        if (kept) return kept;

        const commit = taggedCommitOf(repository, tag);

        taggedCommits.set(tag, commit);
        // One that failed is asked for again next time.
        commit.catch(() => taggedCommits.get(tag) === commit && taggedCommits.delete(tag));

        return commit;
      };

      // Asked once: the branch a repository builds on when its releases have no runs of their own. A lookup
      // that failed fails the check, to be asked again: taken for no runs, the release would keep showing none.
      let defaultBranch: Promise<string | undefined> | undefined;
      const defaultBranchOf = () =>
        (defaultBranch ??= gh(`repo view ${shellQuote(repository)} --json defaultBranchRef --jq .defaultBranchRef.name`)
          .then((name) => name.trim() || undefined)
          .catch((error: unknown) => {
            defaultBranch = undefined;

            throw error;
          }));

      // A release's own name is usually its tag, so what it says is the message of the commit it points to.
      // Its runs are those its tag started; a repository that builds the commit on its default branch and
      // tags it afterwards, as release-please does, has none, and then the commit's runs there are shown.
      const releaseRunsOf = async (version: Version, latest: readonly WorkflowRun[]) => {
        const commit = await taggedCommitOfRelease(version.id);
        const tagged = { ...version, title: commit.title };
        const runs = await runsOfCommit(repository, commit.sha, latest);
        const own = runs.filter((run) => run.headBranch === version.id);

        if (own.length > 0 || runs.length === 0) return toVersionRuns(tagged, own);

        const branch = await defaultBranchOf();
        // A pull request from another branch may run on the same commit.
        const onBranch = runs.filter((run) => run.headBranch === branch);

        return toVersionRuns(tagged, onBranch, onBranch.length > 0 ? branch : undefined);
      };

      return {
        headOf: async () => (await latestReleases())[0]?.id,

        all: async () => {
          const [versions, latest] = await Promise.all([latestReleases(), latestRunsOf(repository)]);
          const recent = await Promise.all(
            versions.slice(0, versionsWithRuns).map((version) => releaseRunsOf(version, latest)),
          );

          return { versions, recent };
        },

        runsOf: async (version) => releaseRunsOf(version, await latestRunsOf(repository)),
      };
    };

    return () => (watch: WatchedRepository) =>
      isReleasesWatch(watch)
        ? releasesSource(watch.repository, !!watch.includePrereleases, watch.tagPattern)
        : branchSource(watch.repository, watch.branch);
  },
});
