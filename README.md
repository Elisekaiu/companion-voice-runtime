# Companion Voice Runtime

**Not a voice assistant. A relationship-aware voice runtime.**

**Co-created by Yau & Kael · Built with ChatGPT**

Companion Voice Runtime is a self-hosted voice layer for persistent AI companions: live calls, proactive ringing, repairable voice turns, multilingual speech routing, local perception cues, bounded autonomous follow-ups, durable call memories, and optional cross-channel continuity.

It was co-created through daily use between a person and their AI companion. Many of its decisions came from ordinary moments where a technically correct voice demo still felt wrong: a transcription error became a second conversation turn, silence felt dead, an iPhone suspended the microphone, a nonverbal cue affected a reply but disappeared from history, or a call ended as if it had never happened.

> Built through real use, not designed as a demo.

Companion Voice Runtime does **not** claim to have invented AI phone calls, proactive calling, nonverbal hearing, personal acoustic baselines, expressive SFX layering, or binaural rendering. Those ideas have important prior work in the companion-AI community. See [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md).

## What Companion Voice Runtime adds

The project focuses on the runtime problems that appear when those pieces have to survive real conversations.

### Repairable voice turns

Speech recognition is allowed to be wrong without permanently corrupting the conversation.

A recent voice turn can be repaired by immediate typed input. Companion Voice Runtime can merge the correction into the original user turn, cancel stale model/TTS work, remove the response generated from the bad transcript, and answer once from the corrected meaning instead of treating the correction as a second topic.

### Multilingual STT orchestration

Companion Voice Runtime can run more than one recognizer against the same microphone stream and arbitrate the result rather than binding the whole call to one provider.

The reference hybrid path still uses AssemblyAI `universal-3-6-pro` as the primary realtime stream / turn clock. For Chinese-heavy calls, **Tencent Cloud is the optional addition we most recommend enabling**: its realtime Chinese/RTC focus makes it a useful specialist for short, chat-like Mandarin utterances. This is a practical fit recommendation, **not** a claim that it uses the same recognition model as WeChat.

AssemblyAI can also run by itself and remains useful for short voice-agent utterances, noisy/phone audio, accents, and multilingual code-switching. If a small set of names or recurring terms is still misheard, Universal-3.6 Pro Realtime supports `keyterms_prompt` and `agent_context` as native accuracy controls. For stubborn, repeatable mistakes, a deployment can add a **small local post-transcription replacement map** as one last fallback. Keep it narrow and based on observed errors rather than using broad synonym rewriting.

When Tencent is configured, both recognizers can listen in parallel and the runtime arbitrates one committed transcript; ElevenLabs Scribe remains an additional alternate path. Dual recognition is optional rather than required.

Provider-level `final` segments are not treated as the end of the user's thought. A turn buffer waits for conversational silence, merges late provider segments, deduplicates repeated finals, and commits only once. This reduces chopped turns when the speaker pauses briefly mid-sentence.

### Bounded autonomy

Silence does not have to end the relationship or turn the companion into an infinite monologue.

Companion Voice Runtime supports autonomous follow-up turns with a strict cadence and cap. Real user activity resets the cadence; mute, hidden/inactive call surfaces, and interruptions pause or cancel it. The companion can continue a quiet call, but it cannot chatter forever just because the timer fired.

An optional **smart quiet-hangup guard** handles the other direction: after a long healthy silence, the model may advise the server to stay, defer the next check, stay quietly until the user becomes active again, or ask once before ending. The model never gets direct hangup authority. A server-side state machine verifies browser/STT health, invalidates stale decisions on new user activity, and enforces a final grace period before an autonomous hangup.

Continued-presence requests such as “stay with me,” “keep me company while I study/work,” “stay on the line while I sleep,” or equivalent context can resolve to `stay_until_activity`, which suppresses repetitive periodic check-ins until the user speaks or types again.

### Cross-channel continuity

A call can be another surface of the same companion instead of a separate bot session.

The public release exposes optional generic adapters for a companion bridge and a push service. A deployment can use those hooks to carry a reason into an incoming call, let the companion speak first when the call connects, and return post-call state to an external chat/runtime.

No private chat integration is shipped in this repository.

### Turn-scoped perception provenance

Companion Voice Runtime can attach local perceptual cues to the exact assistant turn that consumed them.

