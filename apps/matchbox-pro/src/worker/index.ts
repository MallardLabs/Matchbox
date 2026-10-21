import { type WorkerEnv, createApiHandler } from "./router"
import { historyRoutes } from "./routes/history"
import { marketRoutes } from "./routes/market"
import { queryRoutes } from "./routes/query"
import { voteRoutes } from "./routes/vote"

export type { WorkerEnv } from "./router"

export const handleApiRequest = createApiHandler([
  ...marketRoutes,
  ...historyRoutes,
  ...queryRoutes,
  ...voteRoutes,
])

export default {
  async fetch(
    request: Request,
    env: WorkerEnv,
    ctx: { waitUntil: (promise: Promise<unknown>) => void },
  ): Promise<Response> {
    const api = await handleApiRequest(request, env, (promise) =>
      ctx.waitUntil(promise),
    )
    if (api) return api
    if (!env.ASSETS) {
      return new Response("Not found", { status: 404 })
    }
    return env.ASSETS.fetch(request)
  },
}
