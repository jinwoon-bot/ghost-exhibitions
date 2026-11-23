# 교수님 귀신 시리즈 구조 검토

확인 대상: https://github.com/openc2023/web-media/tree/main/neu/ghost-series

파일 목록과 ghost-mirror, cctv-eye, ghost-wedding, hundred-eyes의 실행 코드 및 제작 설명을 읽었습니다. 교수님 코드를 복사해 우리 작품을 교체하지 않았습니다. 통합 경로와 중복 제거 구조에만 참고했습니다.

## 확인한 방식

- 하나의 index에서 작품별 하위 폴더로 연결하고, 큰 모델은 상위 `models/`에서 여러 작품이 공유합니다.
- 귀신 거울은 얼굴 랜드마크에 작은 얼굴 텍스처와 GIF를 WebGL 삼각형으로 맞추며, 균열·흐림·소리 등은 코드로 생성합니다. 실사 전신 걷기 영상과는 다른 접근입니다.
- CCTV는 얼굴과 사람 머리 검출을 구분합니다. 얼굴이 안 보이는 상태를 실제 얼굴 추적으로 표시하지 않고, 일정 시간 대기하거나 신호 없음으로 전환합니다.
- 머리 검출에는 nano/medium 선택이 있고 처리 중 프레임을 무한히 쌓지 않도록 busy 상태를 관리합니다.
- hundred-eyes는 CPU 얼굴 분석을 Worker로 분리하고, 최대 640px 입력·기본 8Hz 분석을 사용합니다. 가까움/멀어짐에 서로 다른 임계값과 유예 시간을 둡니다.
- ghost-wedding 설명은 프로그램으로 그린 임시 종이 인형을 쓰고 나중에 제공 에셋으로 바꾸는 구조라고 명시합니다. 실사 전신 영상이 완성된 것으로 볼 수 없습니다.

## 용량을 비교할 때 주의할 점

조회한 해당 디렉터리는 79개 파일, 총 194,922,496바이트였습니다. 공유 모델만 143,840,573바이트이고, medium 머리 검출 모델이 103,625,405바이트입니다. 짧은 효과에 비해 전체가 항상 가벼운 것은 아닙니다. 두 작품의 로컬 WASM도 중복되어 있습니다.

ghost-mirror/cctv-eye/ghost-wedding 코드는 MediaPipe/ONNX 라이브러리를 CDN에서 import하는 부분이 있으며, 모델 로딩에 로컬/원격 대체 경로가 있습니다. 따라서 저장소의 사진·JS 용량만 보고 오프라인 전체 필요 용량이 작다고 판단하면 안 됩니다. hundred-eyes는 로컬 JS/WASM과 상위 모델을 사용합니다.

## 이번 통합본에 적용한 범위

동일한 SHA-256인 MediaPipe 번들, WASM, Face/Pose 모델을 한 사본으로 공유하고 네 작품의 로딩·진단 경로를 수정했습니다. 버전이나 내용이 다른 파일은 합치지 않았습니다. 창귀의 분리 모델, 실사 영상, 전화 음원은 원본대로 보존했습니다. 통합 메뉴는 선택 전에는 모델을 불러오지 않으며, 작품 전환 때 이전 iframe을 제거합니다.

작품을 얼굴 마스크 방식으로 전면 재개발하거나, 저화질 카메라 인식이 현장에서 해결됐다고 주장하지 않았습니다. 교수님 측에 수정·업로드한 파일은 없습니다.

## 직접 읽은 원문

- https://github.com/openc2023/web-media/blob/main/neu/ghost-series/ghost-mirror/app.js
- https://github.com/openc2023/web-media/blob/main/neu/ghost-series/cctv-eye/app.js
- https://github.com/openc2023/web-media/blob/main/neu/ghost-series/ghost-wedding/app.js
- https://github.com/openc2023/web-media/blob/main/neu/ghost-series/hundred-eyes/face-worker.js
