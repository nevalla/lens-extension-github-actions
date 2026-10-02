import { describe, expect, it } from "vitest";
import { ghProblemOf } from "../src/workflow-runs/gh-problems";

describe("ghProblemOf", () => {
  // What the GitHub CLI and the shells running it print, as seen.
  it.each([
    ["sh: gh: command not found", "not-installed", true],
    ["zsh:1: command not found: gh", "not-installed", true],
    ["/bin/sh: 1: gh: not found", "not-installed", true],
    ["'gh' is not recognized as an internal or external command", "not-installed", true],
    [
      "To get started with GitHub CLI, please run:  gh auth login\nAlternatively, populate the GH_TOKEN environment variable",
      "not-signed-in",
      true,
    ],
    [
      '{"message": "Bad credentials"}\ngh: Bad credentials (HTTP 401)\nTry authenticating with:  gh auth login',
      "expired-sign-in",
      true,
    ],
    ["gh: Resource protected by organization SAML enforcement. (HTTP 403)", "sso", true],
    ["gh: Not Found (HTTP 404)", "no-access", true],
    ["GraphQL: Could not resolve to a Repository with the name 'o/nope'.", "no-access", true],
    ["gh: No commit found for SHA: feature-x (HTTP 422)", "no-ref", true],
    ["gh: API rate limit exceeded for user ID 1. (HTTP 403)", "rate-limit", false],
    ["error connecting to api.github.com\ncheck your internet connection", "offline", false],
    ["dial tcp: lookup api.github.com: no such host ... i/o timeout", "offline", false],
    ["something else entirely", "unknown", false],
  ])("%s → %s", (detail, cause, waitsForUser) => {
    const problem = ghProblemOf(detail, "o/app");

    expect(problem.cause).toBe(cause);
    expect(problem.waitsForUser).toBe(waitsForUser);
    expect(problem.detail).toBe(detail);
  });

  it("names the repository it was about", () => {
    expect(ghProblemOf("gh: Not Found (HTTP 404)", "o/app").title).toContain("o/app");
  });

  it("links to the GitHub CLI when it is missing", () => {
    expect(ghProblemOf("sh: gh: command not found", "o/app").link).toBe("https://cli.github.com");
  });
});
