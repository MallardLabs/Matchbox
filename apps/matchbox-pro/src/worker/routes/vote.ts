import type { ApiRoute } from "../router"

// Vote data for validator and pool ballots, read once on the server instead
// of fanning out from every browser.
export const voteRoutes: ApiRoute[] = []
