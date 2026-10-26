# Optional Usage Center

Some people enjoy a long companion call but dislike wondering whether a speech or voice service is quietly consuming quota in the background. the project's Usage Center is intentionally optional.

The normal call path does not depend on it.

Enable it with `CALL_PROVIDER_USAGE_ENABLED=1`. The public example leaves it off by default.

## What the UI means

The provider cards use three labels:

- **Exact** — the number came from the provider's own account/subscription API.
- **Local** — this Companion Voice Runtime deployment records its own session usage and estimates cost from that.
- **Provider** — the service works, but billing/package usage needs a separate cloud billing adapter.

Never present a local estimate as an account balance.

## Codex

If the connected companion runtime returns Codex usage windows, Companion Voice Runtime can display them directly in the existing Usage sheet.

No extra voice-provider integration is required.

## AssemblyAI

AssemblyAI realtime sessions emit a termination payload that includes session duration.

The public call client already contains the idle sleep/wake cost-control logic. The optional usage adapter can additionally persist termination durations and summarize:

- tracked session time;
- session count;
- estimated spend using a configurable hourly rate.

This is **local accounting for this deployment**, not the AssemblyAI account balance.

The reusable helper lives at:

`src/provider-usage.mjs`

## ElevenLabs

ElevenLabs can report subscription usage through its user subscription endpoint.

If you enable this card, keep the credential on the backend. A dedicated restricted API key with **User / Access** (the `user_read` permission) is a good least-privilege choice.

Do not put the key in browser JavaScript, localStorage, screenshots, examples, or the public repository.

The public helper can read an already configured backend credential and return only the usage numbers needed by the UI.

## Tencent

TRTC speech credentials are not the same thing as Tencent Cloud billing/package credentials.

The default public card therefore reports connection state only. Exact package/billing visibility should be implemented as a separate server-side cloud-billing adapter for the user's own Tencent account.

## Optional endpoint contract

The frontend will look for:

`GET /api/provider-usage`

If the endpoint is absent or returns an error, the provider section stays hidden and the rest of the call UI continues normally.

A compatible response can contain:

```json
{
  "elevenlabs": {
    "available": true,
    "kind": "exact",
    "used": 3229,
    "limit": 30414,
    "remaining": 27185,
    "resetAt": "2026-11-25T00:00:00.000Z"
  },
  "assemblyai": {
    "available": true,
    "kind": "local",
    "sessionSeconds": 3600,
    "estimatedUsd": 0.45,
    "rateUsdPerHour": 0.45,
    "model": "universal-3-6-pro"
  },
  "tencent": {
    "available": false,
    "kind": "provider",
    "trtcConfigured": true
  }
}
```

The exact providers are replaceable. Keep the distinction between provider-reported and locally estimated usage.

## Why this is optional

Usage visibility changes comfort, not call correctness.

People who find quota dashboards reassuring can enable it. People who would rather never think about metering can leave the adapter out entirely.


## Minimal backend wiring

The optional frontend expects two authenticated routes:

- `GET /api/provider-usage` returns `await providerUsage.summary()`.
- `POST /api/calls/:callId/provider-usage` passes the termination payload to `providerUsage.record()`.

The reusable implementation is `src/provider-usage.mjs`.

If these routes are absent, the browser silently hides the provider section and the call continues normally. Keep any provider credentials on the server side.
