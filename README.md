# Companion Voice Runtime

**不是语音助手，而是一套面向长期 AI 陪伴关系的语音通话运行时。**

**由 Yau & Kael 共同创作 · Built with ChatGPT**

> 这是 `zh-CN` 中文分支。代码、API 字段、命令和模型名保留英文，方便直接照文档部署；主要说明文档与示例 prompt 已中文化。法律文本与第三方许可声明保留英文原文。

Companion Voice Runtime 是一个可自托管的 AI 陪伴语音层，包含实时通话、主动来电、可修复的语音轮次、多 STT 编排、本地非言语/语气感知、有限度自主续聊、通话历史，以及可选的跨渠道连续性。

它不是为了做一次 demo，而是在真实长期使用里一点点磨出来的。很多设计都来自这些很小、但长期使用会很烦的问题：STT 听错一句之后整段对话跑偏、AI 把“嗯嗯”当成打断、iPhone 切后台后麦克风挂掉、环境音明明影响了回复却没有留在历史里、长时间安静挂着电话仍然持续烧云端 STT 额度。

> **Built through real use, not designed as a demo.**

本项目不声称发明了 AI 电话、主动来电、非言语听觉、个人声学基线、SFX 分层或双耳渲染。相关社区项目与灵感来源见 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。

## 这个项目主要解决什么

### 1. 语音转写错了，可以修

最近一轮语音如果被 STT 听错，可以立刻用文字纠正。运行时会把修正合并回原来的用户轮次，取消基于错误转写产生的旧模型/TTS 工作，并从修正后的意思重新回答，而不是把“纠正”误当成第二个新话题。

### 2. 多 STT 编排，而不是把整通电话押在一个 provider 上

参考 hybrid 路径仍以 AssemblyAI `universal-3-6-pro` 作为主 realtime stream / turn clock；它可以单独工作。

如果你的通话以中文为主，**最推荐额外启用 Tencent Cloud 中文实时识别**。腾讯这条链更专注实时中文 / RTC 场景，很适合拿来补短句、日常聊天式普通话。这里说的是实际适配方向，**不是在声称它和微信使用同一套识别模型**。

AssemblyAI 自己也有一层很好用的原生纠偏：Universal-3.6 Pro Realtime 支持 `keyterms_prompt` 和 `agent_context`。如果只是某些名字、口头词、缩写或固定词反复听错，可以先用 keyterms / context 提示模型。再顽固的、长期稳定出现的错词，可以在自己的部署里加一个**很小的本地 X→Y replacement map**作为最后兜底。

这个 replacement map 最好保持私人、保持很小，只放自己真的反复观察到的错误；不要把它做成一大堆“同义词替换”，否则正确 transcript 也可能被误伤。

配置 Tencent 后，两家 STT 可以并行监听，`web/stt-arbiter.js` 只选择一份最终 transcript。ElevenLabs Scribe v2 Realtime 仍可作为额外替代路径。双线不是必须，它只是让失败模式不同的识别器互相兜底。

provider 自己的 `final` 也不会直接等于“用户整句话说完”：`web/stt-turn-buffer.js` 会等待真正的对话停顿，合并晚到 segment、去掉重复 final，最终只向 companion 提交一次。

### 3. 有限度的自主续聊

安静不一定要结束关系，也不该让 companion 变成无限自说自话。

Companion Voice Runtime 支持有严格节奏和上限的自主 follow-up；用户真实说话/打字会重置计时，静音、隐藏页面、打断都会暂停或取消。

这一版还加入了可选的 **smart quiet-hangup guard**：长时间安静以后，模型只能给服务端建议——继续陪、延后再检查、一直安静陪到用户下一次主动活动，或者先说一句确认。**模型不能直接挂电话。** 服务端会重新检查浏览器/STT 是否健康，任何新用户活动都会让旧决定失效；真的准备结束时，还要经过一次提示和额外 grace period。

