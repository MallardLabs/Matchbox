import type { AcademyParams } from "@/lib/academy/simulate"
import { parseUnits } from "viem"

type Props = {
  params: AcademyParams
  onChange: (next: AcademyParams) => void
}

const SEMESTER_PRESETS: ReadonlyArray<{ label: string; mezo: number }> = [
  { label: "S0  ·  1M", mezo: 1_000_000 },
  { label: "S1  ·  4M", mezo: 4_000_000 },
  { label: "S2  ·  10M", mezo: 10_000_000 },
  { label: "S3  ·  4M", mezo: 4_000_000 },
]

function mezoToWad(mezo: number): bigint {
  if (!Number.isFinite(mezo) || mezo <= 0) return 0n
  return parseUnits(mezo.toFixed(6), 18)
}

function wadToMezo(wad: bigint): number {
  if (wad <= 0n) return 0
  return Number(wad / 10n ** 12n) / 1e6
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
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--content-secondary)]">
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
        <span className="text-[10px] text-[var(--content-secondary)]">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

export default function AcademyKnobs({ params, onChange }: Props) {
  const update = (patch: Partial<AcademyParams>) =>
    onChange({ ...params, ...patch })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {SEMESTER_PRESETS.map((preset) => (
          <button
            type="button"
            key={preset.label}
            onClick={() => update({ budgetMezoWad: mezoToWad(preset.mezo) })}
            className="rounded bg-[var(--surface-tertiary)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--content-primary)] hover:bg-[var(--surface-secondary)]"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <NumberField
        label="Budget (MEZO)"
        value={Math.round(wadToMezo(params.budgetMezoWad))}
        step={100_000}
        min={0}
        onChange={(n) => update({ budgetMezoWad: mezoToWad(n) })}
      />

      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="W new"
          value={params.weightNew}
          step={0.5}
          min={0}
          onChange={(n) => update({ weightNew: n })}
        />
        <NumberField
          label="W ext"
          value={params.weightExt}
          step={0.5}
          min={0}
          onChange={(n) => update({ weightExt: n })}
        />
        <NumberField
          label="W boost"
          value={params.weightBoost}
          step={0.5}
          min={0}
          onChange={(n) => update({ weightBoost: n })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Full-epoch ×"
          value={params.participationMultiplier}
          step={0.25}
          min={1}
          max={5}
          onChange={(n) => update({ participationMultiplier: n })}
          hint="Multiplier on lock-created points if actor boosted in every epoch"
        />
        <NumberField
          label="Boost cap / epoch / gauge"
          value={params.boostCapPerEpoch}
          step={1}
          min={1}
          max={20}
          onChange={(n) =>
            update({ boostCapPerEpoch: Math.max(1, Math.round(n)) })
          }
          hint="Excess events scored at 0.25×"
        />
      </div>

      <NumberField
        label="MEZO USD"
        value={params.mezoUsd}
        step={0.01}
        min={0}
        onChange={(n) => update({ mezoUsd: n })}
        hint="Used only for APR conversion"
      />
    </div>
  )
}
