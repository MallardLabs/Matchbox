import { createLogger } from "@repo/shared/logger"
import { Pool } from "pg"
import {
  DECODER_VERSION,
  ProjectionReplayRequiredError,
  projectionStatus,
  runProjection,
} from "./decode/index"
import { type IngestDeps, headStatus, ingestToHead } from "./ingest/ingest"
import { networkConfig } from "./ingest/networks"
import { RpcClient } from "./ingest/rpc"
import { PgIngestStore } from "./ingest/store"
import type { Network } from "./types"

const logger = createLogger("matchbox-indexer")

const NETWORK: Network = "mezo"
// At head a tick covers ~15 blocks. The cap bounds a catch-up tick after an
// outage to five eth_getLogs windows.
const MAX_BLOCKS_PER_TICK = 50_000n
// Projection keeps pace with ingest: the same bound, so a catch-up tick
// projects what it ingested.
const MAX_PROJECTION_BLOCKS_PER_TICK = 50_000n
// runProjection never passes the 'logs' checkpoint, so it needs no other
// upper bound.
const THROUGH_INGEST_CHECKPOINT = 2n ** 63n - 1n

function withDeps<T>(
  env: Env,
  work: (deps: IngestDeps, pool: Pool) => Promise<T>,
): Promise<T> {
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
  const config = networkConfig(NETWORK)
  const deps: IngestDeps = {
    config,
    rpc: new RpcClient({ endpoints: config.endpoints, network: NETWORK }),
    store: new PgIngestStore(pool),
  }
  return work(deps, pool).finally(() => pool.end())
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (
      request.method === "GET" &&
      new URL(request.url).pathname === "/health"
    ) {
      try {
        const [status, projection] = await withDeps(env, async (deps, pool) => {
          const head = await headStatus(deps)
          const client = await pool.connect()
          try {
            return [head, await projectionStatus(client, NETWORK)] as const
          } finally {
            client.release()
          }
        })
        return Response.json(
          {
            service: "matchbox-indexer",
            environment: env.ENVIRONMENT,
            network: NETWORK,
            head: status.head.toString(),
            lastBlock: status.lastBlock?.toString() ?? null,
            lag: status.lag?.toString() ?? null,
            projection: {
              lastBlock: projection.projectedBlock?.toString() ?? null,
              // Blocks ingested but not yet projected.
              lag: projection.lag?.toString() ?? null,
              decoderVersion: DECODER_VERSION,
              builtWithDecoderVersion: projection.builtWithDecoderVersion,
              replayRequired: projection.replayRequired,
            },
          },
          { headers: { "Cache-Control": "no-store" } },
        )
      } catch (error) {
        logger.error({
          message: "Health check failed",
          error: error instanceof Error ? error.message : String(error),
        })
        return Response.json(
          { service: "matchbox-indexer", status: "error" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        )
      }
    }

    return Response.json(
      { error: "not_found", message: "No route for this request." },
      { status: 404 },
    )
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _context: ExecutionContext,
  ): Promise<void> {
    await withDeps(env, async (deps, pool) => {
      const summary = await ingestToHead(deps, MAX_BLOCKS_PER_TICK)
      logger.info({
        message: summary ? "Ingested logs" : "Ingest already at head",
        cron: controller.cron,
        network: NETWORK,
        ...(summary
          ? {
              from: summary.from.toString(),
              to: summary.to.toString(),
              logs: summary.logs,
              transactions: summary.transactions,
              contracts: summary.contracts,
            }
          : {}),
      })

      // Project whatever ingest has checkpointed. runProjection issues its own
      // BEGIN/COMMIT, so it gets a dedicated client, and never projects past
      // the 'logs' checkpoint. A failed projection leaves its checkpoint
      // untouched; the next tick resumes from it.
      const client = await pool.connect()
      try {
        const projected = await runProjection(
          client,
          NETWORK,
          THROUGH_INGEST_CHECKPOINT,
          { maxBlocks: MAX_PROJECTION_BLOCKS_PER_TICK },
        )
        logger.info({
          message:
            projected.logsScanned > 0
              ? "Projected activity"
              : "Projection already at ingest checkpoint",
          network: NETWORK,
          throughBlock: projected.throughBlock.toString(),
          logsScanned: projected.logsScanned,
          activitiesWritten: projected.activitiesWritten,
        })
      } catch (error) {
        if (error instanceof ProjectionReplayRequiredError) {
          // Retrying cannot fix this: the tables were built by another
          // decoder version. Ingest keeps running; activity stops advancing
          // until someone runs scripts/project.ts --replay.
          logger.error({
            message:
              "PROJECTION HALTED: decoder version changed, replay required",
            network: NETWORK,
            decoderVersion: DECODER_VERSION,
            error: error.message,
          })
          return
        }
        throw error
      } finally {
        client.release()
      }
    })
  },
} satisfies ExportedHandler<Env>
