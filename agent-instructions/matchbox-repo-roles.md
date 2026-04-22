# MatchBox Repo Roles

This guidance is specific to `MallardLabs/MatchBox` and should be absent from
`TrelliumOrg/MatchBox`.

## Repo roles

- `MallardLabs/MatchBox` is the source-of-truth development repo.
- `TrelliumOrg/MatchBox` is the release/distribution repo.
- `TrelliumOrg/MatchBox` must remain a standalone repository and must not be
  treated as a GitHub fork of `MallardLabs/MatchBox`.
- Day-to-day development happens in `MallardLabs/MatchBox`.
- Only major releases, polished milestones, or intentionally selected changes
  should be propagated to `TrelliumOrg/MatchBox`.

## Working model

Assume this repo is the active dev repo unless explicitly told otherwise.

Default behavior:

- make normal commits against the current development branch
- prefer small, iterative commits locally when requested
- do not recommend pushing every intermediate dev commit to
  `TrelliumOrg/MatchBox`
- when preparing a release, prefer a curated release flow rather than a blind
  mirror of all development history

## Release policy

When asked to prepare code for `TrelliumOrg/MatchBox`:

- treat it as a release promotion, not as the main development destination
- prefer one of these strategies:
  1. release branch promotion
  2. squash merge of release-ready work
  3. cherry-picking selected commits
- avoid workflows that would make `TrelliumOrg/MatchBox` appear to be an
  actively noisy development repo unless explicitly requested

## Git remote assumptions

If discussing remotes, assume a setup like:

- `origin` -> `MallardLabs/MatchBox`
- `trellium` -> `TrelliumOrg/MatchBox`

When giving Git commands:

- default pushes should target `origin`
- only push to `trellium` for explicit release or promotion actions
- do not change remote names unless asked

## Behavior expectations for agents

When making changes:

- preserve clean release boundaries
- distinguish clearly between "development changes" and "release promotion"
- call out any action that would rewrite history, force-push, or change
  public-facing history
- avoid suggesting GitHub fork-based workflows for `TrelliumOrg/MatchBox`

When asked to help ship:

- first identify whether the request is a dev change or a release change
- if it is a dev change, optimize for speed and iteration in
  `MallardLabs/MatchBox`
- if it is a release change, optimize for cleanliness, stability, and
  presentation in `TrelliumOrg/MatchBox`

## Commit and PR guidance

For development work:

- prioritize clear, direct commit messages
- keep implementation pragmatic
- do not over-polish internal-only changes unless requested

For release work:

- prefer cleaner summaries
- highlight user-facing impact
- group related changes into coherent release units

## Safety checks before release promotion

Before suggesting a release push to `TrelliumOrg/MatchBox`, verify:

- the code is intentional and release-ready
- debug-only or experimental work is not being unintentionally promoted
- docs, env examples, branding, and version references are appropriate for
  `TrelliumOrg`
- any repo-specific URLs, org names, badges, and CI references are correct

## If uncertain

If the task could affect both repos:

- ask whether the user wants a dev-only change or a release-ready change
- if no clarification is possible, default to dev-only changes in
  `MallardLabs/MatchBox`
