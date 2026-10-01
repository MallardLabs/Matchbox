/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLET_CONNECT_PROJECT_ID?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_APP_URL?: string
  readonly VITE_CLASSIC_URL?: string
  readonly VITE_EXPLORER_MAINNET_URL?: string
  readonly VITE_EXPLORER_TESTNET_URL?: string
  readonly VITE_RPC_TESTNET_URL?: string
  readonly VITE_MANAGED_GAUGE_EDITORS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
