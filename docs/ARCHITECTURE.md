# Companion Voice Runtime — 架构

目标：在不依赖 CallKit / 原生电话系统的前提下，提供一套由用户自己的 companion runtime 驱动的私有 iPhone / PWA 语音通话体验。

## 参考部署

- 测试过的参考方案使用一台长期在线的 Linux VPS 作为公网入口与通话协调器；任何长期在线、支持 HTTPS 的主机都可以替代。
- iPhone PWA 负责 UI、麦克风采集、实时 transcript、Web Audio 播放与来电页面。
- Codex app-server 是参考模型 runtime；也可以通过 companion bridge 换成其他 API 或 agent harness。
- 参考方案里的 MacBook 只用于开发 / 调试，不需要为了接来电一直保持唤醒。

可移植性详见 [DEPLOYMENT_AND_ADAPTERS.md](DEPLOYMENT_AND_ADAPTERS.md)。

## 当前参考语音栈

- 主 STT：AssemblyAI Universal-3.6 Pro Realtime
- 中文 / 混合语言 sidecar：可选 Tencent TRTC RealtimeTranscriber
- 备用 STT：ElevenLabs Scribe v2 Realtime
- STT arbitration 保留一个主 turn clock，并且只提交一个最终 transcript
- TTS：默认 ElevenLabs v4 Turbo；可选 Multilingual v2 / Flash v2.5
- Turn Manager 位于 VAD / STT commit 之上，负责真正的对话轮次
- AssemblyAI 云端 STT 可在空闲后休眠，并由本地语音活动 + pre-roll 唤醒
- 默认持久化文字 transcript，不保存原始麦克风音频

Provider 选择原因见 [PROVIDER_GUIDE.md](PROVIDER_GUIDE.md)。

## 核心通话状态

```text
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
```

## 不可妥协的行为约束

1. STT partial 只用于显示；只有 committed / turn-final 文本可以进入模型。
2. STT commit 不等于“用户轮次结束”。
3. Assistant 语音要有独立 speech gate；模型文本可以提前准备，但不一定立刻允许播放。
4. 用户明确打断时，旧 model / TTS / playback 必须原子式一起取消。
5. 所有异步工作都按 `callId + turnId + generation` 绑定；过期 callback 直接丢弃。
6. 只记录真正播放过的 assistant 文本，避免把“生成了但被打断没听见”的内容当成已说出口。
7. 模型文本流、分句、TTS 请求、音频播放是彼此独立的 pipeline。
8. 云端 STT 可以空闲休眠，但本地通话状态和唤醒检测必须继续活着。
9. 除非用户明确启用录音，否则不要保存原始通话音频。

## 第一阶段实现目标

一个私有 HTTPS PWA 可以：

- 发起 / 接收模拟来电
- 把麦克风音频流送入 STT
- 展示 partial / final 用户 transcript
- 每个最终用户轮次只发送一次给模型
- 把模型文本流式返回 UI
- 文本出现的同时流式播放 TTS
- 安全打断 assistant 语音
- 保存通话 transcript 与时长
