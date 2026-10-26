# Nap and wake lifecycle

Companion Voice Runtime can turn an active voice call into an explicit short nap without keeping cloud speech recognition open through the entire silence.

The feature is intentionally a call-state machine rather than a browser-only timer. A nap request is parsed from a direct wake-up instruction, stored with the active call, and restored after a page or service restart.

## Lifecycle

1. **Arm the nap.** Relative Chinese durations such as “二十分钟后叫我” and Hong Kong clock times such as “晚上八点半叫我” are accepted. Unrelated duration mentions are ignored.
2. **Stop listening intentionally.** The browser disconnects the active recognizers, invalidates pending STT setup work, disables automatic microphone recovery, and pauses autonomous follow-ups and quiet-hangup checks.
3. **Keep a visible local state.** The call surface shows a compact countdown and an early-wake control. Reloading the call restores this state without reopening STT.
4. **Wake from the server.** At the deadline, the server creates a real companion turn and TTS response instead of depending on speech recognition to wake the call.
5. **Gate listening on playback.** STT resumes only after the wake audio reports a completed playback for the exact call turn and generation. Late or duplicate playback reports are ignored.
6. **Use push only as a fallback.** If wake playback does not begin, an optional push-service adapter can send a fallback notification.
7. **Negotiate wake-up.** After the wake audio finishes, a bounded wake session can hear a snooze request, insist on getting up, or schedule a limited follow-up reminder.

## Strict and flexible wake policies

Ordinary naps default to a flexible policy and may allow a bounded snooze.

Clearly time-critical instructions—such as an exam, flight, appointment, or an explicit “do not let me snooze”—create a strict floor. A later model decision cannot silently weaken that floor. The server re-checks it when snooze would actually be armed.

The model can advise the tone and bounded wake behavior, but it cannot invent unlimited reminders or bypass server limits.

## Failure and race guards

Nap mode is designed around the races common in mobile browsers:

- a microphone permission request that resolves after Nap begins must stop its newly returned stream;
- provider discovery or Tencent session setup cannot start recognition after the Nap epoch changes;
- returning from the background cannot auto-reconnect the microphone while Nap is active;
- duplicate alarm callbacks cannot start duplicate wake turns;
- stale or duplicate TTS completion events cannot re-arm snooze;
- new user activity clears pending snooze/reminder state;
- active Nap/Wake state survives service restart and page recovery.

## Privacy and cost behavior

During Nap, realtime STT is deliberately closed. This is different from light sleep: light sleep may keep a low-cost recognizer online as a wake path, while Nap turns listening off because the user explicitly asked to sleep until a known deadline.

The server stores only bounded nap/wake control metadata with the call. Provider diagnostics remain separate from the companion prompt.