# Nap / Wake 生命周期

Companion Voice Runtime 可以把一通仍在进行中的电话切换成明确的短暂小睡状态，而不需要在整段安静时间里一直保持云端语音识别连接。

这个功能被设计成**通话状态机**，而不是单纯的浏览器计时器。用户明确提出叫醒要求后，Nap 会随当前 call 一起保存；页面刷新或服务重启后，状态仍然可以恢复。

## 生命周期

1. **设置 Nap。** 支持“二十分钟后叫我”这类相对时长，也支持“晚上八点半叫我”这类香港时间表达；普通的“我刚刚写了二十分钟作业”不会误触发。
2. **主动停止监听。** 浏览器会断开当前 recognizer，令尚未完成的 STT setup 失效，禁止自动麦克风恢复，并暂停自主 follow-up 与 quiet-hangup 检查。
3. **保留可见状态。** 通话页显示紧凑倒计时和“提前醒来”按钮；重新进入 active call 时只恢复 Nap UI，不会先开 STT。
4. **由服务端叫醒。** 到点后服务端发起真正的 companion turn 与 TTS，而不是依赖 STT 去“听见用户醒了”才继续。
5. **播放完成后才重新开耳朵。** 只有叫醒音频针对当前 turn + generation 报告真实完成播放后，STT 才恢复；迟到或重复的 playback report 会被忽略。
6. **Push 只做兜底。** 如果叫醒音频迟迟没有开始播放，可选 push adapter 可以发 fallback notification。
7. **叫醒后协商。** Wake 阶段可以处理 snooze、坚持叫起床，或安排有限次数的追加提醒。

## Strict 与 flexible 策略

普通小睡默认走 flexible policy，可以允许有上限的 snooze。

如果原始指令明显带有时间紧迫性，例如考试、航班、预约，或者用户明确说“不要让我赖床”，运行时会建立 strict floor。之后即使模型给出更宽松的建议，也不能绕过这层服务端约束；真正准备重新设 snooze 时还会再检查一次。

模型可以建议语气和有限的叫醒行为，但不能创造无限提醒，也不能突破服务器边界。

## 失败与竞态保护

Nap 重点处理移动浏览器里很常见的竞态：

- 麦克风权限在 Nap 开始后才返回时，新拿到的 stream 必须立刻停止；
- provider discovery 或 Tencent session setup 不能在 Nap epoch 已变化后继续启动识别；
- 从后台回来时，Nap 状态不能触发自动麦克风重连；
- 重复 alarm callback 不能发起第二个 wake turn；
- 迟到或重复的 TTS completion 不能再次执行 snooze；
- 新的用户活动会清掉待执行的 snooze / reminder 状态；
- active Nap / Wake 会随 call 保存，并能在服务重启与页面恢复后继续。

## 隐私与费用行为

Nap 期间 realtime STT 会被**明确关闭**。这和 Light Sleep 不一样：Light Sleep 可能保留一条低成本 recognizer 作为 wake path；Nap 是用户已经明确说要睡到某个时间，所以直接把监听关掉。

服务端只随 call 保存有限的 Nap / Wake 控制 metadata。Provider diagnostics 与 companion prompt 保持分离。