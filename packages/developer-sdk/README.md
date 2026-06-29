# Matchbox Developer SDK

```ts
import { MatchboxClient } from "@matchbox-markets/sdk"

const matchbox = new MatchboxClient({ apiKey: process.env.MATCHBOX_API_KEY! })
const gauge = await matchbox.getGaugeByVeBtcToken(42n)
```

Use publishable keys only for gauge reads. Profile and authorization APIs require a secret server key.
