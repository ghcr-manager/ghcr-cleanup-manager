# 09 Task: Evaluate similar tools

## Status

We already use 3 cleanup executors in our live GHCR scenario tests `.github/workflows/test_scenario-graph-matrix.yml`:

- `ghcr-manager` (this tool)
- `dataaxiom/ghcr-cleanup-action`
- `mkoepf/ghcrctl/`

That has been useful because it gives us a second implementation to compare against. In many cases the comparison helps
us spot where our own logic differs, where the other tool has different assumptions, and where the topic itself is more
ambiguous than it first looks.

Now there may be more tools like this.

I did a quick search on the GitHub marketplace and cloned all tools which at first glance looked potentially similar to
`../../GHCR-CLEANERS/`. Example path for tool `foo/bar` would be `../../GHCR-CLEANERS/foo/bar`.

> Note: The tools we already compare with (`dataaxiom/ghcr-cleanup-action` and `mkoepf/ghcrctl/`) are in
> `../../GHCR-CLEANERS/` too. Exclude those as we already cover them.

## Side-task: Note functionality we don't provide

Throughout this task we look at similar tools. And there might be hidden gems - functionality we lack or really cool
ideas.

Tell me if you spot something like that.

Also - we might potentially detect an idea for a basic case or scenario which we do not yet properly cover in our tests.

## Analyze tools first

Do a first pass over each tools main README.md and estimate if it's worth adding this as "cleanup selector". The tools
functionality must be somewhat close to ours.

List each tool and how you would classify it and if at all what scenarios we could run with it.

We probaly will exclude some tools altogether after this step.

## Fine evaluation of tools functionality

For the remaining tools I want you to dive a bit deeper and map their functionality to our scenarios.

Ideally after this we know which scenarios we can run with which tool and can estimate how much we have to adapt our
test framework for the tool.

If some tool requires extensive changes to our test framework, then we discuss here if we eliminate it.

## Extend our tests with new executors

Implement the new functionality. I will review the git-diff and tell you when to commit.

## Tests on GitHub

I will then run the updated tests on GH and potentially come back to you with feedback/errors/ideas ...
