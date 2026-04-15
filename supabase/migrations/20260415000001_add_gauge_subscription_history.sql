-- Migration: Add subscription analytics to historical gauge snapshots
-- This records whether a gauge was under, over, or near optimally subscribed
-- when its epoch APY was captured.

ALTER TABLE public.gauge_history
    ADD COLUMN IF NOT EXISTS optimal_vemezo_weight NUMERIC(78, 0),
    ADD COLUMN IF NOT EXISTS subscription_ratio NUMERIC(20, 8),
    ADD COLUMN IF NOT EXISTS subscription_delta_vemezo NUMERIC(78, 0),
    ADD COLUMN IF NOT EXISTS subscription_status TEXT CHECK (
        subscription_status IN ('under', 'perfect', 'over', 'unknown')
    ),
    ADD COLUMN IF NOT EXISTS apy_at_optimal NUMERIC(20, 4),
    ADD COLUMN IF NOT EXISTS oversubscription_dilution NUMERIC(20, 8);

CREATE INDEX IF NOT EXISTS idx_gauge_history_subscription_status
    ON public.gauge_history(subscription_status);

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
    oversubscription_dilution
FROM public.gauge_history
ORDER BY gauge_address, epoch_start DESC;

COMMENT ON COLUMN public.gauge_history.optimal_vemezo_weight IS 'veMEZO voting weight needed for the gauge to reach optimal 5x boost for this epoch';
COMMENT ON COLUMN public.gauge_history.subscription_ratio IS 'Actual veMEZO weight divided by optimal veMEZO weight';
COMMENT ON COLUMN public.gauge_history.subscription_delta_vemezo IS 'Actual veMEZO weight minus optimal veMEZO weight';
COMMENT ON COLUMN public.gauge_history.subscription_status IS 'Subscription status at snapshot time: under, perfect, over, or unknown';
COMMENT ON COLUMN public.gauge_history.apy_at_optimal IS 'Estimated APY if the same incentives were distributed at the optimal veMEZO weight';
COMMENT ON COLUMN public.gauge_history.oversubscription_dilution IS 'Estimated fractional APY dilution caused by oversubscription, where 0.25 means 25% lower than optimal';