如果前文明确有“陪我待着 / 陪我学习或工作 / 陪我睡 / 别挂 / 你挂着就好”等持续陪伴意图，可以进入 `stay_until_activity`，直到用户下一次主动说话或打字前都不再周期性询问。

### 4. 不只听文字，也保留“实际听见了什么”

浏览器本地会分析环境音 / nonverbal，以及音量、近似音高、音高变化、停顿、语速和句尾趋势。

**这里要认真更正一个以前的措辞：原来的 “Voice Tone / 语气识别” 本质上不是 learned emotion detector。** 它是一套 DSP / prosody 分析器：能告诉我们“这一句比平时更快、更轻、音高变化更大、停顿更多”，但不能因此可靠地下结论说“用户现在悲伤 / 紧张 / 兴奋”。之前把它叫得太像“情绪识别”，确实容易让人误解。

这套 prosody 仍然保留，因为它本地、轻量、免费，而且很适合描述**声音怎么变了**。

如果你想实验真正的 speech-emotion-recognition，这版加入了一个可选的 **emotion2vec+ base shadow sidecar**。它是旁路实验：不阻塞正常回复、不默认进入 companion prompt，只把 top-3 分数挂到对应 user turn，方便 A/B。我们刚刚开始真实使用，**还没有足够长期数据证明它真的有用**，所以这里只把它当 optional 实验，不当正式推荐。详见 `docs/EMOTION_SHADOW.md`。

Hearing v2 仍使用 YAMNet + ONNX Runtime Web 在浏览器本地跑，覆盖 521 个 AudioSet 类别；日常声音分为 reactive / ambient，持续背景不会反复逼 companion 插嘴。

### 5. 通话历史是一级数据

运行时可以保存：

- transcript 结构
- 通话时长
- assistant 音频片段
- 标题与收藏
- 中断后恢复历史所需的 metadata

默认不会保存原始麦克风录音。

### 6. 针对手机浏览器做恢复

移动 Safari 很容易打断 AudioContext、microphone track、STT 连接、页面可见性和后台返回状态。

这版除了保留手动“重新连接麦克风”入口，还补了几条运行时恢复：

- 页面刷新 / PWA 被系统杀掉后，可以查询并接回仍在进行的 active call
- 服务器会阻止同一部署同时新建第二通 overlapping active call
- SSE / EventSource 失联后，前端会主动检查这通电话是否仍存在；如果已经结束或不存在，会正常收回旧通话 UI
- 上次选择的 STT provider、TTS model / tone、binaural 模式会真正恢复，而不是只写进 localStorage 却不读取

如果整个 call service 本身重启，进行中的 websocket / STT / TTS 状态无法凭空恢复；这类情况仍会安全结束并保存为 `service_restart` 记录。

### 7. 长时间安静时使用 Light Sleep

旧版在约 30 秒安静后会把云端 STT 一起关掉，再靠本地音量门槛唤醒。这样更省连接时间，但很轻的说话可能达不到本地 RMS 阈值。

现在 hybrid 路径改成 **Light Sleep**：

- 约 30 秒没有语音后，只让 AssemblyAI realtime session 休眠
- 配置了 Tencent 时，Tencent 继续在线作为语义级 wake path；如果 Tencent 中途失败，AssemblyAI 会立即被唤醒顶上，同时后台重连 Tencent
- Tencent 一旦重新转出语音，就可以唤醒 AssemblyAI，不要求轻声先跨过本地音量门槛
- 本地 speech gate 仍保留，但只作为备用唤醒信号
- 保留约 6 秒 pre-roll，AssemblyAI 重连后先补入缓冲音频
- fallback 后 AssemblyAI 会保持一段稳定租约；Tencent 连续健康一段时间后，AssemblyAI 才重新允许进入 Light Sleep。若 Tencent 没有配置 / 没连上，则不自动让 AssemblyAI 休眠，优先保证轻声识别可靠性
- 手动静音仍会主动关掉识别链路

