import {
  consolePaths,
  orgReviewListResponseSchema,
  orgReviewQuerySchema,
} from "@repo/platform-contracts/console"
import { pathParams, queryParams } from "@repo/platform-server"
import { organizationAccess } from "../access"
import { type ConsoleApp, deps } from "../context"
import { respond, toDeveloperReviews } from "../mappers"

export default function registerReviewRoutes(app: ConsoleApp): void {
  /** C02 "Reviews": open and decided reviews across the org's apps. */
  app.get("/api/orgs/:orgId/reviews", async (c) => {
    const { orgId } = pathParams(c, consolePaths.orgId)
    await organizationAccess(c, orgId, "developer")
    const query = queryParams(c, orgReviewQuerySchema)
    const records = await deps(c).store.listOrganizationReviews({
      organizationId: orgId,
      state: query.state,
      limit: query.limit,
    })
    const reviews = new Map(
      (
        await toDeveloperReviews(
          c,
          records.map((record) => record.review),
        )
      ).map((review) => [review.id, review]),
    )
    return respond(c, orgReviewListResponseSchema, {
      data: records.flatMap((record) => {
        const review = reviews.get(record.review.id)
        return review === undefined
          ? []
          : [
              {
                ...review,
                app: { id: record.app.id, name: record.app.name },
                environmentKind: record.environment.kind,
              },
            ]
      }),
    })
  })
}
