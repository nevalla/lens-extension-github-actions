/** Why a call of the GitHub CLI failed, as far as its output tells. */
export type GhCause =
  | "not-installed"
  | "expired-sign-in"
  | "not-signed-in"
  | "sso"
  | "rate-limit"
  | "no-access"
  | "no-ref"
  | "offline"
  | "unknown";

export interface GhProblem {
  readonly cause: GhCause;
  /** What is wrong, in a line. */
  readonly title: string;
  /** What to do about it. */
  readonly fix: string;
  readonly link?: string;
  /**
   * Whether it waits for the user rather than passing by itself: checking again would only fail again,
   * so checks stop until the user checks again themselves.
   */
  readonly waitsForUser: boolean;
  /** What the CLI said. */
  readonly detail: string;
}

// Most specific first: an expired token's output also suggests signing in. A shell's "gh: not found" ends
// its line, where GitHub's "gh: Not Found (HTTP 404)" goes on.
const causes: readonly { cause: GhCause; pattern: RegExp }[] = [
  {
    cause: "not-installed",
    pattern:
      /command not found|gh: not found\s*$|not found: gh|spawn gh ENOENT|is not recognized as an internal or external command/im,
  },
  { cause: "rate-limit", pattern: /rate limit/i },
  { cause: "sso", pattern: /SAML enforcement|single sign-on/i },
  { cause: "expired-sign-in", pattern: /bad credentials|HTTP 401/i },
  { cause: "not-signed-in", pattern: /gh auth login|not logged in/i },
  { cause: "no-ref", pattern: /no commit found for sha|HTTP 422/i },
  { cause: "no-access", pattern: /not found \(HTTP 404\)|could not resolve to a repository|HTTP 404/i },
  {
    cause: "offline",
    pattern:
      /error connecting to|could not resolve host|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network is unreachable|i\/o timeout|TLS handshake timeout/i,
  },
];

/** Recognises why a call of the GitHub CLI failed, and says what to do, for the repository it was about. */
export const ghProblemOf = (detail: string, repository: string): GhProblem => {
  const cause = causes.find(({ pattern }) => pattern.test(detail))?.cause ?? "unknown";
  const problem = (title: string, fix: string, waitsForUser: boolean, link?: string): GhProblem => ({
    cause,
    title,
    fix,
    link,
    waitsForUser,
    detail,
  });

  switch (cause) {
    case "not-installed":
      return problem(
        "Lens cannot find the GitHub CLI (gh).",
        "Install it, or if it is installed, restart Lens so it picks up your shell's PATH.",
        true,
        "https://cli.github.com",
      );
    case "expired-sign-in":
      return problem("The GitHub CLI's sign-in has expired.", 'Sign in again with "gh auth login".', true);
    case "not-signed-in":
      return problem("The GitHub CLI is not signed in.", 'Sign in with "gh auth login".', true);
    case "sso":
      return problem(
        `${repository} needs single sign-on for the GitHub CLI's sign-in.`,
        'Authorize it with "gh auth refresh", or authorize the token for the organization on GitHub.',
        true,
      );
    case "rate-limit":
      return problem("GitHub's rate limit is reached.", "Checking waits for the check interval.", false);
    case "no-access":
      return problem(
        `${repository} was not found, or the signed-in account cannot see it.`,
        "Check the repository in the GitHub Actions settings, and the account gh is signed in with.",
        true,
      );
    case "no-ref":
      return problem(
        `The branch or tag watched does not exist in ${repository}.`,
        "Check the watch in the GitHub Actions settings.",
        true,
      );
    case "offline":
      return problem("GitHub cannot be reached.", "Checking goes on, and picks up once GitHub can be reached.", false);
    case "unknown":
      return problem("The GitHub CLI failed.", "Checking goes on. What gh said:", false);
  }
};
