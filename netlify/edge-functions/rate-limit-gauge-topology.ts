export default async (
  _request: Request,
  context: { next: () => Promise<Response> },
) => {
  return context.next()
}

export const config = {
  path: "/api/analytics/gauge-topology",
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
}