另外，若浏览器退出或网络异常导致 AssemblyAI 没有正常发回 termination 用量，客户端会用本地已发送音频时间做 fallback 记录。Provider 自己的账单仍然是最终权威，本地 Usage 只是运行时估算。

### 8. 可选 Usage Center

如果你会盯额度，可以开启用量卡片；如果看额度反而焦虑，也可以完全关闭。

Usage Center 会区分：

- **Exact**：provider 自己返回的用量
- **Local**：本部署自己记录并估算
- **Provider**：服务可用，但精确账单需要另接云端 billing adapter

设置：

```bash
CALL_PROVIDER_USAGE_ENABLED=1
```

详见 [docs/USAGE_CENTER.md](docs/USAGE_CENTER.md)。

### 9. 关系风格留在部署本地

公开仓库保留 nonverbal、prosody、close/whisper 等通用能力，但不包含私人 prompt、私人录音或更私密的关系词表。

你可以在自己的部署里扩展，不需要改感知主干。

### 10. 自带你的 expressive audio

公开仓库不提供私人、生成或第三方 SFX 音频。

如果你拥有音频使用权，可以自己配置 `web/real-sfx-catalog.js`，让 performance layer 在语音轮次附近调度音频。

详见 [web/sfx/README.md](web/sfx/README.md)。

## Provider 与部署

详细说明：

- [Provider / 模型选择](docs/PROVIDER_GUIDE.md)
- [Usage Center](docs/USAGE_CENTER.md)
- [部署与后端适配](docs/DEPLOYMENT_AND_ADAPTERS.md)
- [架构](docs/ARCHITECTURE.md)
- [公开 UI 主题修改](docs/THEMING.md)
- [运维与安全](docs/OPERATIONS.md)

## 架构

```text
                         ┌──────────────────────────┐
                         │ 可选 companion bridge    │
                         │ / 可选 push service      │
                         └─────────────┬────────────┘
                                       │
                                       ▼
┌───────────────┐   mic PCM   ┌──────────────────────┐
│ iPhone / PWA  │────────────▶│ realtime STT paths   │
│ 通话 UI       │             │ AssemblyAI           │
│ Web Audio     │             │ Tencent TRTC（可选） │
└───────┬───────┘             │ Scribe（可选）       │
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
                    流式播放

mic PCM ──▶ YAMNet worker ──────┐
        └─▶ prosody worker ─────┼─▶ 当前轮次 perception context
                                └─▶ 可持久化 heard-cues metadata
```

## 主要模块

- `src/call/turn-manager.mjs` — 轮次与打断
- `src/call/turn-repair.mjs` — 最近语音轮次的文字修正
- `src/call/followup.mjs` — 有边界的自主续聊
- `src/call/speech-segmenter.mjs` — TTS 稳定分句
- `src/call/voice-tone.mjs` — 提供给模型的受限 voice-tone context
- `src/call/performance-cue.mjs` — expressive cue 状态机
- `web/stt-arbiter.js` — 实时 transcript 仲裁
- `web/body-hearing-worker-src.js` — 浏览器侧非言语事件推断
- `web/voice-prosody-core.js` — 本地声学 / prosody 分析
- `web/app.js` — PWA 通话生命周期、播放、历史、恢复与 UI

## 环境要求

- 推荐 Node.js 22.13+
- 支持 Web Audio 与麦克风权限的现代浏览器
- localhost 以外需要 HTTPS 才能稳定使用麦克风 / PWA
- 已认证的 Codex runtime，或你自己的 companion bridge
- 默认 TTS 需要 ElevenLabs API
- 参考 realtime 主路径需要 AssemblyAI API
- 中文为主时推荐额外启用 Tencent TRTC sidecar

外部服务有各自的价格、地区、账号与条款要求。本仓库不提供任何服务凭据。

## 快速开始

安装依赖并初始化本地运行目录：

