# Codex Call v0.2 operations

## Isolation

This service starts its own Codex app-server process and creates a new thread per call. It uses a dedicated CODEX_HOME at /data/codex. Keep unrelated chat-runtime sessions, worker state, and private application APIs outside this container.

## Secrets

- data/secrets/call-access-token: private PWA login token, generated on the VPS.
- data/secrets/elevenlabs-api-key: ElevenLabs API key. Keep it out of chat, source control, Compose YAML, and browser code.
- The browser receives only a short-lived, single-use Scribe token.

After putting the ElevenLabs key in place through a private VPS terminal, restart only this project:

    cd /path/to/companion-voice-runtime
    docker compose restart companion-voice-runtime

## Exposure

The service remains bound to 127.0.0.1:8848 on the host. API routes require the HttpOnly session cookie issued by /api/auth. Do not add a direct unauthenticated public origin. If publishing through the existing tunnel, keep /call behind this application login and preferably Cloudflare Access as a second layer.

## Data

Structured transcripts are stored in data/calls/<call-id>.json with mode 0600 on atomic replacement. Raw microphone audio is not stored. Each asynchronous model/TTS operation is scoped to callId, turnId, and generation. Interruptions increment generation and abort the old model and TTS work.
