-- Migration: Update validator display names from monikers to clean human-readable names
-- Updates gauge_profiles display_name mapping monikers to proper titles.

UPDATE public.gauge_profiles
SET display_name = CASE
    WHEN LOWER(vebtc_token_id) = 'voyage-through-time' OR LOWER(display_name) = 'voyage-through-time' THEN 'Beem'
    WHEN LOWER(vebtc_token_id) = 'stakingcabin' OR LOWER(display_name) = 'stakingcabin' THEN 'StakingCabin'
    WHEN LOWER(vebtc_token_id) = 'node.monster' OR LOWER(display_name) = 'node.monster' THEN 'Node.Monster'
    WHEN LOWER(vebtc_token_id) = 'arashaus' OR LOWER(display_name) = 'arashaus' THEN 'arashaus'
    WHEN LOWER(vebtc_token_id) = 'backbone-mezo' OR LOWER(display_name) = 'backbone-mezo' THEN 'Backbone'
    WHEN LOWER(vebtc_token_id) = 'flowdesk' OR LOWER(display_name) = 'flowdesk' THEN 'Flowdesk'
    WHEN LOWER(vebtc_token_id) = 'infrasingularity' OR LOWER(display_name) = 'infrasingularity' THEN 'InfraSingularity'
    WHEN LOWER(vebtc_token_id) = 'senseinode' OR LOWER(display_name) = 'senseinode' THEN 'SenseiNode'
    WHEN LOWER(vebtc_token_id) = 'boar-validator-1' OR LOWER(display_name) = 'boar-validator-1' THEN 'Boar'
    WHEN LOWER(vebtc_token_id) = 'animocabrands' OR LOWER(display_name) = 'animocabrands' THEN 'Animoca'
    WHEN LOWER(vebtc_token_id) = 'validation cloud' OR LOWER(display_name) = 'validation cloud' THEN 'Validation Cloud'
    WHEN LOWER(vebtc_token_id) = 'maestro-org-validator-mainnet0' OR LOWER(display_name) = 'maestro-org-validator-mainnet0' THEN 'Maestro'
    WHEN LOWER(vebtc_token_id) = 'lavender.five nodes' OR LOWER(display_name) = 'lavender.five nodes' THEN 'Lavender.Five'
    WHEN LOWER(vebtc_token_id) = 'encode' OR LOWER(display_name) = 'encode' THEN 'Encode'
    WHEN LOWER(vebtc_token_id) = 'enigma' OR LOWER(display_name) = 'enigma' THEN 'Enigma'
    WHEN LOWER(vebtc_token_id) = 'globalstake' OR LOWER(display_name) = 'globalstake' THEN 'GlobalStake'
    WHEN LOWER(vebtc_token_id) = 'simply staking' OR LOWER(display_name) = 'simply staking' THEN 'Simply Staking'
    WHEN LOWER(vebtc_token_id) = 'chaindaq-mezo-mainnet-1' OR LOWER(display_name) = 'chaindaq-mezo-mainnet-1' THEN 'ChainDAQ'
    WHEN LOWER(vebtc_token_id) = 'liquidlambda' OR LOWER(display_name) = 'liquidlambda' THEN 'LiquidLambda'
    WHEN LOWER(vebtc_token_id) = 'imperator.co' OR LOWER(display_name) = 'imperator.co' THEN 'Imperator'
    WHEN LOWER(vebtc_token_id) = 'millenniumclubdao' OR LOWER(display_name) = 'millenniumclubdao' THEN 'Millennium Club (MCLB)'
    ELSE display_name
END
WHERE display_name IN (
    'voyage-through-time', 'StakingCabin', 'Node.Monster', 'arashaus',
    'backbone-mezo', 'Flowdesk', 'InfraSingularity', 'SenseiNode',
    'boar-validator-1', 'AnimocaBrands', 'Validation Cloud',
    'maestro-org-validator-mainnet0', 'Lavender.Five Nodes', 'Encode',
    'Enigma', 'Globalstake', 'Simply Staking', 'chaindaq-mezo-mainnet-1',
    'LiquidLambda', 'Imperator.co', 'MillenniumClubDAO'
);
