# Provider 与模型选择指南

Companion Voice Runtime 使用的是一套**参考默认值**，不是在宣称某一家 provider 对所有人都“最好”。

> **可以照搬角色，不必照搬厂商。**

一套好用的语音通话栈通常需要四个角色：

1. 主 realtime STT
2. 可选的语言专长 sidecar
3. transcript arbiter
4. expressive TTS

## 参考默认值

- **主 realtime STT：** AssemblyAI `universal-3-6-pro`
- **中文 sidecar：** Tencent TRTC RealtimeTranscriber
- **备用 STT：** ElevenLabs Scribe v2 Realtime
- **参考 TTS：** ElevenLabs v4 Turbo
- **TTS 备选：** Multilingual v2 / Flash v2.5

## 为什么主 STT 选 AssemblyAI

参考客户端使用 `universal-3-6-pro` 的 `balanced` 模式。

这个选择来自真实电话里的体验：短回复、自然停顿、打断、人名、中英 code-switching 等。

参考 turn-silence：

```text
min_turn_silence = 320 ms
max_turn_silence = 1600 ms
```

这里故意没有调得极端激进，目的是避免把普通聊天中的自然停顿切成多个轮次。

请把这些值当成起点，并按你自己的语言、麦克风、房间和说话习惯重新测试。

## 为什么 Tencent 作为 sidecar

混合设计是有意为之：

1. AssemblyAI 保持主 realtime stream 与 turn clock。
2. 配置了 Tencent 时，让它并行监听。
3. 纯英文轮次不需要等待 Tencent。
4. 中文或中英混合轮次可以把 Tencent 结果作为额外证据。
5. `web/stt-arbiter.js` 选择一份 committed transcript。
6. 最终只有一个轮次进入 companion。

这套模式可以复用：你也可以把 Tencent 换成其他更擅长某种语言的 STT，而不用改整体架构。

## 为什么还保留 Scribe

Scribe v2 Realtime 对已经在使用 ElevenLabs 的部署很方便，可以作为额外 fallback，但目前不是参考默认主 STT。

## 为什么参考 TTS 是 v4 Turbo

当前 speech-delivery pipeline 的分句、delivery preset、playback shaping 与可选 performance layer 都围绕 ElevenLabs v4 Turbo 做过实际调试。

所以这里的“默认”只表示：

> **这个项目测过、调过。**

不代表它客观上对所有 companion 都最好。

## Quiet mode：控制空闲成本

Realtime STT 的 websocket 就算没人说话，只要 session 还开着，也可能继续积累可计费时长。

因此公开客户端包含 idle cloud-STT sleep / wake：

- 大约 30 秒没有语音后，关闭云端 STT session
- 麦克风仍留在本地
- 本地轻量 speech gate 继续检测语音活动
- 保留约 3 秒 pre-roll
- 重新说话时重连云端 STT，并先送入缓冲音频
- Tencent sidecar 与主 STT 一起休眠和唤醒

这样长时间安静通话时，不需要为了“连接还在”一直为无用的 STT session 付费。

截至本指南更新时（2026 年 10 月），AssemblyAI 对 Universal-3.6 Pro Realtime 公布的基础价格为 $0.45 / 小时，并按 realtime session duration 描述计费。依赖任何成本估算前，请自行确认最新价格。

官方参考：

- https://www.assemblyai.com/blog/universal-3-6-pro-realtime
- https://www.assemblyai.com/blog/real-time-transcription-code-switches-multilingual-speakers

## 换成你自己的栈

请分别测试：

- transcript 准确率
- turn-ending 行为
- 延迟
- 计费方式
- 凭据暴露风险
- fallback
- 地区 / 隐私要求

AI 陪伴电话对很小的语音 pipeline 失误都非常敏感。最好用你真正会使用的麦克风、房间、语言混合、人名和一两个字的短回复来测。
