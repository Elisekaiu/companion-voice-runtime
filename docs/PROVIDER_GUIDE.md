# Provider 与模型选择指南

Companion Voice Runtime 使用的是一套**参考实现**，不是在宣称某一家 provider 对所有人都最好。

> **可以照搬角色，不必照搬厂商。**

一套稳定的语音通话栈通常需要：realtime STT、可选的第二识别器、transcript / turn arbiter，以及 expressive TTS。

## 推荐怎么选

### 中文为主：最推荐额外启用 Tencent

当前公开 hybrid 实现仍以 AssemblyAI 作为主 realtime stream / turn clock；它可以单独工作。

但如果你的电话以普通话 / 中文短句为主，**Tencent Cloud realtime speech recognition 是我们最推荐额外启用的一条链**。

原因很简单：

- 腾讯提供专门的实时中文语音识别 / RTC 能力；
- 它面向流式 16 kHz / 8 kHz 单声道语音，在音频到达时持续返回识别结果；
- 对短句、日常聊天式中文来说，让一个更专注中文 realtime 场景的识别器参与仲裁通常值得测试。

这里说的是**适配方向**，不是在声称这个 API 和微信使用同一套识别模型。最终准确率仍受地区、账号、麦克风、口音和房间环境影响，请用自己的真实通话测试。

官方参考：<https://trtc.io/document/80841>

### 主 / 通用路径：AssemblyAI Universal-3.6 Pro Realtime

参考 hybrid 客户端使用 AssemblyAI `universal-3-6-pro` 作为主 realtime stream / turn clock；没有 Tencent 时也可以单独运行。

AssemblyAI 把 Universal-3.6 Pro Realtime 定位在 voice-agent / telephony 对话，强调短 utterance、噪声 / 电话音频、口音，以及多语言 / code-switching 等 realtime 场景。

官方参考：<https://www.assemblyai.com/blog/universal-3-6-pro-realtime>

### 额外替代：ElevenLabs Scribe v2 Realtime

如果部署本来就在用 ElevenLabs，Scribe 可以作为另一条可选 STT 路径。它不是 hybrid 设计的必需组件。

## 为什么要有双识别器

双线不是必须。它的价值在于：**两家 provider 往往会以不同方式听错。**

当前公开 hybrid 流程：

1. AssemblyAI 与 Tencent 可以同时监听同一条麦克风流。
2. provider 自己的 `final` 只当作一个 ASR **segment**，不直接等于“用户整句话结束”。
3. `web/stt-turn-buffer.js` 等待真正的对话停顿后再提交。
4. 晚到的 provider segment 仍可以并入当前用户轮次。
5. 重复 final 会去重。
6. `web/stt-arbiter.js` 选择一份 transcript。
7. 最终只有一次 committed turn 进入 companion。

如果 Tencent 已经给出 finalized 中文结果，而另一条链只给出一个很短、明显不一致的英文假设，仲裁器可以优先采用中文结果。

公开仓库**不会**附带某个个人部署积累出来的私有纠错词典。如果你有行业术语、人名或固定易错词，应该在自己的部署里维护。

## Endpointing：provider final 不等于 conversation final

参考 turn buffer 默认大约：

```text
conversation silence: 1600 ms
partial timeout:       4200 ms
```

重点不是这两个数字本身，而是这条规则：

> **provider final != conversation final**

真实聊天里，人会停一下、想一下、再继续。把 provider 第一个 final 直接当成“整句话说完”，很容易把一句话切成两轮。

## Light Sleep：省空闲成本，但不牺牲轻声

Realtime STT 连接在没人说话时仍可能累积 session 时间。

旧版 30 秒 quiet mode 会把两条云 STT 一起睡掉，然后只靠本地 RMS 音量门槛唤醒。这样更省，但轻声容易吃亏。

现在 hybrid 客户端采用 **Light Sleep**：

- 大约 30 秒真正安静后，AssemblyAI 可以关闭 realtime session；
- 配置了 Tencent 时，Tencent 保持在线，作为 wake path；
- Tencent 一旦重新听到并转出语音，可以唤醒 AssemblyAI，因此很轻的声音不需要先跨过本地音量阈值；
- 本地 RMS speech gate 仍保留，但只作为备用；
- 约 3 秒 microphone pre-roll 会被保留，AssemblyAI 重连后优先补入；
- 如果 Tencent 没有可用，参考客户端不会自动让 AssemblyAI 睡掉，而是优先保证轻声识别；
- 手动静音仍会主动关闭识别链路。

如果浏览器 / 网络异常导致 AssemblyAI 没有正常发送 termination 用量，客户端还会用本地已发送音频时间做 fallback 记录。**Provider 自己的账单仍是最终权威，本地 Usage 只是估算。**

## TTS

参考 TTS 使用 ElevenLabs v4 Turbo，因为当前 speech-delivery pipeline 的分句、delivery preset、playback shaping 和可选 performance layer 都围绕它做过实际调试。

Multilingual v2 与 Flash v2.5 仍然保留为备选。

这里的“参考”只表示：**这个项目实际测过、调过。** 不代表客观上对所有 companion 都最好。

## 本地环境音：为什么选择 YAMNet

可选的 Hearing v2 使用 **YAMNet + ONNX Runtime Web** 在浏览器本地做环境音 / nonverbal 分类。

YAMNet 适合这个位置的强点不是“最聪明”，而是**轻量、低延迟、类别广、能本地跑**：

- 16 kHz mono waveform input
- 约 0.96 秒分析窗口
- 0.48 秒 hop，也就是 50% overlap
- 521 个 AudioSet 输出类别
- 还提供 1024 维 embedding，后续如果部署想训练自己的小分类头，可以继续利用
- 原始麦克风音频不需要为了环境音分类再上传到独立云服务

官方参考：<https://github.com/tensorflow/models/blob/master/research/audioset/yamnet/README.md>

公开 Hearing v2 现在覆盖更广的日常声音，例如音乐、雨、风、水声、门 / 门铃、脚步、键盘、宠物、交通、火车、飞机、做饭、餐具、家电、闹钟、警笛、咳嗽、喷嚏和笑声。

运行时会区分：

- **reactive**：门铃、咳嗽、警笛等，允许触发即时反应；
- **ambient**：音乐、雨、键盘等，只作为环境上下文，不会因为持续存在就不断让 companion 插嘴。

YAMNet 仍然只是一个通用 AudioSet 分类器。官方公开的 balanced mAP 大约是 0.306，所以这些结果应该当作概率提示，不是 ground truth。实际部署一定要拿自己的手机、麦克风和房间调阈值。

## 换成你自己的栈时，分别测这些

- transcript 准确率
- 一两个字的短 utterance
- conversation endpointing
- 轻声
- latency
- code-switching
- 背景噪声
- 浏览器 suspend / recovery
- 计费模型
- 凭据暴露风险
- 地区 / 隐私要求
- provider 故障与 fallback

AI 陪伴电话对很小的语音 pipeline 失误都非常敏感。最好直接用你真正会拿来打电话的手机、麦克风、房间和说话方式测试。
