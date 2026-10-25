# 修改公开版 UI 主题

仓库默认提供的是一套刻意保持中性的通话房间主题。

视觉层和语音 runtime 是分开的。你可以改外观，而不需要碰 STT、轮次、模型 adapter、TTS、通话历史或 perception。

## 主要文件

编辑：

`web/style.css`

公开 stylesheet 同时包含基础布局与中性主题，所以刚 clone 下来也能直接使用，不要求额外字体或美术资产。

## 最容易改的地方

在 `web/style.css` 顶部修改 CSS 变量：

```css
--bg
--panel
--panel-2
--text
--muted
--line
--accent
--danger
```

还可以替换：

- Call Room 设置里的默认头像
- 背景 preset
- 自定义背景图
- 字体
- 按钮形状
- `web/index.html` 的通话文案
- `web/room.js` 的 foyer greeting

用户自己选择的头像 / 背景会保存在浏览器 IndexedDB。

## 不要把什么塞进主题层

不要把 provider 凭据、模型 prompt、关系记忆或私人录音放进 CSS / HTML 资产。

视觉定制应与以下部分保持分离：

- `src/call/` — 轮次与通话行为
- `web/stt-arbiter.js` — 语音仲裁
- `web/body-hearing-worker-src.js` — 非言语检测
- `web/voice-prosody-*` — voice-tone 分析
- 后端模型 / provider adapters

默认主题故意做得比较素，这样 fork 的人可以直接做成自己的样子，而不用先拆掉另一个人的私人审美。
