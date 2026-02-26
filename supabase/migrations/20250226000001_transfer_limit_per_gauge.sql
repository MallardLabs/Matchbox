-- Migration: Change profile transfer limit from per-wallet to per-source-gauge per epoch
-- Previously: one transfer per wallet per epoch
-- Now: one transfer per source gauge per epoch (wallet can transfer multiple different gauges)

-- Drop the old unique constraint (owner_address, epoch_start)
DROP INDEX IF EXISTS idx_profile_transfers_unique_owner_epoch;

-- Create new unique constraint on (from_gauge_address, epoch_start)
-- This allows a wallet to transfer multiple gauge profiles in one epoch,
-- but each individual gauge profile can only be transferred once per epoch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_transfers_unique_gauge_epoch
ON public.profile_transfers(from_gauge_address, epoch_start);

-- Update documentation
COMMENT ON TABLE public.profile_transfers IS 'Tracks gauge profile metadata transfers. Each gauge profile can only be transferred once per epoch.';
COMMENT ON COLUMN public.profile_transfers.epoch_start IS 'The epoch timestamp when the transfer occurred (used to enforce once-per-gauge-per-epoch limit)';
