// Decoder entry points. The cron Worker calls runProjection after ingest;
// scripts/project.ts replays from scratch. See docs/goldsky-exit.md.
export {
  DECODER_VERSION,
  ProjectionReplayRequiredError,
  type ProjectionResult,
  type ProjectionStatus,
  projectBlock,
  projectionStatus,
  resetProjection,
  runProjection,
} from "./projection"
export { lockKeysForLog, resolveHandler, staticSourcesFor } from "./dispatch"
export { InMemoryStore, type Store } from "./store"
export { ACTIVITY_FIELDS, type ActivityEventRow } from "./rows"
