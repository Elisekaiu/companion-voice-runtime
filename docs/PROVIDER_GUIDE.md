# Provider & Model Guide

Companion Voice Runtime uses reference defaults rather than claiming a universal provider ranking.

**Copy the roles, not necessarily our vendors.**

A useful voice-call stack has four roles: a primary realtime STT path, an optional language-specialist sidecar, a transcript arbiter, and an expressive TTS path.

## Reference defaults

- **Primary realtime STT:** AssemblyAI `universal-3-6-pro`
- **Chinese sidecar:** Tencent TRTC RealtimeTranscriber
- **STT alternate:** ElevenLabs Scribe v2 Realtime
- **Reference TTS:** ElevenLabs v4 Turbo
- **TTS alternates:** Multilingual v2 and Flash v2.5

## Why AssemblyAI is the primary STT

The reference client uses `universal-3-6-pro` in `balanced` mode.

This choice came from actual calls: short replies, natural pauses, interruptions, names, and Chinese/English code-switching. AssemblyAI also describes Universal-3.6 Pro Realtime as targeting voice-agent short utterances, noisy or phone audio, accents, and code-switching.

The reference turn-silence settings are:

```text
min_turn_silence = 320 ms
max_turn_silence = 1600 ms
```

They are deliberately not hyper-aggressive. The goal is to avoid chopping an ordinary conversational pause into multiple turns. Treat these values as tuning defaults and re-test them for your own language, microphone, and speaking style.

## Why Tencent is a sidecar

The hybrid design is intentional:

1. AssemblyAI remains the primary realtime stream and turn clock.
2. Tencent listens in parallel when configured.
3. Pure English does not wait for Tencent.
4. Chinese or mixed-language turns can use Tencent as additional transcript evidence.
5. `web/stt-arbiter.js` chooses one committed transcript.
6. Only one committed turn reaches the companion.

This pattern is reusable: Tencent can be replaced with another language-specialist STT without changing the overall architecture.

## Why keep Scribe

Scribe v2 Realtime remains an alternate path for deployments that already use ElevenLabs. It is useful as a fallback, but it is not the current reference default.

## Why v4 Turbo is the reference TTS

The current speech-delivery pipeline has been tuned around ElevenLabs v4 Turbo, including segmentation, delivery presets, playback shaping, and optional performance layers.

So “default” means **tested and tuned for this project**, not “objectively best for every companion.”

## Quiet-mode cost control

Realtime STT can accumulate billable session time while its realtime connection stays open even when nobody is talking.

The public client therefore includes an idle cloud-STT sleep/wake path:

- after about 30 seconds without speech, the cloud STT session is terminated;
- the microphone remains local;
- a lightweight local speech gate watches for new voice activity;
- roughly 3 seconds of pre-roll are retained;
- when speech returns, cloud STT reconnects and receives the buffered audio first;
- the Tencent sidecar sleeps and wakes with the primary cloud STT.

This makes long quiet calls practical without paying for an STT connection that is doing nothing.

At the time this guide was updated (October 2026), AssemblyAI lists Universal-3.6 Pro Realtime at $0.45/hour base and describes realtime billing in terms of session duration. Verify current pricing before relying on any estimate.

Official references:

- https://www.assemblyai.com/blog/universal-3-6-pro-realtime
- https://www.assemblyai.com/blog/real-time-transcription-code-switches-multilingual-speakers

## Choosing your own stack

Test transcript accuracy, turn-ending behavior, latency, billing model, credential exposure, fallback behavior, and regional/privacy requirements separately.

A companion call is unusually sensitive to tiny speech-pipeline failures. Test with your real microphone, room, language mix, names, and one-word replies.