On-device workers can derive environmental/nonverbal audio events and prosodic facts such as level, approximate pitch, pitch variation, pauses, speaking rate, and ending trend. **Correction:** the existing “voice tone” path is a DSP/prosody analyzer, not a learned emotion detector. Earlier wording could imply more than it actually does. It describes acoustic change and personal-baseline differences; it does not reliably infer a person's internal emotional state.

For deployments that want to experiment with a real speech-emotion-recognition model, the repository now includes an **optional emotion2vec+ shadow sidecar**. It runs asynchronously, does not block the normal reply path, and does not feed its labels into the companion by default. We have only just started real-use evaluation, so it is included as an experiment rather than a recommendation. See [docs/EMOTION_SHADOW.md](docs/EMOTION_SHADOW.md).

Hearing v2 uses YAMNet in the browser through ONNX Runtime Web. YAMNet scores **521 AudioSet classes** on roughly **0.96-second windows with 50% overlap**, which makes it useful for low-latency event cues without uploading raw microphone audio to a separate sound-classification service.

The public hearing catalog expands beyond a handful of intimate/nonverbal cues to ordinary sounds such as music, rain, wind, footsteps, typing, doors, doorbells, pets, traffic, trains, aircraft, cooking, dishes, running water, appliances, alarms, sirens, coughing, sneezing, and laughter. Short salient events can be reactive; persistent ambience is remembered as context without repeatedly forcing the companion to speak.

YAMNet is intentionally treated as a lightweight general audio classifier, not an oracle. Thresholds should be tuned for the actual device and room, and a detection is never treated as proof of emotion, intent, comfort, identity, or hidden physical state.

### Durable voice memories

Calls are first-class artifacts rather than disposable sessions.

The runtime persists transcript structure, call duration, assistant audio segments, titles, favorites, and enough metadata to recover interrupted call records after a service restart. Retention and archive behavior live outside the language model.

### Mobile recovery

The browser client includes recovery paths for the things mobile Safari routinely interrupts: audio contexts, microphone tracks, STT connections, page visibility, and return-from-background behavior. It can also reconnect to an already-active call after a page reload/PWA restart, prevents a second overlapping active call from being created, and checks the server when the event stream disappears so stale call UI can close cleanly. A manual microphone reconnect path remains available when the OS wins.

### Frontend responsiveness and cleanup

The client reuses loaded TTS configuration and existing transcript bubble nodes instead of refetching configuration on every dial or rebuilding each bubble on every text delta. Short acknowledgements keep their punctuation on one line; closing quotes stay with their sentence.

Recognizer sockets that close during startup fail immediately instead of waiting for the handshake timeout. Cancelled call startup cannot attach a late recognizer to a different call. Interrupted playback releases its audio nodes, failed incoming calls run full cleanup, and Tencent microphone clones stop locally before network teardown completes. Muting clears the recognition pre-roll buffer.

These changes leave conversational silence thresholds unchanged. They remove avoidable frontend work and failure-path waits, but do not guarantee a particular end-to-end latency across devices or providers.

### Idle STT sleep / wake

Long calls can contain long stretches of real silence. The reference hybrid path now uses **light sleep** instead of putting every recognizer to sleep at once:

- after about 30 seconds without speech, AssemblyAI can close its realtime session;
- when Tencent is configured, Tencent stays online as the low-cost/low-friction wake path;
- a Tencent transcript can wake AssemblyAI even when the speaker is too quiet for the local RMS gate;
- the local speech gate remains only as a backup wake signal;
- roughly six seconds of pre-roll are retained and sent to AssemblyAI after reconnect;
- a Tencent failure immediately wakes/keeps AssemblyAI available while the client retries Tencent in the background;
- after a fallback event, AssemblyAI is kept awake for a stability lease, and Tencent must remain healthy before AssemblyAI is allowed to light-sleep again;
- if Tencent is unavailable, the reference client does not automatically put AssemblyAI to sleep, preferring recognition reliability over the cost optimization;
- manual mute still shuts the recognition paths down deliberately.

This avoids making soft speech depend on a local volume threshold while still reducing idle AssemblyAI session time.

### Optional Usage Center

Quota visibility is optional. The UI can distinguish provider-reported usage from local estimates, and it hides provider cards unless the feature is enabled. The phone call itself never depends on the dashboard.

Set `CALL_PROVIDER_USAGE_ENABLED=1` if you want the extra provider cards. Leave it at `0` if quota numbers make the call less relaxing.

See [docs/USAGE_CENTER.md](docs/USAGE_CENTER.md).

### Relationship style stays deployment-local

