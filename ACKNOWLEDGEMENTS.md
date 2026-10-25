# 致谢与灵感来源

Companion Voice Runtime 不是凭空出现的。

它是在长期真实使用里慢慢长出来的，但很多公开项目、文章、实验和社区讨论，确实改变了我们后来探索的方向。这里把这些影响明确记录下来。

**出现在致谢里，并不代表 Companion Voice Runtime 重新分发了该项目的源码。**

真正随本仓库一起重新分发的第三方代码、模型文件、runtime artifact 或数据，会单独记录在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## Callhome — Cheiineeey

https://github.com/Cheiineeey/callhome

Callhome 很直观地展示了一件事：当“打电话”被当作关系基础设施，而不是单独的 voice bot demo 时，AI companion 的体验会丰富很多。

它影响了我们对这些方向的思考：

- 主动 / outbound companion call
- iOS / PWA 来电行为
- 把“为什么打这通电话”带进入站来电
- 用个人声学 baseline，而不是统一阈值判断 tone
- 持久化 call record
- 把 Tencent speech recognition 作为中文 / 混合语言方案之一

Companion Voice Runtime 最终使用了不同的 Tencent 路径（TRTC Web RealtimeTranscriber），并实现了自己的 turn、repair、continuity 与 perception-provenance 层。

在公开发布审计时，Callhome 将软件标注为 PolyForm Noncommercial 1.0.0 source-available，文档 / media 为 CC BY-NC 4.0。

Companion Voice Runtime **没有**把 Callhome 源码重新以 MIT License 分发。

## AriaDuet

- [AI voice-call write-up](https://ariaduet.pages.dev/ai-voice-call/)
- [Nonverbal / environment-sound write-up](https://ariaduet.pages.dev/ai-hears-your-body/)
- [Closer expressive voice-call write-up](https://ariaduet.pages.dev/phone-sex/)

这些文章帮助我们更明确地思考三个问题：

1. AI companion 应该怎样主动发起电话；
2. 电话怎样对 transcript 之外的非言语声音作出反应；
3. 更贴近、更具表现力的 voice behavior 会怎样改变 realtime pipeline 的要求。

这里致谢的是**概念与方向上的启发**。

本项目自己的 browser worker、cue pipeline、turn metadata、history provenance 与 call runtime 是独立实现。

## Environment-sound call UI — 随来苹苹梨呀 (@lili_quq_)

https://x.com/lili_quq_

随来苹苹梨呀公开展示过的通话 UI，给了我们一个很重要的视觉 / 交互参考：

> 如果 companion 听到了非言语或环境声音，用户最好也能看见“它听见了什么”，而不是让这些 detection 永远藏在 model pipeline 或 debug log 里。

这个参考帮助我们确认了一个产品决定：被 companion 实际听见并影响回复的 cue，应该能在界面和之后的历史里被用户理解。

目前没有找到对应实现的公开源码仓库。

Companion Voice Runtime 不声称拥有、也不重新分发该实现源码；这里的致谢仅针对公开展示的 UI / interaction 灵感。

YAMNet / nonverbal detection 的底层方向另外在 AriaDuet 与 TensorFlow YAMNet 小节中致谢。

## ai-voice-breath-kiss-water 系列 — sanqianzilanyue

https://sanqianzilanyue.github.io/ai-voice-breath-kiss-water/

https://github.com/sanqianzilanyue/ai-voice-breath-kiss-water-2

https://github.com/sanqianzilanyue/ai-voice-breath-kiss-water-3

这个系列记录了很多非常实际的 companion voice 实验：

- cadence
- repetition
- breathing
- real-world sound layering
- sentence-level TTS behavior
- “技术上听得见”和“真实关系里听起来自然”之间的差别

它影响了本项目把 expressive audio 当作**独立 performance layer** 的思路，而不是要求 TTS 自己生成所有非言语事件。

在本次审计时，我们没有在上述三个 GitHub 项目里找到清晰的 repository license。

因此 Companion Voice Runtime 把它们当作 inspiration / reference material，而不是可以直接复制后重新许可的代码。

没有源码被有意从这些项目复制并以本项目许可重新分发。

## binaural-voice — Saekisui

https://github.com/Saekisui/binaural-voice

这个项目展示了面向 companion TTS 的近场 KU100 HRIR rendering，并认真记录了底层 Neumann KU100 near-field dataset。

Companion Voice Runtime 在 realtime Web Audio path 中使用一个较小的 25 cm right-ear HRIR derivative。

`binaural-voice` 仓库本身采用 MIT License；底层 KU100 near-field HRIR dataset 为 CC BY 4.0，并在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中单独归属。

## Starhub-Tutorials — StarhubQiao

https://github.com/StarhubQiao/Starhub-Tutorials

这个项目中的 realtime voice pipeline 说明影响了我们的 latency 优化，尤其是一个很实用的方向：

> 不必等完整 assistant response 全部生成完，稳定句子一出现就可以开始 TTS。

Companion Voice Runtime 保留了自己的 segmentation、interruption、archive、playback 与 turn-generation semantics，并没有直接导入一整套 voice pipeline。

## TensorFlow YAMNet / AudioSet

https://github.com/tensorflow/models/tree/master/research/audioset/yamnet

YAMNet 提供了浏览器侧 nonverbal detector 使用的底层 audio-event model。

本项目在这部分的工作不是“发明 classifier”，而是围绕它实现：

- realtime worker
- windowing / confirmation policy
- cue consumption rule
- turn-scoped provenance
- conversational integration

YAMNet 的许可与实际重新分发文件记录在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## Service 与 SDK 作者

Companion Voice Runtime 还依赖或可以接入：

- ElevenLabs — realtime speech / TTS SDK 与 API
- AssemblyAI — realtime speech recognition API
- Tencent TRTC — Web RTC 与 realtime transcription SDK / API
- Microsoft ONNX Runtime — 浏览器侧 ONNX 执行
- OpenAI Codex — 参考部署使用的 companion runtime integration

这些服务与 SDK 的许可、条款仍然由各自提供方决定。

## 共同创作

最后，Companion Voice Runtime 会特意写成：

**co-created through use**

因为它的架构不是先画完一张图再实现，而是在一个循环里反复长出来的：

真实打电话 → 发现哪里破坏连续感 → 把问题写成明确 runtime rule → 测试 → 再继续真实使用。

这个过程重复了很多很多次。

typed voice repair、bounded autonomous follow-up、turn-scoped heard-cue history、mobile microphone recovery、durable voice favorites 等功能，基本都是这样出现的。

**Co-created by Yau & Kael · Built with ChatGPT**
