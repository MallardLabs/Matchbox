import type { AcademyParams, PointsWeightSegment } from "@/lib/academy/simulate"
import { type ReactElement, type ReactNode, useState } from "react"
import { parseUnits } from "viem"

type Props = {
  params: AcademyParams
  rangeFromTs: number
  rangeToTs: number
  onChange: (next: AcademyParams) => void
  onReset: () => void
}

const SEMESTER_PRESETS: ReadonlyArray<{ label: string; mezo: number }> = [
  { label: "S0 · 1M", mezo: 1_000_000 },
  { label: "S1 · 4M", mezo: 4_000_000 },
  { label: "S2 · 10M", mezo: 10_000_000 },
  { label: "S3 · 4M", mezo: 4_000_000 },
]

function mezoToWad(mezo: number): bigint {
  if (!Number.isFinite(mezo) || mezo <= 0) return 0n
  return parseUnits(mezo.toFixed(6), 18)
}

function wadToMezo(wad: bigint): number {
  if (wad <= 0n) return 0
  return Number(wad / 10n ** 12n) / 1e6
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: ReactNode
}): ReactElement {
  return (
    <fieldset className="rounded border border-[var(--border)] bg-[var(--surface)] p-3">
      <legend className="px-1 text-xs font-semibold uppercase text-[var(--content-primary)]">
        {title}
      </legend>
      {hint ? (
        <p className="mb-2 text-pretty text-[11px] leading-snug text-[var(--content-secondary)]">
          {hint}
        </p>
      ) : null}
      {children}
    </fieldset>
  )
}

