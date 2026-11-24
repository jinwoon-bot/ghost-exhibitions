# 창귀 · 네 뒤에 남은 것

카메라에 잡힌 실제 공간과 관객을 그대로 보여주며, 관객이 움직이기 직전의 자세를 그 위에 남깁니다. 빠르게 움직일수록 더 촘촘하게 과거 자세가 남습니다. 시간이 지나면 밝은 한지 섬유는 위로 휘어지고 검은 먹은 낮게 퍼집니다.

## 실행

- GitHub Pages `works/chang-gwi/exhibit/`
- 기존 창귀 `works/chang-gwi/`
- 운영 설정 `works/chang-gwi/exhibit/?operator=1`
- 로컬 미리보기 `node tools/serve.mjs` 실행 후 `http://127.0.0.1:4387/ghost-exhibitions/works/chang-gwi/exhibit/`

전시 PC에서는 Chrome 또는 Edge에서 HTTPS 주소를 열고 **웹캠으로 시작**을 선택합니다. 브라우저 카메라 권한을 허용합니다. 다른 웹캠을 쓰려면 **운영 설정 → 웹캠**에서 장치를 선택합니다. 자동 성능과 1명으로 시작한 뒤 현장의 프레임률과 분리 결과를 보고 조절합니다.

- `D` 운영 설정 · `F` 전체화면 · 화면 더블클릭 운영 설정
- 운영 설정에서 좌우 반전, 생성 빈도, 유지 시간, 흩어짐 강도, 민감도, 인원, 저사양 모드, 소리를 바꿀 수 있습니다.
- **샘플로 시연**은 기존 저장소에 포함된 실촬영 테스트 영상을 실제로 분리합니다. **로컬 영상 시연**은 운영자 PC의 MP4 또는 WebM으로 같은 경로를 사용합니다.
- 안내 또는 카메라 미리보기는 운영 중 숨겨집니다. 영상 점검에는 작은 시연 표시가 나타납니다.

## 카메라와 렌더링

기존 저장소에 포함된 BodyPix 모델과 작업자를 사용합니다. 경계 보정은 마스크 안쪽을 유지하며 방금 비워진 영역에는 이전 프레임을 섞지 않습니다. 위치와 마스크 변화량을 비교해 정지나 미세한 떨림을 거르고, 팔을 내리거나 움직이기 직전의 자세를 저장합니다. 인물이 크게 겹치면 분리를 다시 확신할 때까지 신규 잔상 생성을 멈춥니다.

윤곽에서 인물색과 배경색이 섞인 경우 같은 프레임의 주변 픽셀을 사용해 가장자리를 보정합니다. 주변과 명암 차이가 작거나 손가락처럼 좁은 부분에서는 모델이 제공한 윤곽을 적용합니다.

원본 영상은 브라우저의 비디오 레이어로 즉시 표시됩니다. 인물 분리와 소멸 효과는 그 위의 투명 Canvas에서 실행되며, 현재 관객이 지나가면 가려지는 잔상만 지웁니다. 저장된 인물은 촬영 당시의 위치와 자세를 잠시 온전히 유지합니다. 한지와 먹 텍스처의 밝기, 마스크 경계 거리, 움직임 방향이 각 부분이 떨어지는 순서를 정합니다. WebGL은 밝은 섬유를 위로 휘게 하고 무거운 먹은 낮게 펼칩니다. 저사양 모드는 이 레이어를 낮은 해상도로 계산하며, WebGL을 사용할 수 없을 때는 Canvas 2D 조각이 남습니다.

원본 카메라 화면과 장면은 브라우저에서 바로 재생됩니다. 잔상에는 배경을 잘라낸 인물 영역만 메모리에 남기며, 만료 때 연결된 Canvas와 GPU 텍스처를 해제합니다. 기본 상한은 저사양 7개, 고품질 13개입니다.

## 원본 소스

`assets/hanji-fibers.png`와 `assets/ink-bloom.png`는 내장 이미지 생성으로 만든 1448×1086 원본입니다. 입자에는 기존 `assets/paper/hanji.png`의 조각을 함께 사용합니다. 불규칙한 소멸 마스크는 `material.mjs`에서 관객 마스크의 경계 거리, 먹 원본의 밝기, 잔상마다 다른 노이즈를 합쳐 생성합니다.

`assets/ambient.wav`와 `assets/hanji-tear.wav`는 `node tools/chang-gwi-audio.mjs`로 만든 합성 음원입니다. 참고 영상의 음악과 영상 프레임은 런타임에 포함하지 않습니다. 전시 구도와 밝은 윤곽, 저장된 자세와 먹이 흩어지는 연출은 사용자가 제공한 Duncan Fewkes의 E598 화면을 참고했습니다. [제작자의 후속 작업 설명](https://www.youtube.com/watch?v=YvnnrZvcDJM)

### 한지 생성 프롬프트

Use case: photorealistic-natural. Produce one high-resolution full-bleed landscape 4:3 macro photograph of a single aged Korean handmade hanji mulberry paper sheet, straight overhead, no objects. Photographic conservation studio reference. The full surface is richly detailed fine interlocked dak fibers, short plant hairs, occasional long thin bark fibers, subtle translucent fiber clouds, natural warm gray-beige ivory pulp slightly soiled by age, almost flat diffuse raking light, delicate irregularity at multiple scales. The paper should feel real when used as a projected wall texture. Consistent field to edges, restrained mottling, no isolated dark stains or pronounced perspective, no vignetting, no fold creases, no border, no torn edge, no writing, no marks, no stamps, no decoration, no watermark, no hands, no figure, no objects. Matte close surface, not a drawing.

### 먹 생성 프롬프트

Use case: photorealistic-natural. Produce one high-resolution full-bleed landscape 4:3 overhead conservation-quality macro photograph of deep black Korean sumi ink spread through raw handmade mulberry paper. Show authentic shape of microscopic feathered capillary ink edges with branching carbon granules and tiny mulberry fibers; various ink densities from heavy graphite-black islands to soft smoky charcoal and tiny narrow dry streaks. The material is a contiguous texture field for shader sampling, mostly dense near-black ink over muted gray hanji with transitions at several scales distributed across the frame. Keep the shape formless, tactile, unornamented, and organic with real grain rather than digital noise. Soft flat studio light, near-monochrome warm black and dusty charcoal, broad detail through the shadows. No people, no faces, no readable brushwork, no symbols, no text, no frame or visible sheet edges, no watermark, no paint shine, no bright color.

## 검증

`node tools/test-chang-gwi-exhibit.mjs`는 정지, 팔을 들고 내린 자세, 좌우 및 빠른 이동, 여러 관객의 겹침, 부분 소멸과 완전 제거, 관객 이탈을 각각 확인합니다. 60분 가상 시간 검사에서 4,583개의 잔상을 생성하고 전부 회수했습니다. 저사양 상한 7개가 유지됐습니다.

실제 인물 샘플 영상에서는 고품질로 1,044회 분석하는 동안 잔상을 반복 생성·회수했고, 저사양 WASM 경로에서도 실루엣과 한지 조각이 화면에 나오는 것을 확인했습니다. 같은 영상을 가상 카메라 스트림으로 넣어 웹캠 시작 버튼부터 프레임 수신, 분리, 잔상 생성까지 확인했습니다. 기준 수치는 개발 PC의 내장 브라우저에서 얻었습니다.

물리 웹캠과 프로젝터의 밝기, 바닥·벽의 설치 조건, 실제 다인 관객 테스트는 현장 장비에서 확인해야 합니다.
