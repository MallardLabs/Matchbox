-- Migration: Record per-token incentive breakdown and the price snapshot used
-- to value them. Lets history rows reconstruct exactly what was bribed and
-- recompute USD totals if prices were captured incorrectly.

ALTER TABLE public.gauge_history
    ADD COLUMN IF NOT EXISTS incentive_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS btc_price_usd NUMERIC(20, 8),
    ADD COLUMN IF NOT EXISTS mezo_price_usd NUMERIC(20, 8),
    ADD COLUMN IF NOT EXISTS price_source TEXT;

COMMENT ON COLUMN public.gauge_history.incentive_breakdown IS
    'Array of {token_address, symbol, decimals, amount_raw, amount, usd_value, price_used}. amount_raw is the on-chain bigint as a string; amount is the decimal-adjusted number.';
COMMENT ON COLUMN public.gauge_history.btc_price_usd IS 'BTC/USD price used when valuing incentives for this snapshot';
COMMENT ON COLUMN public.gauge_history.mezo_price_usd IS 'MEZO/USD price used when valuing incentives for this snapshot';
COMMENT ON COLUMN public.gauge_history.price_source IS 'Source tag for the prices used, e.g. live-oracle, coingecko-historical, backfill';

CREATE OR REPLACE VIEW public.gauge_latest_stats AS
SELECT DISTINCT ON (gauge_address)
    gauge_address,
    epoch_start,
    vemezo_weight,
    vebtc_weight,
    boost_multiplier,
    total_incentives_usd,
    apy,
    unique_voters,
    recorded_at,
    optimal_vemezo_weight,
    subscription_ratio,
    subscription_delta_vemezo,
    subscription_status,
    apy_at_optimal,
    oversubscription_dilution,
    incentive_breakdown,
    btc_price_usd,
    mezo_price_usd,
    price_source
FROM public.gauge_history
ORDER BY gauge_address, epoch_start DESC;
