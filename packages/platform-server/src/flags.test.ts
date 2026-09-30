import { describe, expect, it } from "vitest"
import { auditRow } from "./audit"
import flags from "./flags"

describe("flags", () => {
  it("defaults everything to off", () => {
    expect(flags({})).toEqual({
      matchboxId: false,
      developerConsole: false,
      gaugeProfileApi: false,
      discordClaims: false,
    })
  })

  it("only treats 'true' as on", () => {
    expect(
      flags({
        MATCHBOX_ID_ENABLED: "true",
        DEVELOPER_CONSOLE_ENABLED: " TRUE ",
        GAUGE_PROFILE_API_ENABLED: "1",
        DISCORD_CLAIMS_ENABLED: "yes",
      }),
    ).toEqual({
      matchboxId: true,
      developerConsole: true,
      gaugeProfileApi: false,
      discordClaims: false,
    })
  })
})

describe("auditRow", () => {
  it("maps events to snake_case columns with defaults", () => {
    expect(
      auditRow({
        actorType: "staff",
        actorId: "4b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d",
        appId: "5b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d",
        action: "app-status-changed",
        metadata: { from: "active", to: "suspended" },
      }),
    ).toEqual({
      actor_type: "staff",
      actor_id: "4b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d",
      organization_id: null,
      app_id: "5b9a3b2e-8f25-4a55-9f0e-4f7f2b9a1c3d",
      environment_id: null,
      action: "app-status-changed",
      target_type: null,
      target_id: null,
      metadata: { from: "active", to: "suspended" },
      ip_prefix: null,
      request_id: null,
    })
  })
})
