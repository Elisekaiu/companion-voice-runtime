# Provider & Model Guide

Companion Voice Runtime uses reference defaults rather than claiming a universal provider ranking.

**Copy the roles, not necessarily our vendors.**

A useful voice-call stack has four roles: a realtime speech recognizer, an optional second recognizer with a different strength profile, a transcript/turn arbiter, and an expressive TTS path.

## Recommended starting point

### Chinese-heavy calls: enable Tencent first among the optional additions

The reference hybrid implementation still uses AssemblyAI as the primary realtime stream and turn clock. For Mandarin/Chinese-heavy calls, Tencent Cloud realtime speech recognition is the optional addition we most recommend enabling.

Why:

- it exposes dedicated realtime Chinese speech recognition in Tencent's RTC/speech stack;
- it is designed for streaming 16 kHz/8 kHz mono speech and returns results while audio is arriving;
- in practice, a Chinese-specialist realtime recognizer can be a better fit for short, chat-like Mandarin utterances than a general multilingual model.

That last point is a **practical fit recommendation**, not a claim that this API uses the same recognition model as WeChat. Test it with your own microphone, accent, region and account tier.

Reference: <https://trtc.io/document/80841>

#### Free-quota note (checked October 2026)

Tencent's international **Tencent RTC** billing pages currently advertise **10,000 free minutes per month** for AI Recognition / RTC trial usage. The AI Recognition billing page describes a monthly pool shared across Speech-to-Text, AI Real-Time Translation, and Text-to-Speech; other Tencent RTC product pages describe the offer as a first-year / trial allowance. **Check the current console for your account and region before relying on it.**

Mainland China's **Tencent Cloud ASR** is a different product/API family with different free quotas. Its current monthly free allowance is **5,000 successful calls for “one-sentence recognition”** and **5 hours for realtime speech recognition**. One-sentence recognition is for short audio (up to 60 seconds per call) and is not the same interface or billing unit as the streaming realtime path used for live calls.

In other words: do not read “5,000 calls” as “5,000 realtime phone turns,” and do not assume international Tencent RTC and mainland Tencent Cloud ASR use the same signup, API, quota, or billing rules.

Official references:
- <https://trtc.io/document/67832>
- <https://trtc.io/solutions/conversational-ai>
- <https://cloud.tencent.com/document/product/1093/35686>
- <https://cloud.tencent.com/document/product/1093/35802>

### Primary/general path: AssemblyAI Universal-3.6 Pro Realtime

The reference hybrid client uses AssemblyAI `universal-3-6-pro` as its primary realtime stream and turn clock. It can also run without Tencent. It is useful for short voice-agent utterances, noisy/phone audio, accents, and multilingual/code-switched speech.

AssemblyAI describes Universal-3.6 Pro Realtime as a 32-language realtime model trained for voice-agent/telephony conversations, with automatic language detection and improved short-utterance handling.

Reference: <https://www.assemblyai.com/blog/universal-3-6-pro-realtime>

#### Bonus accuracy layer: keyterms first, local corrections last

Universal-3.6 Pro Realtime includes **keyterms prompting** at no extra charge. AssemblyAI currently documents up to **100 terms** on streaming, and the list can be updated while a session is running. Use it for names, product terms, slang, acronyms, or other vocabulary the recognizer repeatedly misses.

`agent_context` is complementary: it gives the realtime model the conversational situation, while keyterms anchor exact vocabulary. They solve a different problem from deterministic text replacement.

AssemblyAI also has a separate **Custom Spelling** concept that behaves like find-and-replace after transcription, but do not conflate that with realtime keyterms. If your live deployment still has a handful of systematic mistakes, it can be reasonable to add a **small deployment-local replacement map** after STT as a final fallback:

```text
observed wrong form -> intended form
```

Keep that map private if it contains personal vocabulary, keep it small, and only add replacements you have repeatedly observed. Do not use it as a broad synonym rewriter: aggressive replacement can silently damage correct transcripts. Likewise, oversized keyterm lists can reduce overall accuracy, so A/B test the list instead of assuming “more hints” is always better.

References:
- <https://www.assemblyai.com/blog/fix-language-steering-streaming-transcription>
- <https://www.assemblyai.com/blog/real-time-transcription-python>
- <https://www.assemblyai.com/blog/when-keyterm-prompting-backfires>

### Additional fallback: ElevenLabs Scribe v2 Realtime

Scribe remains an optional alternate path for deployments already using ElevenLabs. It is not required by the hybrid design.

## Why the dual-recognizer path exists

Dual recognition is optional. It is useful when two providers fail differently.

The public hybrid flow works like this:

1. Tencent and AssemblyAI may listen to the same microphone stream.
2. Provider-level `final` events are treated as ASR **segments**, not automatically as the end of the user's thought.
3. `web/stt-turn-buffer.js` waits for conversational silence before committing the turn.
4. Late segments from either provider can still join the same user turn.
5. Repeated provider finals are deduplicated.
6. `web/stt-arbiter.js` chooses one transcript.
7. Only one committed turn reaches the companion.

A finalized Chinese Tencent hypothesis can beat a short English hallucination from the primary recognizer. The public repository deliberately avoids deployment-specific word-replacement dictionaries; add any domain vocabulary privately.

## Endpointing defaults

The reference turn buffer waits about:

```text
conversation silence: 1600 ms
partial timeout:       4200 ms
```

