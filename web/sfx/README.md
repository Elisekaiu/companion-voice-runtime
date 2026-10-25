# 可选 expressive audio

Companion Voice Runtime 不随仓库提供第三方、生成、个人或私人音效音频。

通话 runtime 可以在语音轮次前后播放用户自己提供的 clip。

公开默认只保留比较通用的能力，例如亲密提示、呼吸 / 房间 texture、以及中性的节奏或环境层。更私人的 cue 词表与音频选择应该留在各自部署里，而不是塞进默认仓库。

## 设置

1. 准备一个你有权使用的本地音频文件。
2. 打开 `web/real-sfx-catalog.js`。
3. 为每个 clip 添加 catalog entry：
   - `id`：唯一的本地 identifier
   - `group`：例如 `kiss`、`breath`、`rhythm`，或你自己的类别
   - `variant`：本地 performance mapping 使用的 variant
   - `offset`：clip 在音频文件中的起始秒数
   - `duration`：clip 长度（秒）
   - `intensity`：0 到 1 的归一化强度
   - `placement`：`tail`、`between` 或 `underlay`
4. Build 并运行应用，然后在 Call Room 设置里使用 **Import Custom SFX**，把音频文件存到浏览器本地。

音频文件存放在浏览器 IndexedDB，不会由应用上传。

公开默认 catalog 为空，所以完全不配置 custom SFX 也能正常打电话。

如果你要扩展更私人关系风格的 trigger vocabulary，请把规则留在自己的部署里；除非你明确希望公开，否则不要把私人词表或录音 commit 到公共 fork。
