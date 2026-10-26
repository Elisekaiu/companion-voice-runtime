# Optional emotion2vec+ shadow experiment

> Experimental. This is **not** required for Companion Voice Runtime, and we do not yet have enough long-term real-call experience to recommend it as a production emotion layer.

## First, a terminology correction

Earlier versions of this project described the browser voice-tone/prosody path in language that could sound like “emotion detection.” That was too strong.

The existing browser worker is a **DSP/prosody analyzer**, not a learned emotion classifier. It measures acoustic facts such as:

- RMS / relative loudness
- voiced vs silent time
- pause ratio
- approximate F0 / pitch
- pitch range and variation
- ending pitch movement
- speaking rate derived from transcript length and voiced duration
- change relative to a per-device personal baseline

Those features can be useful context, but “speaking faster with wider pitch variation” is not the same claim as “the user is excited,” “sad,” “nervous,” or any other emotional state.

We keep the prosody path because it is local, lightweight, cheap, and good at describing **how the voice changed**. We no longer describe it as a true emotion detector.

## What the optional shadow adds

The optional experiment uses `emotion2vec_plus_base`, an open speech-emotion-recognition model. Its current model card describes a base-size model of roughly **90M parameters**, fine-tuned with about **4,788 hours** of data, and a 9-class output:

- angry
- disgusted
- fearful
- happy
- neutral
- other
- sad
- surprised
- unknown

Model card: <https://huggingface.co/emotion2vec/emotion2vec_plus_base>

The runtime treats this as a **shadow signal only**:

1. the normal STT/prosody/model reply path continues without waiting for emotion2vec;
2. the completed utterance PCM is copied to a local queue on the same self-hosted machine;
3. the sidecar classifies it asynchronously;
4. raw PCM is deleted after the job completes;
5. only the top labels/scores and timing metadata are attached to that user turn;
6. the shadow result is displayed for A/B inspection but is **not sent into the companion prompt**.

This is intentional: first determine whether the classifier is actually useful on your language, voice, microphone, and room before letting it influence responses.

## Resource cost: test before enabling

This model is much heavier than the browser prosody worker.

On one project VPS used for testing (**2 vCPU, 8 GB RAM, no GPU**), `emotion2vec_plus_base` measured approximately:

- ~1.0 GB resident RAM after the model was warm;
- close to ~3 GB peak memory during cold model loading;
- about 0.9–1.2 seconds of warm CPU inference for a ~4.1 second sample.

Those are **one-machine observations, not guaranteed requirements or benchmarks**. Python/PyTorch versions, CPU generation, audio length, model revision, and other workloads can change them substantially.

If your VPS is small or already memory-constrained, leave this feature disabled. The normal prosody path remains much cheaper.

## Setup

Python 3.11 is a conservative choice for the current FunASR/PyTorch stack.

Example CPU-only environment:

```bash
python3.11 -m venv .emotion-shadow-venv
source .emotion-shadow-venv/bin/activate
pip install --upgrade pip
pip install --index-url https://download.pytorch.org/whl/cpu torch
pip install funasr huggingface_hub soundfile
```

Create the shared queue and start the worker from the repository root:

```bash
mkdir -p data/emotion-shadow/inbox data/emotion-shadow/results
EMOTION_SHADOW_DIR="$PWD/data/emotion-shadow" \
  .emotion-shadow-venv/bin/python tools/emotion-shadow-worker.py
```

Then opt the call server in:

```env
EMOTION_SHADOW_ENABLED=1
EMOTION_SHADOW_DIR=/data/emotion-shadow
```

The default Docker Compose mount maps repository `./data` to `/data`, so the host-side worker and container can share the same queue without adding a network service.

## Failure and privacy behavior

- If the worker heartbeat is stale, the call server rejects shadow PCM instead of accumulating it.
- The inbox is bounded; a backed-up queue is rejected rather than allowed to grow indefinitely.
- Per-utterance PCM is temporary and is deleted by the worker after inference.
- Raw user microphone audio is not written into call-history JSON.
- The sidecar result is matched back to the user turn by `utteranceId`.
- Shadow scores are not part of the model prompt in the reference implementation.
- `data/` is Git-ignored.

The worker also writes `data/emotion-shadow/shadow-results.jsonl` for local evaluation. Delete or disable that log if you do not want to retain score history.

## Should you enable it?

Only if you want to experiment.

The current recommendation is:

- keep the local prosody analyzer for objective acoustic/baseline information;
- optionally run emotion2vec+ in shadow mode;
- collect enough real calls to see whether its scores correlate with anything useful;
- only then consider feeding a bounded emotion signal into the companion.

A classifier label is evidence from a model, not ground truth about a person's internal state.
