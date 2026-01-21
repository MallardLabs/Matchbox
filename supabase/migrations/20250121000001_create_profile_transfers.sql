-- Migration: Create profile_transfers table for tracking gauge profile metadata transfers
-- Gauge owners can transfer their profile metadata from one gauge to another once per epoch

-- Create the profile_transfers table
CREATE TABLE IF NOT EXISTS public.profile_transfers (
    id SERIAL PRIMARY KEY,
    owner_address TEXT NOT NULL,
    from_gauge_address TEXT NOT NULL,
    to_gauge_address TEXT NOT NULL,
    epoch_start INTEGER NOT NULL,
    transferred_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for checking if owner has transferred this epoch
CREATE INDEX IF NOT EXISTS idx_profile_transfers_owner_epoch 
ON public.profile_transfers(owner_address, epoch_start);

-- Create index for looking up transfer history by gauge
CREATE INDEX IF NOT EXISTS idx_profile_transfers_from_gauge 
ON public.profile_transfers(from_gauge_address);

CREATE INDEX IF NOT EXISTS idx_profile_transfers_to_gauge 
ON public.profile_transfers(to_gauge_address);

-- Enable Row Level Security
ALTER TABLE public.profile_transfers ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read transfer history
DROP POLICY IF EXISTS "Anyone can read profile transfers" ON public.profile_transfers;
CREATE POLICY "Anyone can read profile transfers" ON public.profile_transfers
    FOR SELECT USING (true);

-- Policy: Insert is done via edge function with service role, but allow for application layer
DROP POLICY IF EXISTS "Users can insert profile transfers" ON public.profile_transfers;
CREATE POLICY "Users can insert profile transfers" ON public.profile_transfers
    FOR INSERT WITH CHECK (true);

-- Add comments for documentation
COMMENT ON TABLE public.profile_transfers IS 'Tracks gauge profile metadata transfers between gauges owned by the same user';
COMMENT ON COLUMN public.profile_transfers.owner_address IS 'The wallet address that performed the transfer';
COMMENT ON COLUMN public.profile_transfers.from_gauge_address IS 'The source gauge address the profile was transferred from';
COMMENT ON COLUMN public.profile_transfers.to_gauge_address IS 'The destination gauge address the profile was transferred to';
COMMENT ON COLUMN public.profile_transfers.epoch_start IS 'The epoch timestamp when the transfer occurred (used to enforce once-per-epoch limit)';
COMMENT ON COLUMN public.profile_transfers.transferred_at IS 'The exact timestamp when the transfer was recorded';

-- Create a unique constraint to prevent duplicate transfers in the same epoch
-- This enforces that an owner can only transfer ONCE per epoch (not per gauge pair)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profile_transfers_unique_owner_epoch 
ON public.profile_transfers(owner_address, epoch_start);
