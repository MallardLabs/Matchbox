import { AnalyticsEarningPower } from "@/components/analytics/AnalyticsEarningPower"
import { AnalyticsGaugesTable } from "@/components/analytics/AnalyticsGaugesTable"
import { AnalyticsKPIBar } from "@/components/analytics/AnalyticsKPIBar"
import { AnalyticsPoolsTable } from "@/components/analytics/AnalyticsPoolsTable"
import { AnalyticsRevenueChart } from "@/components/analytics/AnalyticsRevenueChart"

export default function AnalyticsPage(): JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-bold text-[var(--content-primary)]">
          <span className="text-[#F7931A]">$</span> analytics
        </h1>
        <p className="font-mono text-sm text-[var(--content-secondary)]">
          Protocol performance, revenue, and earning power across Mezo
        </p>
      </header>

      <AnalyticsKPIBar />
      <AnalyticsRevenueChart />
      <AnalyticsGaugesTable />
      <AnalyticsPoolsTable />
      <AnalyticsEarningPower />
    </div>
  )
}
