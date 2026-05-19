# Related project inspired by ghcr-cleanup-action

Hi,

I wanted to let you know that I recently worked on a GHCR management action/tool:

[gh-workflow/ghcr-manager](https://github.com/gh-workflow/ghcr-manager)

`ghcr-cleanup-action` was a major inspiration for it.

I originally started exploring this space independently, but after finding `ghcr-cleanup-action` I realized a lot of the
filtering behavior and parameter design had already been thought through very well. I ended up intentionally keeping
broad feature parity for the cleanup/filtering side and aligning many semantics, because they are solid and predictable
for users.

My main motivation was handling very large registries (100k+ manifests in my
[case](https://github.com/orgs/aicage/packages/container/package/aicage)) and experimenting with a different
architecture based on a local DB instead of keeping all registry state in memory. That also enabled some additional
ideas like downloadable audit databases and offline analysis tooling.

I mainly wanted to acknowledge the influence and say that I came away with a lot of respect for the amount of edge cases
your implementation already handles correctly. During extensive testing I found all tested cases handled correctly.

Thanks for the work you put into it.
