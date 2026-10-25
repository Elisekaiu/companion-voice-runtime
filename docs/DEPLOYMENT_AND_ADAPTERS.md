# Deployment & Runtime Portability

Companion Voice Runtime's **reference deployment** is:

- an always-on Linux VPS;
- Node.js 22+ or Docker Compose;
- HTTPS through a reverse proxy or tunnel;
- a browser/PWA on the phone;
- a Codex runtime using `codex app-server`;
- AssemblyAI / Tencent for STT and ElevenLabs for TTS.

That is the setup this repository is tested against. It is **not** the only environment the voice pipeline can use.

## How hard is the VPS requirement?

Not very.

The server needs to stay reachable while the phone is on a call, keep call/session state, stream events, and hold provider credentials. A VPS is convenient because it is always awake and publicly reachable.

You can replace the VPS with any environment that can provide the same properties:

- a home server or mini PC;
- a NAS/container host;
- a cloud VM;
- a long-running container platform;
- a laptop, if it stays awake and the phone can reach it securely.

The browser microphone/PWA path should still be served over HTTPS outside localhost.

The repository's Docker Compose file binds the call server to localhost on the host by default. Put an authenticated HTTPS reverse proxy or tunnel in front of it rather than exposing the raw call port directly.

## How hard is the Codex requirement?

More visible, but still replaceable.

The reference server has two model-runtime paths:

1. **Dedicated Codex app-server** — `src/codex/app-server.mjs`
2. **External companion bridge** — configured with `COMPANION_BRIDGE_BASE`

The rest of the phone stack does not need to know whether the text came from Codex, Claude, an API model, or another agent runtime.

The important runtime contract is:

- start/resume a conversational session;
- accept one text turn;
- stream text deltas;
- support cancellation/interruption;
- return a final assistant message;
- optionally expose model/session/usage metadata.

STT arbitration, typed repair, nonverbal hearing, voice-tone context, TTS segmentation, playback, call history, idle STT sleep/wake, and the Usage UI sit outside that model runtime.

## Easiest portability path: implement the companion bridge

Instead of editing the call pipeline, point Companion Voice Runtime at an adapter service:

```text
COMPANION_BRIDGE_BASE=https://your-runtime-bridge.example
```

The bridge currently expects two endpoints.

### POST /voice-status

Return runtime status such as:

```json
{
  "authenticated": true,
  "model": "your-model",
  "reasoning_effort": "optional",
  "active_thread_id": "optional-session-id",
  "usage": null
}
```

### POST /voice-turn

Request body:

```json
{
  "text": "the current turn plus Companion Voice Runtime call context",
  "intimate": false
}
```

Stream newline-delimited JSON packets:

```jsonl
{"type":"meta","threadId":"session-1","model":"your-model","effort":"optional"}
{"type":"started","turnId":"turn-1"}
{"type":"delta","delta":"Hello"}
{"type":"delta","delta":" there."}
{"type":"done","text":"Hello there.","threadId":"session-1","turnId":"turn-1"}
```

On failure, emit an error packet or return a non-2xx response.

This bridge is the cleanest place to translate another provider's session IDs, streaming protocol, auth, memory, or agent harness into the project's small voice-runtime contract.

## Plain model APIs

### OpenAI API / Responses

**Porting difficulty: low.**

A direct API adapter only needs to:

- keep or reconstruct conversation state;
- stream response text into `delta` packets;
- map request cancellation to the provider request;
- return the final text.

If you do not need an agent harness, filesystem tools, or a long-lived Codex thread, a plain model API can be simpler than Codex.

### Anthropic Messages API

**Porting difficulty: low.**

The same bridge pattern applies. Maintain message history or your own memory layer, stream text deltas, and translate them into the project's bridge packets.

Nothing in the STT/TTS/call-state pipeline requires an OpenAI model specifically.

## Claude Code

**Porting difficulty: medium, not a rewrite.**

Claude Code is an agent harness rather than a drop-in Codex app-server protocol, so `src/codex/app-server.mjs` cannot simply point at the `claude` executable and work unchanged.

However, Claude Code supports programmatic/headless use, session resume, and streaming JSON output. A Claude Code bridge can translate that stream into the project's `meta / started / delta / done` packets.

The parts that remain unchanged include:

- phone/PWA UI;
- microphone capture;
- AssemblyAI quiet sleep/wake;
- Tencent sidecar and STT arbitration;
- turn repair and interruption classification;
- nonverbal and voice-tone context;
- TTS segmentation and ElevenLabs playback;
- history/favorites;
- incoming-call UI and bounded follow-ups;
- optional Usage Center.

The adapter must decide how Claude Code sessions map to calls, which tools are allowed, how cancellation works, and how conversation context persists.

For a voice companion, keep the agent permission surface deliberately small. A phone response should not need interactive shell/file approvals.

## Practical compatibility table

| Environment/runtime | Expected work |
| --- | --- |
| Linux VPS + Codex app-server | Reference path; works as documented |
| Other always-on Linux machine + Codex | Mostly deployment/config changes |
| Docker host / home server / NAS | Mostly deployment/networking changes |
| OpenAI API | Small model-adapter/bridge |
| Anthropic Messages API | Small model-adapter/bridge |
| Claude Code | Medium bridge adapter; rest of voice stack reusable |
| Another agent CLI/SDK with streaming | Usually medium adapter work |
| Serverless request-only platform | Poor fit unless it supports long-lived streaming/state or externalizes that state |

## The real boundary

Companion Voice Runtime should be thought of as two layers:

```text
VOICE RUNTIME
microphone → STT → turn logic → perception → model text → TTS → playback
                               │
                               ▼
MODEL / COMPANION ADAPTER
Codex app-server | bridge | OpenAI API | Claude API | Claude Code | other
```

The public project is optimized for the first layer. Codex is the reference adapter, not the definition of the project.
