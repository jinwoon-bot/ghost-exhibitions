# Third-party notices

## TensorFlow.js

- Version: 4.22.0, browser UMD bundle.
- Source: https://github.com/tensorflow/tfjs
- Distribution: https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js
- License: Apache License 2.0. Full text: `vendor/LICENSE-tfjs.txt`. Distributed bundle retains upstream headers.

## BodyPix

- Version: 2.2.0, browser UMD bundle.
- Source and upstream license: https://github.com/tensorflow/tfjs-models/tree/master/body-pix and https://github.com/tensorflow/tfjs-models/blob/master/LICENSE
- Distribution: https://cdn.jsdelivr.net/npm/@tensorflow-models/body-pix@2.2.0/dist/body-pix.min.js
- License: Apache License 2.0. Full text: `vendor/LICENSE-bodypix.txt`.
- The package is deprecated upstream in favor of body-segmentation. It is pinned here for a reproducible static installation; no automatic upstream updates are performed.

## BodyPix ResNet50 checkpoint

- Architecture: ResNet50, output stride 16, quantBytes=2 (16-bit quantization).
- Official checkpoint: https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/resnet50/quant2/model-stride16.json
- Weight file: 12 files, `group1-shard1of12.bin` through `group1-shard12of12.bin`, resolved from the official JSON weightsManifest.
- Included locally as `models/model.json` and the twelve matching shard files in `models/`, unmodified contents. The JSON filename is shortened locally.
- Distributed as part of TensorFlow.js Models' BodyPix resources; upstream repository Apache-2.0 license is included above. The checkpoint JSON carries no separate embedded license metadata. Retain these provenance notes and upstream license with redistribution; independently review the intended exhibition/redistribution terms if required by the venue.
- `ASSET_HASHES.json` records SHA-256 checksums of the distributed runtime and model files.

## Original assets

Background grain, interface, ash/ink effects and synthesized sound are generated directly by this project's code. Human silhouettes are derived exclusively from actual camera/video segmentation; the old vector person generator was removed. No third-party human PNGs, stock footage, audio samples, web fonts, or image generation assets are used. User-provided reference footage and raw camera frames are excluded; the optional official TensorFlow sample below is included separately.

The screenshot PNGs show AI-segmented silhouettes from real filmed movement in TensorFlow Models official test data: https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/test_data/pose_1.mp4 . The repository license is Apache-2.0; the optional official source video is now included only as the explicitly labeled sample below. The user-provided reference footage was also used as a local development check. The three-column test repeats the same filmed person and is not a live three-person camera test. No original video or raw camera frame is distributed. FFmpeg and Playwright were used only as development tools; they are not required or redistributed with the installation.

## CPU fallback checkpoint (V2)
- Official BodyPix MobileNetV1 0.50, stride 16, quantBytes=2.
- Source: https://storage.googleapis.com/tfjs-models/savedmodel/bodypix/mobilenet/quant2/050/model-stride16.json
- Locally stored in models/cpu/model.json and group1-shard1of1.bin; ASSET_HASHES.json pins exact bytes. Same upstream Apache-2.0 provenance as BodyPix above.
- Lower accuracy than the ResNet50 GPU path. Both online and offline packages use identical model selection rules.

## Portable local server runtime (offline package only)
- Official Node.js v26.13.1 Windows x64 binary; no installer/npm needed.
- Source https://nodejs.org/dist/v26.13.1/win-x64/node.exe
- SHA-256 f5109dc868ec38703ad8f305e0aceece717cb60d4889873f434017af4e96cccb
- Official multi-component license and checksums: runtime/node-win-x64/LICENSE.txt and SHASUMS256.txt.
- No camera screenshots, filmed input, diagnostic exports or private development evidence is published in the GitHub Pages runtime.

## Optional sample input
assets/demo/pose_1.mp4 is TensorFlow Models official pose-detection test video, Apache-2.0 repository provenance: https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/test_data/pose_1.mp4 . It is only used by the explicitly labeled sample-video check; not a live webcam or three actual people. No user camera frame is included.

## Hanji atlas
assets/paper/hanji.png contains eight AI-generated Korean hanji fragment variants, created and alpha-cleaned with the built-in image generation tool, then resized to a single reusable 768x512 runtime atlas. No external runtime image service. Prompt and source preservation notes are in docs/HANJI_ASSETS.md.

## TensorFlow.js WASM backend
- Version 4.22.0. Official package: https://registry.npmjs.org/@tensorflow/tfjs-backend-wasm/-/tfjs-backend-wasm-4.22.0.tgz
- Source/API: https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-wasm
- Local files: vendor/wasm/tf-backend-wasm.min.js and the three official .wasm variants. File sizes/SHA-256 pinned in ASSET_HASHES.json. No runtime CDN.
- One worker thread for online/offline parity; SIMD is selected by supported browser capabilities. Plain JS CPU remains a fallback.
- Upstream Apache-2.0 text is retained in vendor/wasm/LICENSE-tfjs.txt. XNNPACK BSD notice is retained in vendor/wasm/LICENSE-XNNPACK.txt, sourced from https://raw.githubusercontent.com/google/XNNPACK/master/LICENSE and pinned by the asset manifest. Upstream distribution headers remain in the library.