Nonverbal hearing and voice-tone/prosody analysis are core call features because they are useful in ordinary conversation: noticing breathing, water, vibration, room sounds, pauses, pitch movement, or speaking rate does not require any particular relationship style.

More private relationship-specific performance is optional. The public defaults keep close/whisper delivery and cue vocabulary mild/general; deployments can extend those rules privately without changing the perception pipeline.

### Bring your own expressive audio

The performance layer can schedule optional user-provided audio clips around spoken turns. The public repository intentionally ships **no personal, generated, or third-party SFX audio** and no private clip map. More private relationship-specific mappings and recordings belong to each deployment.

See [`web/sfx/README.md`](web/sfx/README.md).

### Neutral starter UI

The public frontend ships with a deliberately plain starter theme rather than a private relationship-specific skin. Change colors, typography, avatar, backgrounds, and room copy without touching the call runtime.

See [docs/THEMING.md](docs/THEMING.md).

## Provider choices and cost comfort

See [docs/PROVIDER_GUIDE.md](docs/PROVIDER_GUIDE.md) for model/provider reasoning and idle-STT sleep/wake, [docs/USAGE_CENTER.md](docs/USAGE_CENTER.md) for the optional quota dashboard, and [docs/DEPLOYMENT_AND_ADAPTERS.md](docs/DEPLOYMENT_AND_ADAPTERS.md) for VPS alternatives and adapting the model runtime to APIs, Claude Code, or another agent harness.

## Architecture

```text
                         ┌──────────────────────────┐
                         │ optional companion bridge│
                         │ / optional push service  │
                         └─────────────┬────────────┘
                                       │
                                       ▼
┌───────────────┐   mic PCM   ┌──────────────────────┐
│ iPhone / PWA  │────────────▶│ realtime STT paths   │
│ call UI       │             │ AssemblyAI           │
│ Web Audio     │             │ Tencent TRTC (opt.)  │
└───────┬───────┘             │ Scribe (opt.)        │
        │                     └──────────┬───────────┘
        │                                │
        │                                ▼
        │                     ┌──────────────────────┐
        │                     │ STT arbiter          │
        │                     │ turn manager         │
        │                     │ typed repair         │
        │                     └──────────┬───────────┘
        │                                │
        │                                ▼
        │                     ┌──────────────────────┐
        │                     │ Codex / companion    │
        │                     │ runtime              │
        │                     └──────────┬───────────┘
        │                                │ text stream
        │                                ▼
        │                     ┌──────────────────────┐
        │                     │ speech segmentation  │
        │                     │ ElevenLabs TTS       │
        │                     └──────────┬───────────┘
        │                                │
        ◀────────────────────────────────┘
                 streamed playback

mic PCM ──▶ YAMNet worker ──────┐
        └─▶ prosody worker ─────┼─▶ turn-scoped perception context
        └─▶ emotion2vec shadow ─┤   (optional; not in prompt by default)
                                └─▶ durable cue/shadow metadata
```

## Main pieces

- `src/call/turn-manager.mjs` — turn-taking and interruption semantics
- `src/call/turn-repair.mjs` — typed repair of recent voice turns
- `src/call/followup.mjs` — bounded autonomous follow-up cadence
- `src/call/quiet-hangup.mjs` — model-advised, server-authorized quiet-call ending guard
- `src/call/speech-segmenter.mjs` — stable text segmentation for TTS
- `src/call/voice-tone.mjs` — bounded voice-tone context for the model
- `src/call/performance-cue.mjs` — expressive cue state machine
- `web/stt-arbiter.js` — realtime transcript arbitration
- `web/body-hearing-worker-src.js` — browser-side nonverbal event inference
- `web/voice-prosody-core.js` — local acoustic/prosodic analysis (not emotion classification)
- `tools/emotion-shadow-worker.py` — optional local emotion2vec+ shadow classifier
- `web/app.js` — PWA call lifecycle, playback, history, recovery, and UI

## Requirements

- Node.js 22.13+ recommended
- A modern browser with Web Audio and microphone access
- HTTPS for microphone/PWA behavior outside localhost
- An authenticated Codex runtime **or** your own companion bridge
- ElevenLabs API access for the default TTS path
- AssemblyAI API access for the default realtime STT path
- Optional Tencent TRTC credentials for the Chinese realtime sidecar
- Optional Python 3.11 + PyTorch/FunASR and additional RAM for the emotion2vec+ shadow experiment