The exact provider endpointing settings are less important than the rule above: **provider final != conversation final**.

Re-test these values for your own speaking pace. Very aggressive endpointing feels fast in a demo and terrible in a real conversation. The current arbiter has one targeted fast path: once Tencent has a finalized Chinese hypothesis, it keeps the 1.6-second conversational-silence guard but does not wait the full 4.2-second partial timeout solely for a stale unfinished AssemblyAI partial.

## Light-sleep cost control

Realtime STT can accumulate session time while the connection remains open.

The current hybrid client uses **light sleep**:

- after about 30 seconds of real silence, AssemblyAI can close;
- if Tencent is configured, Tencent stays online as the wake path;
- a Tencent transcript can wake AssemblyAI, so soft speech does not have to cross a local volume threshold first;
- the local RMS speech gate remains a backup wake signal;
- roughly six seconds of microphone pre-roll are retained and sent to AssemblyAI after reconnect;
- if Tencent fails during a call, AssemblyAI is woken immediately while Tencent is retried in the background;
- after a fallback event, AssemblyAI stays awake for a short stability lease and Tencent must remain healthy before light sleep is allowed again;
- if Tencent is not available, automatic AssemblyAI sleep is skipped rather than making quiet speech depend on the local gate;
- manual mute still shuts recognition down deliberately.

The client also records a local AssemblyAI usage fallback when a browser/network exit prevents the normal provider termination event from arriving. Provider-reported billing remains authoritative; local usage is only a runtime estimate.

## Why keep one recognizer awake?

An older design put every cloud recognizer to sleep after 30 seconds and relied on local RMS activity to wake them.

That saves more connection time, but quiet speech can fall below a local amplitude threshold. Keeping the Chinese sidecar awake gives the runtime a semantic wake signal instead of asking a simple volume gate to decide whether a soft voice was speech.

If your provider pricing or privacy requirements make this tradeoff unattractive, disable the optimization or change which provider stays awake.

## Prosody is not emotion detection

A terminology correction: the browser `voice-prosody` path in this repository is **DSP/prosody analysis**, not a learned speech-emotion-recognition model. It measures observable acoustics (level, voiced time, pauses, pitch/F0 movement, speaking rate and personal-baseline differences). Those are useful features, but they do not justify claims such as “the user is sad” or “the user is nervous.”

Earlier project wording sometimes called this “voice tone” in a way that could be read as emotion detection. That was too broad, and the UI/docs now use more precise language.

### Optional experiment: emotion2vec+ base

For deployments with spare CPU/RAM, the repository includes an optional local shadow worker using `emotion2vec_plus_base`. The model card describes a roughly 90M-parameter SER model fine-tuned with about 4,788 hours of data and a 9-class output. See <https://huggingface.co/emotion2vec/emotion2vec_plus_base>.

We have **not yet used this long enough in real calls to claim that it improves companion behavior**. The reference integration therefore keeps it in shadow mode: it runs after the utterance, displays/stores bounded scores for comparison, and does not feed those scores into the companion prompt.

On one 2-vCPU / 8-GB-RAM / no-GPU VPS, warm inference for a ~4.1-second sample was about 0.9–1.2 seconds, steady model RSS was around 1 GB, and cold loading briefly approached ~3 GB. Treat these as one-machine observations, not universal requirements. Small VPS deployments should leave it disabled unless they have measured headroom.

See [EMOTION_SHADOW.md](EMOTION_SHADOW.md) for setup and privacy behavior.

## TTS

The reference TTS path is ElevenLabs v4 Turbo because the speech-delivery pipeline has been tuned around it, including segmentation, delivery presets, playback shaping and optional performance layers.

Multilingual v2 and Flash v2.5 remain alternatives.

“Reference” means **tested and tuned for this project**, not objectively best for every deployment.

## On-device environmental hearing: YAMNet

The optional environment/nonverbal hearing path uses YAMNet locally in the browser through ONNX Runtime Web.

YAMNet is useful here because it is small and fast enough for near-realtime browser inference:

- 16 kHz mono waveform input;
- roughly 0.96-second analysis windows;
- 0.48-second hop / 50% overlap;
- 521 AudioSet output classes;
- a 1024-dimensional embedding is also available for deployments that later want a custom small classifier;
- raw microphone audio does not need to be sent to a separate sound-classification API.

Reference: <https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/README.md>

The public Hearing v2 catalog covers broad everyday sound groups such as music, rain, wind, water, doors, doorbells, footsteps, typing, pets, traffic, trains, aircraft, cooking, dishes, appliances, alarms, sirens, coughing, sneezing and laughter.

The runtime separates **reactive** sounds from **ambient** sounds. A doorbell or cough may justify an immediate response; music, rain or typing should normally become context without repeatedly interrupting the conversation.

YAMNet is still a general AudioSet classifier. Its published balanced mAP is about 0.306, so thresholds and labels should be treated as probabilistic hints rather than ground truth. Tune against your real device and room.

## Choosing your own stack

Test these separately:

- transcript accuracy;
- short utterances;
- conversational endpointing;
- quiet speech;
- latency;
- code-switching;
- background noise;
- browser suspend/recovery;
- billing model;
- credential exposure;
- regional/privacy requirements;
- provider outages and fallback behavior.

A companion call is unusually sensitive to small speech-pipeline failures. Benchmark with the actual phone, microphone, room and speaking style you expect to use.
