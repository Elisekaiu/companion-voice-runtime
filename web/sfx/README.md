# Optional expressive audio

Companion Voice Runtime does not ship third-party, generated, personal, or private sound-effect audio.

The call runtime can optionally play user-provided clips around spoken turns. The public defaults intentionally stay general: affectionate cues, breath/room texture, and neutral rhythmic or ambient layers. More private cue vocabularies and audio choices belong to each deployment, not to the default repository.

## Setup

1. Prepare one local audio file containing clips you have the right to use.
2. Open `web/real-sfx-catalog.js`.
3. Add one catalog entry per clip:
   - `id`: unique local identifier
   - `group`: a cue family such as `kiss`, `breath`, `rhythm`, or your own category
   - `variant`: the variant used by your local performance mapping
   - `offset`: clip start time in seconds inside the audio file
   - `duration`: clip duration in seconds
   - `intensity`: normalized value from 0 to 1
   - `placement`: `tail`, `between`, or `underlay`
4. Build and run the app, then use **Import Custom SFX** in Call Room settings to store the audio file locally in the browser.

The audio file is stored in browser IndexedDB. It is not uploaded by the app.

The default public catalog is empty, so calls work normally without custom SFX.

If you extend the trigger vocabulary for a more private relationship style, keep those local rules in your own deployment rather than committing personal vocabulary or recordings to a public fork unless you explicitly intend to share them.
