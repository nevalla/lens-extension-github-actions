import { describe, expect, it } from "vitest";
import { fluxOwnerOf, fluxStateOf } from "../src/deployments/cluster-images";
import { commitOfRevision, githubRepositoryOfUrl, selectedImageOf } from "../src/deployments/flux-kinds";
import { sha } from "./fixtures";

describe("fluxStateOf", () => {
  it.each([
    ["ready", [{ type: "Ready", status: "True" }], "ready"],
    ["failed", [{ type: "Ready", status: "False", message: "boom" }], "failed"],
    ["unknown readiness", [{ type: "Ready", status: "Unknown" }], "reconciling"],
    ["no conditions yet", [], "reconciling"],
    [
      "reconciling",
      [
        { type: "Ready", status: "True" },
        { type: "Reconciling", status: "True", reason: "Progressing" },
      ],
      "reconciling",
    ],
    [
      "failing and retried",
      [
        { type: "Ready", status: "False", message: "health check failed" },
        { type: "Reconciling", status: "True", reason: "ProgressingWithRetry" },
      ],
      "failed",
    ],
  ] as const)("%s → %s", (_, conditions, expected) => {
    expect(fluxStateOf(conditions as never).state).toBe(expected);
  });

  it("carries Ready's message", () => {
    expect(fluxStateOf([{ type: "Ready", status: "False", message: "boom" }]).message).toBe("boom");
  });
});

describe("fluxOwnerOf", () => {
  it("prefers the HelmRelease, the nearer owner", () => {
    expect(
      fluxOwnerOf({
        "helm.toolkit.fluxcd.io/name": "backend",
        "helm.toolkit.fluxcd.io/namespace": "apps",
        "kustomize.toolkit.fluxcd.io/name": "apps",
        "kustomize.toolkit.fluxcd.io/namespace": "flux-system",
      }),
    ).toEqual({ kind: "HelmRelease", name: "backend", namespace: "apps" });
  });

  it("falls back to the Kustomization", () => {
    expect(
      fluxOwnerOf({
        "kustomize.toolkit.fluxcd.io/name": "apps",
        "kustomize.toolkit.fluxcd.io/namespace": "flux-system",
      }),
    ).toEqual({ kind: "Kustomization", name: "apps", namespace: "flux-system" });
  });

  it("is nothing for what Flux did not apply", () => {
    expect(fluxOwnerOf({ app: "x" })).toBeUndefined();
    expect(fluxOwnerOf()).toBeUndefined();
  });
});

describe("commitOfRevision", () => {
  it.each([
    [`main@sha1:${sha("dbfd2c5")}`, sha("dbfd2c5")],
    [`v1.2.3@sha1:${sha("abc")}`, sha("abc")],
    ["v1.2.3@sha256:deadbeef", undefined],
    ["0.1.161", undefined],
    [undefined, undefined],
  ])("%s → %s", (revision, expected) => {
    expect(commitOfRevision(revision)).toBe(expected);
  });
});

describe("githubRepositoryOfUrl", () => {
  it.each([
    ["https://github.com/lensapp/lenscloud-platform-apps", "lensapp/lenscloud-platform-apps"],
    ["https://github.com/Lensapp/Lenscloud/", "lensapp/lenscloud"],
    ["ssh://git@github.com/lensapp/lenscloud.git", "lensapp/lenscloud"],
    ["git@github.com:lensapp/lenscloud.git", "lensapp/lenscloud"],
    ["https://gitlab.com/lensapp/lenscloud", undefined],
  ])("%s → %s", (url, expected) => {
    expect(githubRepositoryOfUrl(url)).toBe(expected);
  });
});

describe("selectedImageOf", () => {
  it("reads Flux 2.6's latestRef", () => {
    expect(selectedImageOf({ latestRef: { name: "registry/app", tag: "main-76cd335" } })).toBe(
      "registry/app:main-76cd335",
    );
  });

  it("reads latestImage before Flux 2.6", () => {
    expect(selectedImageOf({ latestImage: "registry/app:main-76cd335" })).toBe("registry/app:main-76cd335");
  });

  it("is nothing before anything was selected", () => {
    expect(selectedImageOf()).toBeUndefined();
  });
});
