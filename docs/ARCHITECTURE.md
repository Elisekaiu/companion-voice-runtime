# Codex Call — architecture

Goal: a private iPhone/PWA voice-call experience backed by the user's Codex runtime, without CallKit/native telephony.

## Reference deployment
- The tested reference uses an always-on Linux VPS as the public edge and call coordinator; another always-on HTTPS-capable host can replace it.
- iPhone PWA is the UI, microphone capture, live transcript, Web Audio playback and incoming-call screen.
- Codex app-server is the reference model runtime; the companion-bridge boundary can replace it with another API or agent harness.
- MacBook is for development/debugging only in the reference setup, not required to stay awake for incoming calls.

See [DEPLOYMENT_AND_ADAPTERS.md](DEPLOYMENT_AND_ADAPTERS.md) for portability details.

## Current reference voice stack
- Primary STT: AssemblyAI Universal-3.6 Pro Realtime.
- Chinese/mixed-language sidecar: Tencent TRTC RealtimeTranscriber when configured.
- Alternate STT: ElevenLabs Scribe v2 Realtime.
- STT arbitration keeps one primary turn clock and commits only one transcript.
- TTS: ElevenLabs v4 Turbo by default, with Multilingual v2 and Flash v2.5 as alternates.
- Turn Manager sits above VAD/STT commits and owns conversational turn-taking.
- AssemblyAI cloud STT can sleep after an idle period and wake from local voice activity with pre-roll.
- Text transcript is persisted; raw microphone audio is not persisted by default.

See [PROVIDER_GUIDE.md](PROVIDER_GUIDE.md) for the reasoning behind these reference defaults.

## Core call states
IDLE
RINGING
LISTENING
MAYBE_USER_DONE
WAITING_MODEL
WAITING_TTS
ASSISTANT_SPEAKING
INTERRUPTING
ENDING
ENDED

## Non-negotiable behavior
1. STT partial text is display-only; only committed/turn-final text can reach Codex.
2. STT commit is not equivalent to user turn end.
3. Assistant speech needs a separate speech gate; model output may be prepared before it is allowed to play.
4. Explicit user interruption cancels old model/TTS/playback work atomically.
5. All async work is scoped by callId + turnId + generation; stale callbacks are discarded.
6. Track assistant text actually played so interrupted-but-unheard text is not treated as spoken.
7. Model text stream, segmentation, TTS fetch, and playback are separate pipelines.
8. Idle cloud STT may sleep, but local call state and wake detection remain alive.
9. Do not save raw call audio unless the user explicitly enables recording.

## First implementation milestone
A private HTTPS PWA can:
- start/receive a simulated call,
- stream microphone audio to STT,
- show partial/final user transcript,
- send one finalized turn to Codex,
- stream Codex text back to the UI,
- stream TTS audio while text appears,
- interrupt assistant speech safely,
- persist a call transcript and duration.
