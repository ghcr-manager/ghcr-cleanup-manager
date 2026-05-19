# The calling repository should be irrelevant

## Problem

When calling this action from a repository with a different owner than the package, I noticed that the package owner
must have a repository with the same name as the calling repository.

Example:

- Calling repo: `ownerC/repoC`
- Package: `ownerT/packageT`

> The package is not linked to any repo, `ownerC` can have no repos.

- The above will fail unless a repository `ownerT/repoc` exists (and is readable by the token).
- It will work when that repo exists.
- A link of the package to that repo is not needed.

Example call of `ghcr-cleanup-action` from a workflow in `ownerC/repoC`:

```yaml
- uses: dataaxiom/ghcr-cleanup-action@34a2b6c814b9c6bcb92f78cba3e56a7ab9ca7a86 # v1.1.0
  with:
    token: ${{ secrets.GHCR_TEST_PAT }}
    owner: "ownerT"
    package: "packageT"
```

> Note: In my test `ownerC` is an org, but it does not matter.

### Reproducing the problem

1. org: Create a test-org on GH
2. PAT: In your user account, create a classic PAT with permissions: `write:packages`
3. Copy
   [test workflow](https://github.com/gh-workflow/ghcr-manager/blob/df33332efc30d05a6433581da58e1c48e5958605/.github/workflows/test_ghcr-cleanup-action-cross-owner.yml)
   to a caller-repository outside the test-org (might not matter)
4. In caller-repos settings, add:
   - actions secret `GHCR_TEST_PAT` with the PAT value
   - action variable `GHCR_TEST_PAT_USERNAME` with your username
5. Run test-workflow with dispatch and as input:
   - test-org name
   - package-name

Result:

1. The workflow run will create the package in the test-org, not linked to any repo.
2. `ghcr-cleanup-action` will crash with an error like below

```text
[Octokit ERROR] GET /repos/ownerT/repoC - 404 with id <uuid> in 117ms
Warning: The repository is not found, check the owner value "ownerT" or the repository value "repoC" are correct
Error: Not Found - https://docs.github.com/rest/repos/repos#get-a-repository
```

#### Reproducing the workaround fix

1. Create a dummy repository in the test-org with the same name as the repo the workflow is in.
   - The dummy repo can be private and without content.
   - The package needs no link to the dummy repo.
2. Run the workflow again, `ghcr-cleanup-action` should now work fine.

## Problem analysis

Many packages are linked to a repository - but this is optional. And here it seems that `ghcr-cleanup-action` is using a
potential linked repo to derive package visibility or so.

## Solution suggestions

The calling repository, it's owner and any potential repository linked to the package should be irrelevant.

What matters is only:

- package owner type: only because it affects part of the URLs for package REST API calls
  - Type "User": `ownerURIPart = "users/$owner"`
  - Type "Organization": `ownerURIPart = "orgs/$owner"`
  - Then the URL becomes `githubApiBaseUrl = "https://api.github.com/${ownerURIPart}/packages/container/"`.
  - you could copy and adapt
    [getOwnerURIComponent()](https://github.com/gh-workflow/ghcr-manager/blob/df33332efc30d05a6433581da58e1c48e5958605/src/core/_github-package-owner.ts#L22)
    to get the `ownerURIPart`, the method uses caching per owner
- token: Can token read/write the package? REST calls will fail and tell

> optional: is package non-public
>
> to me this is only for information visibility - for example not printing package info to logs of workflow run with
> other visibility scope.
>
> can be read directly from the package metadata (see
> [loadPackageMetadata()](https://github.com/gh-workflow/ghcr-manager/blob/df33332efc30d05a6433581da58e1c48e5958605/src/ingest/github/_package-metadata-load.ts#L16))
>
> - org owned: `GET https://api.github.com/orgs/$owner/packages/container/$pacakge`
> - user owned: `GET https://api.github.com/users/$owner/packages/container/$pacakge`
> - in the response, `visibility === "public"` is public, "private" and "internal" being the alternatives
> - package is not linked to a repository when metadata has no `.repository` field.

## Why no PR?

I tried coming up with a PR for this and think the change could reduce complexity and code in `ghcr-cleanup-action`.

But doing this in one PR is a large change, needs discussion first. And splitting it in several PR muddles the purpose
and makes the goal of those PRs harder to understand.

What are your thoughts on this?
