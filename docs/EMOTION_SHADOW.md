# 可选的 emotion2vec+ Shadow 实验

> 实验功能。Companion Voice Runtime **不依赖它**；我们目前也还没有足够长期的真实通话经验，不能说它已经适合当正式情绪感知层。

## 先更正一个以前的说法

项目原来的 “Voice Tone / 语气识别” 容易让人理解成“情绪检测”，这个说法太大了。

现有 browser worker 本质上是 **DSP / prosody（语音韵律）分析器**，不是 learned emotion classifier。它主要测：

- RMS / 相对音量
- voiced / silence 时长
- 停顿比例
- 近似 F0 / pitch
- 音高范围和变化
- 句尾音高走势
- 根据 transcript 和 voiced duration 估算的语速
- 相对个人 baseline 的变化

这些信息能告诉 companion “这句话是怎么说出来的”，例如比平时快、轻、停顿更多、音高变化更大，但不能因此直接下结论说用户“悲伤 / 紧张 / 兴奋”。

我们仍然保留 prosody，因为它本地、轻量、免费，而且对客观声学变化和个人 baseline 很有用。

## Shadow 模式加了什么

这个可选实验使用 `emotion2vec_plus_base`，让真正的 speech-emotion-recognition 模型在旁路异步运行。

参考流程：

1. 正常 STT / prosody / model reply 照旧，不等待 emotion2vec。
2. 一句话结束后，把这一句 16 kHz PCM 暂时放进本机队列。
3. 本地 sidecar 异步分类。
4. 推理完成后删除 raw PCM。
5. 只把 top labels / scores 和耗时挂到对应 user turn。
6. 前端可以显示 Shadow 结果，方便 A/B。
7. **参考实现不会把 emotion2vec 标签送进 companion prompt。**

这样可以先判断模型对你的语言、声音、麦克风和房间到底有没有价值，而不是因为“它叫情绪模型”就直接相信它。

## 资源占用：按需开启

emotion2vec+ 比原来的 browser prosody 重很多。

我们用于实验的一台 VPS 是 **2 vCPU / 8 GB RAM / 无 GPU**，当时观察到：

- 模型热起来后常驻大约 **1.0 GB RSS**
- 第一次冷加载峰值接近 **3 GB**
- 大约 4.1 秒的测试音频，热模型 CPU inference 约 **0.9–1.2 秒**

这些只是**我们这一台机器的观察值，不是官方最低配置或稳定 benchmark**。CPU 型号、PyTorch/FunASR 版本、音频长度和其它服务负载都会影响结果。

小 VPS、本来内存就紧，或者只是想要轻量 prosody 的部署，完全可以不开。

## 安装

目前用 Python 3.11 会比较稳妥。

CPU-only 示例：

```bash
python3.11 -m venv .emotion-shadow-venv
source .emotion-shadow-venv/bin/activate
pip install --upgrade pip
pip install --index-url https://download.pytorch.org/whl/cpu torch
pip install funasr huggingface_hub soundfile
```

从仓库根目录创建共享队列并启动 worker：

```bash
mkdir -p data/emotion-shadow/inbox data/emotion-shadow/results
EMOTION_SHADOW_DIR="$PWD/data/emotion-shadow" \
  .emotion-shadow-venv/bin/python tools/emotion-shadow-worker.py
```

然后在 call server 的环境里显式开启：

```env
EMOTION_SHADOW_ENABLED=1
EMOTION_SHADOW_DIR=/data/emotion-shadow
```

默认 Docker Compose 会把仓库的 `./data` 映射到容器 `/data`，所以 host-side Python worker 和 call container 可以通过文件队列共享数据，不需要再暴露一个网络服务。

## 隐私和失败行为

- worker heartbeat 过期时，call server 会拒绝 shadow PCM，不让 raw voice 堆在磁盘。
- inbox 有数量上限；处理不过来时会拒绝新 shadow job。
- 每句 PCM 只用于临时推理，worker 完成后会删除。
- raw microphone audio 不会写进 call-history JSON。
- 结果通过 `utteranceId` 回挂到正确的 user turn。
- Shadow 分数默认不进入 model prompt。
- `data/` 仍然在 Git ignore 范围内。

worker 还会写 `data/emotion-shadow/shadow-results.jsonl`，方便本地做 A/B 统计。如果连分数历史也不想留，可以自行关闭或定期删除。

## 要不要开？

目前建议非常简单：

- 保留现有 prosody，用它看客观声学和个人 baseline。
- 有资源、又好奇效果，再开 emotion2vec+ shadow。
- 先积累真实通话，看看它的分数变化是否真的有意义。
- 有足够证据以后，再考虑要不要让一个**受限、低权重**的 emotion signal 影响 companion。

模型标签只是模型证据，不是一个人真实内心状态的 ground truth。
