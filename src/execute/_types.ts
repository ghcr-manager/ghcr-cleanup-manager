import type { DeletePlan } from "../db/index.js";

export interface DeletePackageVersionOperation {
  versionId: number;
  digest: string;
}

export interface UnsupportedUntagRoot {
  versionId: number;
  digest: string;
  reason: string;
}

export interface UntagTagOperation {
  tag: string;
  sourceVersionId: number;
  sourceDigest: string;
  detachedVersionId: number;
  detachedDigest: string;
}

export interface DeleteExecutionSummary {
  owner: string;
  packageName: string;
  scanCompletedAt: string;
  plannerInputs: DeletePlan["plannerInputs"];
  deletedPackageVersions: DeletePackageVersionOperation[];
  untaggedTags: UntagTagOperation[];
  blockedRoots: DeletePlan["blockedRoots"];
  unsupportedUntagRoots: UnsupportedUntagRoot[];
}

export interface DeleteExecutionOptions {
  token: string;
  logger: DeleteExecutionLogger;
  fetchImpl?: GitHubPackageFetch;
  listRootTags?: (root: { owner: string; packageName: string; versionId: number; digest: string }) => string[];
}

export interface DeleteExecutionLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface GitHubPackageFetchResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  json(): Promise<unknown>;
}

export type GitHubPackageFetch = (input: string, init?: RequestInit) => Promise<GitHubPackageFetchResponse>;
