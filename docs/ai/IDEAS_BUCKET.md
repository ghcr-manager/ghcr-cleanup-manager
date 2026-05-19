# Ideas

## ~~DB merge~~

~~A feature, which imports data from another ghcr-manager DB into the current one. Useful to merge scan and cleanup from
several packages and also historic ones from one package.~~

~~Tricky: Having to import when scan-id (and maybe other internal IDs) are already used in the current DB.~~

~~=> Done~~

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

## ~~Scan and Cleanup environment info storing~~

~~Store info about the environment to get a reference to the run on GH (maybe even job and step).~~

~~Can be simple, read ENV vars, use null if missing.~~

~~=> Done~~

## ~~Package info storing~~

~~During scan and maybe cleanup - store general info about the package. Can be simple JSON payload - we might already
read it anyway when we check if the package is non-public.~~

## ~~Discuss moving `scan` command to subfolder with `scan/action.yml`~~

~~Same arguments as with `db-merge/action.yml`: keep interface for main action functionality clean. Not same case as
`db-merge` in root action made key args (token, owner/package) optional.~~

~~=> Result: no, at least for now~~

## Expose "untag" as command

ghcr-workflow implements a nice hack for the missing untag functionality in GH and GCHR API: untag

The trick is to assign the tag to a dummy pkg-version/manifest then delete that. Afaik ghcr-manager even makes near
clones for most manifests instead of dummies.
