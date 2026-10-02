import { runCliCommandInjectionToken } from "@k8slens/cli-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { z } from "zod";
import { isReleasesWatch, tagMatches, type WatchedRepository } from "../watched-repositories/watched-repository";
import { shellQuote } from "./shell-quote";
import { toVersionRuns, type Version, type VersionRuns } from "./version";
import { workflowRunJsonFields, workflowRunSchema } from "./workflow-run";

/** How far back a running service can be placed. */
const versionsAsked = 30;
/** Releases asked for when only those of a tag pattern count, so enough of them are left. */
const releasesAskedForPattern = 100;
/** The versions whose runs are shown. */
export const versionsWithRuns = 5;
// Comfortably more than the workflows one commit triggers.
const runsAskedPerCommit = 30;

// Anything gh writes to standard error fails the command, so keep its notices quiet.
const ghEnv = { GH_NO_UPDATE_NOTIFIER: "1", GH_PROMPT_DISABLED: "1", NO_COLOR: "1" };

const commitsJq = `[.[] | {sha, title: (.commit.message | split("\\n")[0]), committedAt: .commit.committer.date}]`;

const commitJq = `{sha, title: (.commit.message | split("\n")[0])}`;

const commitSchema = z.object({ sha: z.string(), title: z.string(), committedAt: z.string() });

const releaseSchema = z.object({
  tagName: z.string(),
  name: z.string(),
  isPrerelease: z.boolean(),
  publishedAt: z.string(),
});

/** Where the versions of one watch come from. */
export interface TrackSource {
  /** The newest version, in one cheap call: what tells a new one has landed. */
  readonly headOf: () => Promise<string | undefined>;
  /** The latest versions, newest first, and the runs of the most recent of them. */
  readonly all: () => Promise<{ versions: readonly Version[]; recent: readonly VersionRuns[] }>;
  /** The runs of one version again, for a version whose runs have not all finished. */
  readonly runsOf: (version: Version) => Promise<VersionRuns>;
}

export const trackSourcesInjectable = getInjectable2({
  id: "github-actions-track-sources",
  consumptions: [runCliCommandInjectionToken],

  instantiate: (di) => {
    const runCliCommand = di.inject(runCliCommandInjectionToken)();
    const gh = async (args: string) => runCliCommand(`gh ${args}`, { env: ghEnv });
    const ghJson = async (args: string) => JSON.parse(await gh(args));

    const runsOfCommit = async (repository: string, sha: string) =>
      z
        .array(workflowRunSchema)
        .parse(
          await ghJson(
            `run list --repo ${shellQuote(repository)} --commit ${shellQuote(sha)} --limit ${runsAskedPerCommit} --json ${workflowRunJsonFields}`,
          ),
        );

    const commitOf = async (repository: string, ref: string) =>
      (await gh(`api ${shellQuote(`repos/${repository}/commits/${encodeURIComponent(ref)}`)} --jq .sha`)).trim();

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
    const runsOf = async (repository: string, ref: string, sha: string, version: Version) =>
      toVersionRuns(
        version,
        (await runsOfCommit(repository, sha)).filter((run) => run.headBranch === ref),
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
            url: `https://github.com/${repository}/commit/${commit.sha}`,
          }));

      return {
        headOf: () => commitOf(repository, branch),

        all: async () => {
          const versions = await latestCommits();
          const recent = await Promise.all(
            versions.slice(0, versionsWithRuns).map((version) => runsOf(repository, branch, version.id, version)),
          );

          return { versions, recent };
        },

        runsOf: (version) => runsOf(repository, branch, version.id, version),
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

      // A release's own name is usually its tag, so what it says is the message of the commit it points to.
      const releaseRunsOf = async (version: Version) => {
        const commit = await taggedCommitOf(repository, version.id);

        return runsOf(repository, version.id, commit.sha, { ...version, title: commit.title });
      };

      return {
        headOf: async () => (await latestReleases())[0]?.id,

        all: async () => {
          const versions = await latestReleases();
          const recent = await Promise.all(versions.slice(0, versionsWithRuns).map(releaseRunsOf));

          return { versions, recent };
        },

        runsOf: releaseRunsOf,
      };
    };

    return () => (watch: WatchedRepository) =>
      isReleasesWatch(watch)
        ? releasesSource(watch.repository, !!watch.includePrereleases, watch.tagPattern)
        : branchSource(watch.repository, watch.branch);
  },
});