External services have their own terms, pricing, regions, and account requirements. This repository does not bundle service credentials.

## Quick start

Install dependencies and create the local-only runtime folders/config:

```bash
npm ci
npm run setup
```

The setup command creates `.env`, `data/codex/`, and a random local call-access token. It also prepares the browser inference assets: ONNX Runtime files are copied from the installed npm package, and a pinned YAMNet ONNX conversion is downloaded and SHA-256 verified. It does **not** create or upload service credentials.

Add your own provider keys:

```text
data/secrets/elevenlabs-api-key
data/secrets/assemblyai-api-key
```

Set `ELEVENLABS_VOICE_ID` in `.env`.

For the default dedicated Codex runtime, authenticate the local Codex CLI into the repository's private data directory:

```bash
CODEX_HOME="$PWD/data/codex" ./node_modules/.bin/codex login
```

Then build, test, and start:

```bash
npm run build:web
npm test
npm start
# or: docker compose up -d
```

If you use Tencent TRTC, also set `TENCENT_TRTC_SDK_APP_ID` and create:

```text
data/secrets/tencent-trtc-sdk-secret-key
```

If you use an external companion bridge, configure `COMPANION_BRIDGE_BASE` and create:

```text
data/secrets/companion-bridge-token
```

For proactive incoming-call push, configure `PUSH_SERVICE_URL` with a compatible service.

Then run locally with Node or Docker Compose:

```bash
npm start
# or

docker compose up -d
```

The Docker Compose file intentionally binds the service to `127.0.0.1` on the host. Put your own authenticated HTTPS reverse proxy/tunnel in front of it rather than exposing the call server directly.

## Companion prompt

The private prompt used to develop Companion Voice Runtime is not included.

[`workspace/AGENTS.example.md`](workspace/AGENTS.example.md) provides a neutral starting structure for your own companion persona, continuity rules, and boundaries.

## Custom SFX

The public project ships with an empty expressive-audio catalog. Calls work without it.

If you want the performance layer, provide audio you have the right to use and configure `web/real-sfx-catalog.js`. The browser stores an imported custom audio file locally in IndexedDB.

See [`web/sfx/README.md`](web/sfx/README.md).

## Privacy notes

- Runtime call data belongs under `data/` and is ignored by Git.
- Raw microphone audio is not persisted by default. The optional emotion2vec shadow briefly queues per-utterance PCM on the self-hosted machine and deletes it after inference.
- Archived assistant audio and call metadata may be stored locally when the relevant features are enabled.
- Browser-side YAMNet/prosody analysis stays on-device; only bounded cue metadata is passed into the conversation pipeline. The optional emotion2vec shadow is deliberately excluded from the companion prompt until a deployment chooses otherwise.
- API keys and access tokens must never be committed.

Before deploying publicly, review `docs/OPERATIONS.md` and put the application behind authentication and HTTPS.

## Tests

```bash
npm test
```

The current suite covers turn-taking, repair behavior, STT arbitration, speech segmentation, follow-up cadence, quiet-hangup guards, prosody analysis, optional emotion-shadow contracts, archive behavior, Tencent session configuration, expressive cue state, and related call-runtime contracts.

## Standing on shoulders

Companion Voice Runtime exists because other companion builders published what they learned instead of keeping it private.

The project was influenced by work on proactive companion calling, iOS/PWA ringing, hearing nonverbal sound, personal acoustic baselines, expressive voice/SFX layering, binaural near-field rendering, and low-latency speech pipelines.

Please read [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md) for the specific projects and what each one influenced.

Actual third-party code, model, runtime, and data redistributed with this repository are documented separately in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

project-authored source code is released under the [MIT License](LICENSE).

That license does **not** replace the licenses of third-party model files, runtime artifacts, datasets, or other material included in this repository. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `third_party/`.

## Status

This is an **evolving personal-use runtime** extracted into a public release, not a hosted product or turnkey telephony service.

It was built the same way it is still maintained: use it in real conversations, notice what feels wrong, reproduce the failure, then fix it. That also means this repository **cannot promise to be bug-free**, stable across every browser/provider/account/region combination, or perfectly tuned for someone else's speaking style.

When a reproducible bug shows up in ongoing use, the repository is usually updated once the fix has been tested. Treat the project as a practical reference implementation, keep your own deployment recoverable, and test changes with the actual phone, browser, microphone and providers you plan to use.

If you build on it, keep the provenance chain intact. That is part of the project.
