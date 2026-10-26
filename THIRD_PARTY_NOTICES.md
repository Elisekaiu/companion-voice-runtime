# Third-Party Notices

This document covers third-party material that is redistributed by, vendored into, or directly installed by the Companion Voice Runtime reference implementation.

It is separate from [`ACKNOWLEDGEMENTS.md`](ACKNOWLEDGEMENTS.md), which also lists projects that influenced the design without having their source code redistributed here.

The top-level MIT license applies only to project-authored code. Third-party material remains under its original license.

## 1. TensorFlow YAMNet / AudioSet class metadata

**Files in this source repository**

- `web/models/yamnet_class_map.csv`
- `web/models/labels.txt` (display-name list derived from the class metadata)

**Runtime asset prepared by `npm run setup`**

- `web/models/yamnet.onnx`

The setup script downloads the ONNX conversion from the pinned `audiomagic/yamnet-onnx` revision `f25b741c2f0bdc6d7e6db24b5fddda23347dbafd` and verifies SHA-256 before installing it.

**Upstream / conversion source**

- TensorFlow Models / YAMNet
- https://github.com/tensorflow/models/tree/master/research/audioset/yamnet
- https://huggingface.co/audiomagic/yamnet-onnx/tree/f25b741c2f0bdc6d7e6db24b5fddda23347dbafd

**Copyright**

Copyright 2019 The TensorFlow Authors. All Rights Reserved.

**License**

Apache License 2.0.

A copy of the Apache 2.0 license is included at:

`third_party/licenses/Apache-2.0.txt`

The public-release audit recorded the following SHA-256 values:

- `yamnet.onnx`: `d3835ffbbd4a1bb3e777f0ca217b5007907f5171dd5d17c4236b95b2af8f908e`
- `yamnet_class_map.csv`: `cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2`
- `labels.txt`: `8e1267a120c1932b7273c0d0e0c5529edbb9a35512b437b1c8982baa59047051`

Companion Voice Runtime does not claim authorship of YAMNet or the AudioSet class taxonomy.

## 2. Neumann KU100 near-field HRIR data

**File in this repository**

- `web/hrir/ku100-right25.json`

**Immediate reference/source used during implementation**

- `Saekisui/binaural-voice`
- https://github.com/Saekisui/binaural-voice

**Underlying dataset**

J. M. Arend, A. Neidhardt, C. Pörschmann. *Spherical Near-Field (NF) HRIR Compilation of the Neumann KU100*. Zenodo, 2020.

DOI: https://doi.org/10.5281/zenodo.4297951

**License**

Creative Commons Attribution 4.0 International (CC BY 4.0).

A copy of the license legal code is included at:

`third_party/licenses/CC-BY-4.0.txt`

The Companion Voice Runtime file is a small derived/extracted representation used for a 25 cm right-ear realtime Web Audio path. Its public-release SHA-256 is:

`6bf4b26c8e22e37685ccbfd6f625b1a44a2eefd6c9d7e9c1fa8360509934cbad`

See also `third_party/ku100/ATTRIBUTION.md`.

## 3. ONNX Runtime Web browser artifacts

**Runtime files prepared by `npm run setup`**

The source repository does not commit the large ONNX Runtime Web ESM/WASM artifacts. After `npm ci`, the setup script copies the required files from `node_modules/onnxruntime-web/dist/` into `web/ort/` for browser inference.

**Upstream**

Microsoft ONNX Runtime

https://github.com/microsoft/onnxruntime

**Reference package version at audit**

`onnxruntime-web` 1.23.2

**License**

MIT License.

A copy of the ONNX Runtime license is included at:

`third_party/licenses/ONNXRUNTIME-MIT.txt`

## 4. Optional emotion2vec+ model

The optional emotion-shadow experiment can download `emotion2vec_plus_base` at runtime through FunASR / Hugging Face. The model weights are **not redistributed in this repository**.

**Upstream**

- emotion2vec / emotion2vec+
- https://github.com/ddlBoJack/emotion2vec
- https://huggingface.co/emotion2vec/emotion2vec_plus_base

The model card describes `emotion2vec_plus_base` as a roughly 90M-parameter speech-emotion-recognition model. Users who enable the optional worker are responsible for reviewing the upstream model license and any dependencies downloaded by their Python environment.

Companion Voice Runtime does not claim authorship of emotion2vec or its model weights.

## 5. Direct npm dependencies

The public source repository does not commit `node_modules/`. Installing dependencies with `npm ci` downloads packages under their own licenses.

Direct dependency metadata at the public-release audit:

| Package | Version | License | Upstream |
| --- | --- | --- | --- |
| `@elevenlabs/client` | 1.28.0 | MIT | https://github.com/elevenlabs/packages |
| `@elevenlabs/elevenlabs-js` | 2.73.0 | MIT | https://github.com/elevenlabs/elevenlabs-js |
| `@openai/codex` | 0.162.1 | Apache-2.0 | https://github.com/openai/codex |
| `onnxruntime-web` | 1.23.2 | MIT | https://github.com/microsoft/onnxruntime |
| `tls-sig-api-v2` | 1.0.2 | MIT | https://github.com/tencentyun/tls-sig-api-v2-node |
| `trtc-sdk-v5` | 5.20.2 | ISC | https://github.com/LiteAVSDK/TRTC_Web |

Transitive dependencies are recorded in `package-lock.json` and retain their respective upstream licenses.

## 6. External services

The reference implementation can call external hosted services, including ElevenLabs, AssemblyAI, Tencent TRTC/Speech services, and OpenAI services.

Those services are not licensed under the project's MIT license. Users are responsible for their own accounts, credentials, usage costs, regional availability, and compliance with each provider's terms.

No service API keys are included in this repository.

## 7. Expressive SFX

The public repository intentionally redistributes **no personal, generated, or third-party expressive SFX audio**.

`web/real-sfx-catalog.js` is empty by default. Users who enable the optional performance layer must provide audio they have the right to use. See `web/sfx/README.md`.

## 8. Inspiration-only projects

Projects listed in `ACKNOWLEDGEMENTS.md` but not listed above are not being relicensed by Companion Voice Runtime. Their inclusion in acknowledgements does not grant permission to copy or redistribute their code, documentation, media, or assets.
