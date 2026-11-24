# 출처와 사용 구분

## 초기 고관대면판의 출처 기록

- 승인 시트: 사용자 제공 `고관대면_05_밤을채우는머리_캐릭터시트 rnt.png`. 프로젝트 보존본 `sources/approved-sheet.png`.
- 초상: 승인 시트를 참조하여 OpenAI 이미지 생성 도구로 제작한 AI 이미지. 실제 배우 촬영·역사적 영정·민속 사료가 아닙니다. 원전의 고증을 새로 확정한 것이 아니라 사용자가 승인한 창작 캐릭터의 인상을 유지했습니다.
- 정적 본체, 두 홍채, 마스크: 같은 초상에서 로컬 분리. 얼굴·옷을 매 프레임 생성하지 않습니다. 프롬프트는 `docs/portrait-prompt.txt`.
- 액자·리본: 이 프로젝트 CSS. 종이/필름 노이즈: 시드 고정 로컬 생성. 외부 사진/음악을 무단 수집하지 않았습니다.
- 배경음: WebAudio 합성. 별도 음원·유료 음원 없음.

## MediaPipe

- Google `@mediapipe/tasks-vision` **1.2.3**. 사용 파일은 `vendor/vision_bundle.js`, `vendor/wasm/vision_wasm_internal.js`, `vendor/wasm/vision_wasm_internal.wasm`.
- SDK 라이선스: Apache-2.0. 원문 `mediapipe-APACHE-2.0.txt` 동봉. 저작권 고지는 원본 라이브러리 안에도 보존합니다.
- 공식 안내: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector/web_js
- 모델: Google 공식 BlazeFace short-range, float16, version 1. `models/face_detector.tflite`.
- 원본 URL: https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite
- 크기: 229,746 bytes. SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`.
- 모델 설명/공식 모델 카드 연결: https://developers.google.com/edge/mediapipe/solutions/vision/face_detector#models
- SDK의 Apache 고지와 모델의 출처를 별도로 기록합니다. 이 프로젝트 전체나 사용자가 제공한 그림을 Apache 라이선스로 재허가한다는 의미는 아닙니다.

## 로컬 실행기와 제작 도구

- 배포본 Node.js **v26.13.1 Windows x64**, OpenJS Foundation 서명 확인. 공식 `https://nodejs.org/dist/v26.13.1/win-x64/node.exe`에서 준비한 기존 실행기를 재사용합니다. 전체 저작권/오픈소스 고지 `runtime/node-win-x64/LICENSE.txt`, 해시·원본 URL `runtime/node-win-x64/runtime.json` 동봉. 시스템 설치·npm·유료 API가 필요하지 않습니다.
- Sharp는 제작/검수 도구에서만 사용합니다. 전시 런타임과 Pages 배포에는 포함하지 않습니다. 재현하려면 소스 개발 환경에서 `npm install --no-save sharp` 후 `node tools/prepare-assets.mjs`를 실행합니다.
- 배포 시 Node가 필요 없는 HTTPS 사이트에는 `runtime/`을 업로드하지 않습니다.
