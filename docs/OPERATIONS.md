# Companion Voice Runtime 运维说明

## 隔离

本服务会启动自己的 Codex app-server，并为每通电话建立独立 thread。

它使用专用的 `CODEX_HOME=/data/codex`。

请把无关的聊天 runtime session、worker state 和私人应用 API 放在这个容器之外。

## Secrets

- `data/secrets/call-access-token`：私人 PWA 登录 token，由部署端生成
- `data/secrets/elevenlabs-api-key`：ElevenLabs API key
- 浏览器只接收短时、一次性的 Scribe token

不要把 key 放进：

- 聊天内容
- Git / 源码
- Compose YAML
- 浏览器 JavaScript

通过私有服务器终端放好 ElevenLabs key 后，只重启本项目：

```bash
cd /path/to/companion-voice-runtime
docker compose restart companion-voice-runtime
```

## 暴露方式

默认服务只绑定宿主机：

```text
127.0.0.1:8848
```

API route 需要由 `/api/auth` 发放的 HttpOnly session cookie。

不要额外增加一个无需认证的公网 origin。

如果通过 tunnel 发布，保持 `/call` 在本应用登录后面；如果条件允许，再加 Cloudflare Access 作为第二层。

## 数据

结构化 transcript 保存在：

```text
data/calls/<call-id>.json
```

原子替换时使用 mode `0600`。

默认不保存原始麦克风音频。

每个异步 model / TTS 操作都绑定到 `callId`、`turnId` 和 `generation`。发生打断时，generation 会递增，并取消旧 model 与 TTS 工作。
