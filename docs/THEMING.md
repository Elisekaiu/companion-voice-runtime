# Theming the public starter UI

The repository ships a deliberately neutral call-room theme.

The visual layer is intentionally separate from the voice runtime. You can change the appearance without touching STT, turn-taking, model adapters, TTS, call history, or perception.

## Main file

Edit:

`web/style.css`

The public stylesheet contains both layout and a simple neutral theme so a fresh clone is usable without additional assets or fonts.

## Easy customization points

At the top of `web/style.css`, change the CSS variables:

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

You can also replace:

- the default avatar through Call Room settings;
- the background presets;
- the custom background image;
- typography;
- button shape;
- call-room copy in `web/index.html`;
- the foyer greeting in `web/room.js`.

User-selected avatar/background images stay in browser IndexedDB.

## What not to couple to the theme

Avoid putting provider credentials, model prompts, relationship memory, or private recordings into CSS/HTML assets.

Keep visual customization separate from:

- `src/call/` — turn and call behavior;
- `web/stt-arbiter.js` — speech arbitration;
- `web/body-hearing-worker-src.js` — nonverbal detection;
- `web/voice-prosody-*` — voice-tone analysis;
- backend model/provider adapters.

The default theme is intentionally plain so forks can make the call room their own without first removing another person's private aesthetic.