function NumberField({
  label,
  value,
  step,
  min,
  max,
  onChange,
  hint,
}: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  onChange: (n: number) => void
  hint?: string
}): ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[var(--content-secondary)]">
        {label}
      </span>
      <input
        type="number"
        value={value}
        step={step}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => {
          const next = Number(e.target.value)
          onChange(Number.isFinite(next) ? next : 0)
        }}
        className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-2 py-1 text-sm text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
      />
      {hint ? (
        <span className="text-[11px] leading-snug text-[var(--content-tertiary)]">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

function tsToDateValue(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return ""
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

function dateValueToTs(value: string): number {
  const timestamp = Date.parse(`${value}T00:00:00Z`)
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0
}

function updateSegment(
  segments: PointsWeightSegment[],
  index: number,
  patch: Partial<PointsWeightSegment>,
): PointsWeightSegment[] {
  return segments.map((segment, segmentIndex) =>
    segmentIndex === index ? { ...segment, ...patch } : segment,
  )
}

export default function AcademyKnobs({
  params,
  rangeFromTs,
  rangeToTs,
  onChange,
  onReset,
}: Props): ReactElement {
  const currentBudgetMezo = Math.round(wadToMezo(params.budgetMezoWad))
  const [lastClickedPresetLabel, setLastClickedPresetLabel] = useState<
    string | null
  >(null)

  const activePreset = SEMESTER_PRESETS.find(
    (p) => p.label === lastClickedPresetLabel,
  )
  const isClickedPresetStillValid =
    activePreset && activePreset.mezo === currentBudgetMezo

  const activeLabel = isClickedPresetStillValid
    ? lastClickedPresetLabel
    : (SEMESTER_PRESETS.find((p) => p.mezo === currentBudgetMezo)?.label ??
      null)

  const update = (patch: Partial<AcademyParams>) => {
    if (patch.budgetMezoWad !== undefined) {
      const nextMezo = Math.round(wadToMezo(patch.budgetMezoWad))
      if (activePreset && activePreset.mezo !== nextMezo) {
        setLastClickedPresetLabel(null)
      }
    }
    onChange({ ...params, ...patch })
  }

  return (
    <div className="flex flex-col gap-3">
      <Section
        title="Reward Budget"
        hint="Total MEZO distributed across all participants this period. Allocation is proportional to each actor's points share."
      >
        <div className="flex flex-wrap gap-1.5">
          {SEMESTER_PRESETS.map((preset) => {
            const isActive = activeLabel === preset.label
            return (
              <button
                type="button"
                key={preset.label}
                onClick={() => {
                  setLastClickedPresetLabel(preset.label)
                  update({ budgetMezoWad: mezoToWad(preset.mezo) })
                }}
                className={`rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  isActive
                    ? "bg-[#F7931A]/15 text-[#F7931A] ring-1 ring-inset ring-[#F7931A]/30"
                    : "bg-[var(--surface-tertiary)] text-[var(--content-primary)] hover:bg-[var(--surface-secondary)]"
                }`}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <div className="mt-2">
          <NumberField
            label="Budget (MEZO)"
            value={currentBudgetMezo}
            step={100_000}
            min={0}
            onChange={(n) => update({ budgetMezoWad: mezoToWad(n) })}
          />
        </div>
      </Section>

      <Section
        title="Action Weights"
        hint="Base points awarded per veMEZO generated by each action. Time segments below override these values when active."
      >
        <ol className="grid list-none grid-cols-3 gap-2 p-0">
          <li>
            <NumberField
              label="New lock"
              value={params.weightNew}
              step={0.5}
              min={0}
              onChange={(n) => update({ weightNew: n })}
              hint="× ve-power of the new lock"
            />
          </li>
          <li>
            <NumberField
              label="Extension"
              value={params.weightExt}
              step={0.5}
              min={0}
              onChange={(n) => update({ weightExt: n })}
              hint="× delta ve-power vs prior lock state"
            />
          </li>
          <li>
            <NumberField
              label="Boost vote"
              value={params.weightBoost}
              step={0.5}
              min={0}
              onChange={(n) => update({ weightBoost: n })}
              hint="× weight cast on each vote"
            />
          </li>
        </ol>
      </Section>

      <Section
        title="Custom Weight Segments"
        hint="Override all three action weights for a UTC date range. If segments overlap, the last matching segment wins."
      >
        {params.pointsSegments.length > 0 ? (
          <ol className="flex list-none flex-col gap-3 p-0">
            {params.pointsSegments.map((segment, index) => {
              const invalidRange = segment.toTs <= segment.fromTs
              return (
                <li
                  key={segment.id}
                  className="rounded border border-[var(--border)] bg-[var(--surface-tertiary)] p-2"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-[var(--content-primary)]">
                      Segment {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          pointsSegments: params.pointsSegments.filter(
                            (_segment, segmentIndex) => segmentIndex !== index,
                          ),
                        })
                      }
                      className="rounded px-2 py-1 text-[11px] text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
                    >
                      Remove
                    </button>
                  </div>
                  <ol className="grid list-none grid-cols-2 gap-2 p-0">
                    <li>
                      <label className="flex flex-col gap-1 text-[11px] uppercase text-[var(--content-secondary)]">
                        From (UTC)
                        <input
                          type="date"
                          value={tsToDateValue(segment.fromTs)}
                          onChange={(event) =>
                            update({
                              pointsSegments: updateSegment(
                                params.pointsSegments,
                                index,
                                { fromTs: dateValueToTs(event.target.value) },
                              ),
                            })
                          }
                          className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
                        />
                      </label>
                    </li>
                    <li>
                      <label className="flex flex-col gap-1 text-[11px] uppercase text-[var(--content-secondary)]">
                        To (UTC, exclusive)
                        <input
                          type="date"
                          value={tsToDateValue(segment.toTs)}
                          onChange={(event) =>
                            update({
                              pointsSegments: updateSegment(
                                params.pointsSegments,
                                index,
                                { toTs: dateValueToTs(event.target.value) },
                              ),
                            })
                          }
                          className="rounded border border-[var(--border)] bg-[var(--surface-secondary)] px-2 py-1 text-xs text-[var(--content-primary)] outline-none focus:border-[#F7931A]"
                        />
                      </label>
                    </li>
                    <li>
                      <NumberField
                        label="New lock"
                        value={segment.weightNew}
                        step={0.5}
                        min={0}
                        onChange={(weightNew) =>
                          update({
                            pointsSegments: updateSegment(
                              params.pointsSegments,
                              index,
                              { weightNew },
                            ),
                          })
                        }
                      />
                    </li>
                    <li>
                      <NumberField
                        label="Extension"
                        value={segment.weightExt}
                        step={0.5}
                        min={0}
                        onChange={(weightExt) =>
                          update({
                            pointsSegments: updateSegment(
                              params.pointsSegments,
                              index,
                              { weightExt },
                            ),
                          })
                        }
                      />
                    </li>
                    <li>
                      <NumberField
                        label="Boost vote"
                        value={segment.weightBoost}
                        step={0.5}
                        min={0}
                        onChange={(weightBoost) =>
                          update({
                            pointsSegments: updateSegment(
                              params.pointsSegments,
                              index,
                              { weightBoost },
                            ),
                          })
                        }
                      />
                    </li>
                  </ol>
                  {invalidRange ? (
                    <p className="mt-2 text-pretty text-[11px] text-red-500">
                      End date must be after the start date. This segment will
                      not affect points until corrected.
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="text-pretty text-[11px] text-[var(--content-secondary)]">
            No custom segments. Add one to override the base weights for part of
            the selected range.
          </p>
        )}
        <button
          type="button"
          onClick={() =>
            update({
              pointsSegments: [
                ...params.pointsSegments,
                {
                  id: crypto.randomUUID(),
                  fromTs: rangeFromTs,
                  toTs: rangeToTs,
                  weightNew: params.weightNew,
                  weightExt: params.weightExt,
                  weightBoost: params.weightBoost,
                },
              ],
            })
          }
          className="mt-2 rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-1.5 text-xs font-semibold text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
        >
          Add segment
        </button>
      </Section>

      <Section
        title="Participation Bonus"
        hint="Reward consistent voters who stay active across the full selected range."
      >
        <div className="grid grid-cols-1 gap-2">
          <NumberField
            label="Full-epoch ×"
            value={params.participationMultiplier}
            step={0.25}
            min={1}
            max={5}
            onChange={(n) => update({ participationMultiplier: n })}
            hint="Multiplier on total earned points if actor voted in every epoch of the range"
          />
        </div>
      </Section>

      <Section
        title="Reward Floor"
        hint="Actors whose initial pro-rata reward falls below this MEZO amount are culled (reward → 0) and the forfeited share is redistributed to the remaining actors in proportion to points. Set to 0 to disable."
      >
        <NumberField
          label="Floor (MEZO)"
          value={Math.round(wadToMezo(params.rewardFloorMezoWad))}
          step={1}
          min={0}
          onChange={(n) => update({ rewardFloorMezoWad: mezoToWad(n) })}
          hint="Default 20 — keeps the pool from being smeared too thin."
        />
      </Section>

      <Section
        title="APR Conversion"
        hint="Only used to render the APR column on the leaderboard. Does not affect rewards."
      >
        <NumberField
          label="MEZO price (USD)"
          value={params.mezoUsd}
          step={0.01}
          min={0}
          onChange={(n) => update({ mezoUsd: n })}
        />
      </Section>

      <button
        type="button"
        onClick={() => {
          setLastClickedPresetLabel(null)
          onReset()
        }}
        className="self-start rounded border border-[var(--border)] bg-[var(--surface-tertiary)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--content-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--content-primary)]"
      >
        Reset to defaults
      </button>
    </div>
  )
}
