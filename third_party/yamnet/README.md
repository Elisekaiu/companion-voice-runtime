# YAMNet provenance

This project's browser-side nonverbal detector uses YAMNet-derived model material for audio-event inference.

Upstream project:

https://github.com/tensorflow/models/tree/master/research/audioset/yamnet

Copyright 2019 The TensorFlow Authors. All Rights Reserved.

Licensed under the Apache License, Version 2.0.

The source repository includes:

- `web/models/yamnet_class_map.csv` — AudioSet/YAMNet class map
- `web/models/labels.txt` — display-name list derived from the class metadata

`npm run setup` downloads the pinned ONNX conversion to `web/models/yamnet.onnx` and verifies its SHA-256 before browser inference.

Companion Voice Runtime does not claim authorship of the model architecture, weights, or class taxonomy. Its project-specific work is the browser worker, realtime buffering/windowing, confirmation/cooldown policy, cue selection, turn-scoped provenance, and conversation integration around the model.

See `../../THIRD_PARTY_NOTICES.md` and `../licenses/Apache-2.0.txt`.
