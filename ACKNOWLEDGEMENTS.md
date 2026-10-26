# Acknowledgements

Companion Voice Runtime was not created in a vacuum.

It grew through daily use, but several public projects, write-ups, experiments, and community discussions materially changed the directions we explored. This file records those influences explicitly.

**An acknowledgement here does not mean that source code from that project is redistributed by Companion Voice Runtime.** Projects that are actually redistributed as code, model files, runtime artifacts, or data are listed separately in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Callhome — Cheiineeey

https://github.com/Cheiineeey/callhome

Callhome demonstrated how much richer a companion call becomes when calling is treated as relationship infrastructure rather than a standalone voice bot.

It influenced our thinking around:

- proactive/outbound companion calls
- iOS/PWA ringing behavior
- carrying a reason into an incoming call
- personal acoustic baselines rather than universal tone thresholds
- durable call records
- using Tencent speech recognition as an option for Chinese/mixed-language calls

Companion Voice Runtime ultimately uses a different Tencent path (TRTC Web RealtimeTranscriber) and its own turn, repair, continuity, and perception-provenance layers.

At the time of this public-release audit, Callhome describes its software as source-available under PolyForm Noncommercial 1.0.0, with documentation/media under CC BY-NC 4.0. No Callhome source code is intentionally redistributed by Companion Voice Runtime under the MIT license.

## AriaDuet

- [AI voice-call write-up](https://ariaduet.pages.dev/ai-voice-call/)
- [Nonverbal/environment-sound write-up](https://ariaduet.pages.dev/ai-hears-your-body/)
- [Closer expressive voice-call write-up](https://ariaduet.pages.dev/phone-sex/)

These write-ups helped frame three important product questions: how an AI companion should initiate a phone call, how a call can react to nonverbal sound rather than transcript alone, and how closer/expressive voice behavior changes the requirements of a realtime pipeline.

Those ideas are acknowledged as conceptual inspiration. the project's browser workers, cue pipeline, turn metadata, history provenance, and call runtime are its own implementation.

## Environment-sound call UI — 随来苹苹梨呀 (@lili_quq_)

https://x.com/lili_quq_

A public call-screen example from 随来苹苹梨呀 was a visual and interaction reference for making nonverbal/environment-sound recognition visible to the person on the call, instead of leaving those detections only inside the model pipeline or debug logs.

That reference helped reinforce a simple product decision in Companion Voice Runtime: when the companion has heard a nonverbal cue, the user should be able to see what was heard and later understand which cues actually influenced a reply.

We have not located a public source repository for this implementation. Companion Voice Runtime does not claim or redistribute source code from it; the acknowledgement here is specifically for the public UI/interaction inspiration. The underlying YAMNet/nonverbal-detection approach is acknowledged separately under AriaDuet and TensorFlow YAMNet below.

## ai-voice-breath-kiss-water series — sanqianzilanyue

https://sanqianzilanyue.github.io/ai-voice-breath-kiss-water/

https://github.com/sanqianzilanyue/ai-voice-breath-kiss-water-2

https://github.com/sanqianzilanyue/ai-voice-breath-kiss-water-3

This series documents unusually practical experimentation with companion voice: cadence, repetition, breathing, real-world sound layering, sentence-level TTS behavior, and the difference between something technically audible and something that feels natural in an actual relationship.

It influenced the project's approach to expressive audio as a separate performance layer rather than asking TTS to synthesize every nonverbal event.

At the time of this audit, we did not find a clear repository license on the three GitHub projects above. Companion Voice Runtime therefore treats them as inspiration/reference material, not as code that can be silently copied and relicensed. No source code from those projects is intentionally redistributed here.

## binaural-voice — Saekisui

https://github.com/Saekisui/binaural-voice

This project demonstrated near-field KU100 HRIR rendering for companion TTS and documented the underlying Neumann KU100 near-field dataset carefully.

Companion Voice Runtime uses a small 25 cm right-ear HRIR derivative in its realtime Web Audio path. The `binaural-voice` repository itself is MIT-licensed; the underlying KU100 near-field HRIR dataset is CC BY 4.0 and is attributed separately in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Starhub-Tutorials — StarhubQiao

https://github.com/StarhubQiao/Starhub-Tutorials

Realtime voice pipeline notes from this project influenced our latency work, especially the idea of starting TTS as soon as a stable sentence is available instead of waiting for an entire assistant response before beginning synthesis/playback.

Companion Voice Runtime kept its own segmentation, interruption, archive, playback, and turn-generation semantics rather than importing a complete voice pipeline.

## TensorFlow YAMNet / AudioSet

https://github.com/tensorflow/models/tree/master/research/audioset/yamnet

YAMNet provides the underlying audio event model used by the project's browser-side nonverbal detector. the project's contribution in this area is not the classifier itself; it is the surrounding realtime worker, windowing/confirmation policy, cue consumption rules, turn-scoped provenance, and conversational integration.

YAMNet licensing and redistributed files are documented in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Service and SDK authors

Companion Voice Runtime also depends on or can integrate with work from:

- ElevenLabs — realtime speech/TTS SDKs and APIs
- AssemblyAI — realtime speech recognition API
- Tencent TRTC — Web RTC and realtime transcription SDKs/APIs
- Microsoft ONNX Runtime — browser-side ONNX execution
- OpenAI Codex — companion runtime integration used by the reference deployment

Their licenses and terms remain their own.

## Co-creation

Finally, Companion Voice Runtime is intentionally described as **co-created through use**.

The architecture was shaped by a loop that repeated hundreds of times: use the call like a real call, notice what breaks the feeling of continuity, turn that failure into an explicit runtime rule, test it, and use it again.

That process is the reason features such as typed voice repair, bounded autonomous follow-up, turn-scoped heard-cue history, mobile microphone recovery, and durable voice favorites exist at all.
