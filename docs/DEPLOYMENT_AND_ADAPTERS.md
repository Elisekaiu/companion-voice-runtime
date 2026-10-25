# 部署与 Runtime 可移植性

Companion Voice Runtime 的**参考部署**是：

- 一台长期在线的 Linux VPS；
- Node.js 22+ 或 Docker Compose；
- 通过反向代理或 tunnel 提供 HTTPS；
- 手机上使用浏览器 / PWA；
- 模型 runtime 使用 `codex app-server`；
- STT 使用 AssemblyAI / Tencent，TTS 使用 ElevenLabs。

这是本仓库实际测试过的组合，但**不是唯一可用环境**。

## VPS 是硬要求吗？

不是。

服务器只需要做到几件事：

- 电话过程中保持可访问；
- 保存 call / session 状态；
- 持续流式传输事件；
- 安全保存 provider 凭据。

VPS 很方便，只是因为它通常一直在线、也容易从公网访问。

你也可以换成：

- 家庭服务器 / mini PC；
- NAS / container host；
- cloud VM；
- 长时间运行的 container 平台；
- 一台一直保持唤醒、且手机能够安全访问的电脑。

除了 localhost 之外，浏览器麦克风 / PWA 路径仍建议通过 HTTPS 提供。

仓库里的 Docker Compose 默认只把 call server 绑定到宿主机 localhost。请在它前面放有认证的 HTTPS 反向代理或 tunnel，不要直接暴露原始 call port。

## Codex 是硬要求吗？

更显眼，但同样可以替换。

参考服务器目前有两条 model-runtime 路径：

1. **专用 Codex app-server** — `src/codex/app-server.mjs`
2. **外部 companion bridge** — 通过 `COMPANION_BRIDGE_BASE` 配置

电话栈其他部分并不关心文本到底来自 Codex、Claude、普通 API 模型，还是其他 agent runtime。

真正重要的是这个 runtime contract：

- 可以开始 / 恢复一个会话；
- 接收一轮文本；
- 流式输出 text delta；
- 支持取消 / 打断；
- 返回最终 assistant message；
- 可选暴露 model / session / usage metadata。

STT 仲裁、typed repair、非言语听觉、voice-tone context、TTS 分句、播放、通话历史、idle STT sleep/wake、Usage UI 都在 model runtime 之外。

## 最简单的迁移方式：实现 companion bridge

不用改整个通话 pipeline，只需要让 Companion Voice Runtime 指向一个 adapter service：

```text
COMPANION_BRIDGE_BASE=https://your-runtime-bridge.example
```

当前 bridge 期望两个 endpoint。

### POST /voice-status

返回类似：

```json
{
  "authenticated": true,
  "model": "your-model",
  "reasoning_effort": "optional",
  "active_thread_id": "optional-session-id",
  "usage": null
}
```

### POST /voice-turn

请求：

```json
{
  "text": "the current turn plus Companion Voice Runtime call context",
  "intimate": false
}
```

返回 newline-delimited JSON stream：

```jsonl
{"type":"meta","threadId":"session-1","model":"your-model","effort":"optional"}
{"type":"started","turnId":"turn-1"}
{"type":"delta","delta":"Hello"}
{"type":"delta","delta":" there."}
{"type":"done","text":"Hello there.","threadId":"session-1","turnId":"turn-1"}
```

失败时可以发送 error packet，或直接返回非 2xx。

这个 bridge 是最适合做适配的位置：把其他 provider 的 session ID、streaming protocol、认证、memory 或 agent harness 翻译成这个项目较小的 voice-runtime contract。

## 普通模型 API

### OpenAI API / Responses

**迁移难度：低。**

直接 API adapter 只需要：

- 保存或重建对话状态；
- 把 response text 流转换为 `delta` packet；
- 把取消操作映射到 provider 请求；
- 返回最终文本。

如果你不需要 agent harness、文件系统工具或长期 Codex thread，普通模型 API 反而可能更简单。

### Anthropic Messages API

**迁移难度：低。**

同样适用 bridge 模式。维护 message history 或自己的 memory layer，把文本 delta 转换成项目的 bridge packet 即可。

STT / TTS / call-state pipeline 并不要求一定使用 OpenAI 模型。

## Claude Code

**迁移难度：中等，但不需要重写整套电话。**

Claude Code 是 agent harness，不是可以直接替换 Codex app-server protocol 的 drop-in implementation，所以不能简单把 `src/codex/app-server.mjs` 指向 `claude` executable 就完事。

但 Claude Code 支持 programmatic / headless use、session resume 和 streaming JSON output，因此可以写一个 bridge，把输出翻译成项目的：

`meta / started / delta / done`

下面这些部分都可以保持不变：

- phone / PWA UI；
- 麦克风采集；
- AssemblyAI quiet sleep / wake；
- Tencent sidecar + STT arbitration；
- turn repair 与 interruption classification；
- nonverbal + voice-tone context；
- TTS 分句与 ElevenLabs playback；
- history / favorites；
- incoming-call UI 与 bounded follow-up；
- 可选 Usage Center。

adapter 需要自己决定：

- Claude Code session 如何映射到 call；
- 允许哪些工具；
- cancellation 怎么做；
- conversation context 如何持续。

语音陪伴场景建议把 agent 权限面保持得很小。一次电话回复不应该依赖交互式 shell / file approval。

## 实际兼容性

| 环境 / runtime | 预计工作量 |
| --- | --- |
| Linux VPS + Codex app-server | 参考路径，按文档即可 |
| 其他长期在线 Linux + Codex | 主要是部署 / 配置调整 |
| Docker host / home server / NAS | 主要是部署 / 网络调整 |
| OpenAI API | 小型 model adapter / bridge |
| Anthropic Messages API | 小型 model adapter / bridge |
| Claude Code | 中等 bridge 工作，其他语音栈可复用 |
| 其他支持 streaming 的 agent CLI / SDK | 通常是中等 adapter 工作 |
| 纯 request-only serverless | 不太适合，除非支持长连接 / 状态，或把状态外置 |

## 真正的边界在哪里

可以把 Companion Voice Runtime 理解成两层：

```text
VOICE RUNTIME
microphone → STT → turn logic → perception → model text → TTS → playback
                               │
                               ▼
MODEL / COMPANION ADAPTER
Codex app-server | bridge | OpenAI API | Claude API | Claude Code | other
```

公开项目主要优化的是第一层。

**Codex 是参考 adapter，不是这个项目本身的定义。**
