# 运行时数据

公开仓库里的这个目录故意保持为空。

运行时，Companion Voice Runtime 可能在这里创建：

- 本地通话 metadata
- 已归档的 assistant 音频
- Codex state
- 录音（仅当你主动开启）
- secret 文件

这些内容都不应该被 commit。

按照安装文档在 `data/secrets/` 下本地创建凭据；支持环境变量的地方，也可以改用等效环境变量。
