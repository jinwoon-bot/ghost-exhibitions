# 〈당신을 보는 영정〉 · 인물 영정

오래된 한국 흑백사진 속 한 사람의 눈만 관객을 따라 움직이는 작품입니다. 통합 전시 목록에서 **인물 영정**을 고르거나 [공개 작품 주소](https://jinwoon-bot.github.io/ghost-exhibitions/works/human-portrait/)를 엽니다. 이전 영정 주소도 이 작품으로 연결됩니다. [귀면 도깨비 확정본](https://github.com/jinwoon-bot/ghost-exhibitions/tree/dokkaebi-final-v1)

## 실행

이 저장소 최상위에서 `node tools/serve.mjs`를 실행한 뒤 `http://127.0.0.1:4387/ghost-exhibitions/works/human-portrait/`를 Chrome에서 엽니다. **카메라로 시작**은 실제 카메라 권한을 요청합니다. **마우스 시연**을 선택하면 카메라 없이 좌우 움직임을 볼 수 있습니다.

**D** 운영 설정, **F** 전체화면, **R** 정면과 관객 선택 초기화입니다. 운영 화면에서 연결할 카메라와 좌우 방향, 첫 관객 선택 기준, 관람 구역 너비와 최소 얼굴 너비를 조정할 수 있습니다. 관객의 영상이나 얼굴 정보를 저장하거나 전송하지 않습니다.

| 상황 | 동작 |
| --- | --- |
| 여러 명이 관람 구역에 함께 들어옴 | 기본 구역은 화면 중앙 60%입니다. 약 0.24초 이상 확인된 중앙 사람을 먼저 잡고, 중앙성이 비슷하면 화면에 크게 보이는 사람을 선택합니다. 운영자가 크기 우선으로 바꿀 수 있습니다. |
| 한 명을 잡은 뒤 다른 사람이 가까이 지나감 | 같은 관객을 유지합니다. 얼굴이 작아져도 같은 위치와 크기로 관측되는 몸통을 사용할 수 있습니다. |
| 잠깐 얼굴이 가리거나 관객이 겹침 | 애매한 순간에는 마지막 시선을 유지합니다. 약 1.3초 동안 기존 관객이 확인되지 않으면 선택을 풀고, 다음 사람도 중앙 구역에서 확인한 뒤 선택합니다. |
| 카메라가 저해상도이거나 어두움 | 현장에서 제공하는 해상도를 받아 카메라를 엽니다. 어두운 입력은 분석용으로만 밝힙니다. 얼굴을 먼저 검사하고 필요할 때 몸통 분석을 추가합니다. 분석 간격을 처리 속도에 맞춥니다. 충분한 관측이 없으면 잠시 시선을 유지하고 정면으로 돌아옵니다. |
| 연결이 끊기거나 권한을 받지 못함 | 작품 시작 화면에 해결 안내를 표시합니다. 운영 설정에서 다른 카메라를 고르거나 마우스로 시험할 수 있습니다. |

거리 우선은 화면 속 크기를 근사값으로 쓰는 방식입니다. 두 사람이 완전히 겹치면 구분하기 어려울 수 있습니다. 관람 위치를 바닥에 표시하고 관객 얼굴 쪽에 약한 조명을 두면 현장 조정이 쉽습니다.

## 검증

- Chrome에서 1080p 마우스 시연과 전체화면을 검사했습니다. 눈 영역 밖의 변경 픽셀은 0개였고, 화면 밖으로 벗어난 뒤 정면으로 돌아왔을 때 원본과 일치했습니다.
- 인물 두 명을 넣은 320×180 가상 카메라에서 중앙 인물 선택, 저조도 보정 중 유지, 잠깐 어두워졌을 때 유지, 첫 관객 퇴장 후 새 관객 선택, 검은 화면에서 정면 복귀, 연결 종료 안내를 확인했습니다. 같은 예제에서 얼굴과 몸통을 함께 검사하던 경우의 예약 간격은 450ms였고, 얼굴 우선으로 바꾼 최종 실행에서는 정상 추적 중 예약 간격이 100ms였습니다.
- 관객 선택, 위치 가림, 몸통 후보, 저조도 보정의 단위 검사 5개와 통합 사이트 정적 검사를 통과했습니다. 실제 전시장 카메라, 극저조도에서의 인식률, 역광과 여러 사람이 완전히 겹치는 경우는 현장 시험이 남아 있습니다.

## 이미지

내장 이미지 생성으로 제작한 가상의 한국 여성입니다. 원본 1086×1448을 전시용 2172×2896으로 확대했습니다. [웹용 인물 영정 이미지](../site/works/human-portrait/assets/portrait-human.webp) · [두 눈 영역 설정](../site/works/human-portrait/assets/eyes.json)

<details>
<summary>생성 프롬프트</summary>

> A fictional Korean woman, about 55, in a preserved early-1920s Korean village studio glass-plate photograph. This is a serious, quietly disturbing family memorial image for an art installation with animated irises. One adult human in the whole image, straight frontal, from upper chest to above her hair, close proportion, face fills around 64% of canvas width. Vertical 3:4. Plain charcoal-brown jeogori of the era, thin aged ivory dongjeong crossed collar, neutral very dark gray backdrop, tightly gathered black and graying hair with center part, nothing ornamental. A woman who looks ordinary enough to have existed, weary natural texture, subtle facial asymmetry, lips resting closed, utterly still, softly lit with a faint cold gray right-side shadow, low-saturation matte charcoal-blue silver-gelatin tone. Direct-to-camera gaze, realistic dark irises with both eyes clearly readable, gray-white sclera visible on both sides of each iris. Preserve a little horizontal room for the black irises to slide in a composite. Eyes level, lady faces camera head-on, keep lashes and sclera fully unobstructed. Editorial quality photographic realism, accurate worn but fine hanbok weave, subtle period film texture, simple restrained paper edge. Uncanny through the impression of someone holding her still gaze for too long. No gore, laughing, makeup, open mouth, fantasy, spectral transparency, borders, letters, picture frame, extras, jewelry, color glare or portrait Photoshop contrast effects.

</details>
