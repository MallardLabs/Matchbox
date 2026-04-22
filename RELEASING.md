# Releasing to Trellium

This guide is for the source-of-truth development repo, `MallardLabs/Matchbox`.
It is intentionally excluded from `TrelliumOrg/Matchbox`.

## First release workflow

1. Cut or choose the release-ready ref in `MallardLabs/Matchbox`.
2. Export a clean Trellium snapshot from that ref.
3. Inspect the exported snapshot before publishing it.
4. Publish the snapshot to the standalone `trellium` remote.

## Prepare a release snapshot

```bash
pnpm release:trellium:prepare -- --ref main --out .trellium-release/v1.0.0
```

This script:

- exports the chosen Git ref with `git archive`
- respects `export-ignore` entries from `.gitattributes`
- runs the Trellium boundary check against the exported snapshot

## Publish the snapshot

```bash
pnpm release:trellium:publish -- --dir .trellium-release/v1.0.0 --message "Release v1.0.0" --tag v1.0.0
```

This script:

- publishes from the exported snapshot, not directly from the dev repo
- creates a standalone Trellium history for the first release
- appends clean follow-up release commits on later releases

## Recommended release flow

```bash
git switch -c release/v1.0.0
pnpm release:trellium:prepare -- --ref HEAD --out .trellium-release/v1.0.0
pnpm release:trellium:publish -- --dir .trellium-release/v1.0.0 --message "Release v1.0.0" --tag v1.0.0
```

## Notes

- The scripts default to the `trellium` remote and `main` branch.
- The publish step works for the empty first release and later updates.
- For a smoke test without GitHub, pass `--remote-url <path-to-bare-repo>` to
  the publish script.
