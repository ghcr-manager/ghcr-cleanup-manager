# Ideas

## GHCR visualizer

To my knowledge no tool exists, which nicely shows the graphs in a GitHub image registry package (GHCR).

And ghcr-manager has a nice DB with full data of one or several GHCR.

And it's really hard to mentally visualize even one group in a GHCR. I picture my `single` test setup with:

- amd64 and arm64 images
- a cross-platform manifest
- provenance and cosign signature for the 3 above
- together with some wrapper manifests from cosign => 17 manifests total in a graph, not a tree
- By looking at the data in the DB, I can mentally see parts of this graph, but not picture the full graph of 17
  manifests without quite some manual data preparation and arranging

### Visualize idea

I only briefly discussed with ChatGPT and there [Cytoscape.js](https://github.com/cytoscape/cytoscape.js#cytoscapejs)
seemed to be a clear candidate for this.

I imagine visualizing such charts in a GHCR in a browser, driven by ghcr-manager (or maybe a separate tool using
ghcr-manager DBs). It does not have to be pretty at start - and I am a command line designer and unlikely to make it
pretty - but functional at first.

Should show at least graphs of manifests with tags and some (untrusted `manifest_kind) label what it probably is.  
Then maybe something like see JSON on click or such.

## Document older-than format better

The day, days, ... format is a bit undocumented and unclear.

## Clean up string enums

Search for `" | "` and `| "` ... many such string types are inlined in objects and thus their string values used
plain-text in code.

## Make action args visible in run logs

`cleanup_summary_json="$(npm run --silent ghcr-manager:dist -- cleanup "${cleanup_args[@]}")"`

with the bash arg construction hides the actual args to node. Instead of nicely copying from logs to run from CLI, I
have to guess and hand knit args from docs and the summary and my input.

And we should add a new arg to the node code for file output - if present write to file. If not (CLI usage) print
compact JSON ... or even if file output arg not present don't print JSON, file is enough.
