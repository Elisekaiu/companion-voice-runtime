# 可选 Usage Center

有些人喜欢长时间挂着 companion 电话，但又会一直担心语音服务是不是在后台偷偷烧额度。

所以 Usage Center 是**故意做成可选功能**的。

正常通话路径完全不依赖它。

开启：

```text
CALL_PROVIDER_USAGE_ENABLED=1
```

公开示例默认关闭。

## UI 里的三个标签是什么意思

Provider 卡片会使用：

- **Exact** — 数字直接来自 provider 自己的账号 / subscription API
- **Local** — 当前 Companion Voice Runtime 部署自己记录 session 用量并估算
- **Provider** — 服务本身已经接通，但 billing / package 用量需要另外接云端 billing adapter

不要把本地估算写成“账号余额”。

## Codex

如果当前 companion runtime 能返回 Codex usage window，Companion Voice Runtime 可以直接显示在现有 Usage sheet 中。

不需要额外接语音 provider。

## AssemblyAI

AssemblyAI realtime session 结束时会返回包含 session duration 的 termination payload。

公开客户端已经带 idle sleep / wake 成本控制。

可选 usage adapter 还可以额外记录 termination duration，并汇总：

- 已追踪 session 时间；
- session 数量；
- 按配置的每小时价格估算支出。

这里显示的是**当前部署的本地统计**，不是 AssemblyAI 账号真实余额。

可复用 helper：

`src/provider-usage.mjs`

## ElevenLabs

ElevenLabs 可以通过 user subscription endpoint 返回 subscription usage。

如果要开启这张卡，credential 必须留在后端。

建议使用专门的 restricted API key，只开放 **User / Access**（`user_read`）权限，尽量遵循 least privilege。

不要把 key 放进：

- 浏览器 JavaScript；
- localStorage；
- 截图；
- 示例；
- 公共仓库。

公开 helper 可以读取已经在后端配置好的 credential，然后只把 UI 需要的 usage 数字返回给前端。

## Tencent

TRTC 语音凭据和 Tencent Cloud billing / package 凭据不是一回事。

因此默认公开卡片只显示连接状态。

如果需要精确套餐 / 账单信息，应为你自己的腾讯云账号另外实现 server-side billing adapter。

## 可选 endpoint contract

前端会尝试读取：

`GET /api/provider-usage`

如果 endpoint 不存在或返回错误，provider section 会自动隐藏，其余通话功能照常工作。

兼容 response 示例：

```json
{
  "elevenlabs": {
    "available": true,
    "kind": "exact",
    "used": 3229,
    "limit": 30414,
    "remaining": 27185,
    "resetAt": "2026-11-25T00:00:00.000Z"
  },
  "assemblyai": {
    "available": true,
    "kind": "local",
    "sessionSeconds": 3600,
    "estimatedUsd": 0.45,
    "rateUsdPerHour": 0.45,
    "model": "universal-3-6-pro"
  },
  "tencent": {
    "available": false,
    "kind": "provider",
    "trtcConfigured": true
  }
}
```

Provider 可以替换，但请始终区分：

**provider-reported usage** 和 **local estimate**。

## 为什么做成可选

用量可见性影响的是“安心程度”，不是通话正确性。

看着额度会更安心的人可以开启；不想在陪伴电话里一直想到计费的人，可以完全不接这个 adapter。

## 最小后端接线

可选前端期望两个已认证 route：

- `GET /api/provider-usage` → 返回 `await providerUsage.summary()`
- `POST /api/calls/:callId/provider-usage` → 把 termination payload 传给 `providerUsage.record()`

可复用实现：

`src/provider-usage.mjs`

如果 route 不存在，浏览器会静默隐藏 provider section，电话继续正常使用。

所有 provider credential 都应留在 server side。