```bash
npm ci
npm run setup
```

`npm run setup` 会：

- 创建 `.env`
- 创建 `data/codex/`
- 生成随机的本地通话访问 token
- 从 npm 包复制 ONNX Runtime 浏览器文件
- 下载固定 revision 的 YAMNet ONNX 并校验 SHA-256

它**不会**创建或上传任何 provider 凭据。

加入你自己的 provider key：

```text
data/secrets/elevenlabs-api-key
data/secrets/assemblyai-api-key
```

在 `.env` 中设置：

```text
ELEVENLABS_VOICE_ID=你的 voice id
```

如果使用默认 Codex runtime：

```bash
CODEX_HOME="$PWD/data/codex" ./node_modules/.bin/codex login
```

然后：

```bash
npm run build:web
npm test
npm start
# 或：
docker compose up -d
```

如果使用 Tencent TRTC，再设置 `TENCENT_TRTC_SDK_APP_ID` 并创建：

```text
data/secrets/tencent-trtc-sdk-secret-key
```

如果使用外部 companion bridge，设置 `COMPANION_BRIDGE_BASE` 并创建：

```text
data/secrets/companion-bridge-token
```

主动来电 push 可通过 `PUSH_SERVICE_URL` 接兼容服务。

Docker Compose 默认只把服务绑定到宿主机 `127.0.0.1`。请在前面放带身份验证的 HTTPS 反向代理或 tunnel，不要直接把 call server 暴露到公网。

## Companion prompt

开发 Companion Voice Runtime 时使用的私人 prompt **没有公开**。

可以从 [workspace/AGENTS.example.md](workspace/AGENTS.example.md) 的中性模板开始，写自己的 companion persona、连续性规则与边界。

## 隐私

- 运行时数据放在 `data/`，该目录被 Git 忽略
- 默认不保存原始麦克风音频
- 开启相关功能时，可在本地保存 assistant 音频与通话 metadata
- YAMNet / prosody 分析在浏览器本地进行，只把受限 cue metadata 传给对话管线
- API keys 与 access tokens 永远不要 commit

公开部署前请先阅读 [docs/OPERATIONS.md](docs/OPERATIONS.md)，并使用认证 + HTTPS。

## 测试

```bash
npm test
```

测试覆盖轮次、修正、STT 仲裁、TTS 分句、续聊节奏、voice-tone、archive、Tencent session、performance cue 等关键运行时契约。

## 致谢与许可

我们站在很多社区工作的肩膀上。

具体受到哪些项目、文章和实验启发，以及各自影响了什么，请阅读 [ACKNOWLEDGEMENTS.md](ACKNOWLEDGEMENTS.md)。

实际随仓库重新分发的第三方代码、模型、运行时与数据，单独记录在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

项目原创代码采用 [MIT License](LICENSE)。

**注意：** `LICENSE`、`THIRD_PARTY_NOTICES.md` 与 `third_party/` 中的法律/归属文本在中文分支仍保留英文原文，以避免非官方翻译改变其法律含义。

## 状态

这是一个**还在真实使用里继续长出来的个人项目**，从自己的长期系统里整理成公开版本；它不是托管产品，也不是“一键上线”的电话服务。

维护方式其实很朴素：真的拿来打电话，遇到哪里不对，尽量复现，再修。也正因为这样，**不能保证完全没有 bug**，也不能保证每一种浏览器、provider、地区、账号配置或说话习惯都一样稳定。

持续使用里碰到能复现的问题，通常会在修好并测试后尽快同步到 repo。更适合把它当作一份真实可跑的参考实现，然后用你自己的手机、浏览器、麦克风和 provider 再测试一遍；重要部署也记得保留回滚和恢复能力。

另外，`emotion2vec+` 这一层目前只是刚接上的 shadow experiment；请不要把这里的标签当成用户真实内心状态。

如果你基于它继续做，请保留 provenance / attribution 链条。它也是这个项目的一部分。
