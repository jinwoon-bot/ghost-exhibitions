# 〈당신을 보는 영정〉 · 가족사진

세 사람이 한 장의 오래된 가족사진 속에 어깨를 맞대고 서 있습니다. 세 액자 버전보다 얼굴과 눈을 크게 읽을 수 있게 가슴 위로 구도를 잡았습니다. 기존 한 장 버전의 시작 화면에서 **가족사진 버전**을 선택합니다. 직접 경로는 `works/portrait/?version=family`입니다.

세 사람은 같은 관객 한 명을 바라봅니다. 관객이 중앙에 있으면 양옆의 시선이 안으로 모이고, 관객이 좌우로 이동하면 여섯 눈동자가 따라갑니다. 가운데를 포함해 눈꺼풀과 얼굴은 제 위치에 머뭅니다. 선택한 관객이 보이는 동안 그 사람을 계속 추적합니다. 화면에서 아무도 보이지 않으면 약 1초 뒤 정면으로 돌아옵니다.

가족사진의 기본 시선 이동은 한쪽으로 원본 좌표에서 최대 16px입니다. 운영 설정 **D → 눈동자 → 최대 이동**에서 1~18px로 조절할 수 있습니다. **마우스 시연**에서 화면 좌우로 움직여 반응을 확인하고, **F**로 전체화면을 켭니다. 카메라 설치와 권한은 [고관대면 운영 안내](PORTRAIT_V2.md)를 참고합니다.

세 액자 시안은 `works/portrait/?version=group`에서 비교할 수 있습니다. 각 버전의 운영 설정은 별도로 저장됩니다.

## 이미지

가상의 인물 세 명을 내장 이미지 생성으로 만든 단일 1536×1024 원본입니다. [웹용 WebP](../site/works/portrait/assets/portrait-family.webp)는 출력용으로 3072×2048로 확대했습니다. [여섯 눈 영역](../site/works/portrait/assets/portrait-family-eyes.json)을 원본 좌표에 맞춰 보정했습니다.

## 검증

- Chrome 1920×1080에서 같은 마우스 좌우 위치의 화면을 비교했습니다. 눈동자 무늬의 수평 이동은 세 액자 6~9px, 가족사진 22~27px였습니다. 여섯 눈 평균은 약 3.3배였습니다.
- 눈 영역 여섯 곳 바깥의 변경 픽셀은 0개였습니다. 중앙 응시 때 양옆 네 눈이 움직였고, 시선 유지와 모두 떠난 뒤 정면 복귀 화면은 각 기준과 일치했습니다. 전체화면과 모바일 폭에서 액자 배치를 확인했습니다.
- 가상 카메라 두 사람으로 첫 사람 추적 유지, 그 사람이 떠난 뒤 두 번째 사람을 선택, 모두 떠나면 정면 복귀를 확인했습니다. 해당 실행에는 시작 구간 264.3ms와 동작 구간 100.9ms의 긴 프레임이 기록됐습니다. 실제 카메라와 관람 거리에서의 가시성은 미검증입니다.

<details>
<summary>생성에 사용한 프롬프트</summary>

> Use case: historical-scene, photorealistic natural antique photograph. Make ONE horizontal 3:2 photograph of THREE fictional Korean family adults, sharing the same extremely tight shoulder-to-shoulder grouping in the same Korean portrait studio around 1910–1930. This is artwork inside a single frame for a quiet horror interactive installation. No frame, no photograph borders, no typography. Very tight facial composition designed for electronically animating the eyes: three faces side by side, no space between shoulders, each face roughly 26–29% of the full image width and 58–63% of its height, eyes clearly visible near the horizontal middle row. Heads nearly fill the width, from just above the hair to chin and only a sliver of collar and upper chest. Space just above all heads, no clipped face. Facing directly forward with both eyes open, eyes roughly on one horizontal line, clean natural dark irises, realistic gray-white visible sclera to left and right with natural 4–6 mm room for pupil motion; eyes wide enough to read at exhibition distance yet calm. The left figure is a stern Korean older woman with black-and-gray neatly center-parted hair, small restrained age marks and ink-brown hanbok. The middle figure is their elderly patriarch, a distinctive broad weathered face, softly drooping jawline, small simple black Korean bokgeon-style cap, dark charcoal hanbok. The right figure is a gaunt adult Korean son, simple black Korean manggeon-style headband, clean almond eyes and charcoal hanbok. All three have opaque ordinary sober expressions, lips fully closed, chin neutral, hands outside shot. One continuous dim smoked gray studio backdrop, shared soft front lighting that leaves eyes readable, natural skin grain, low-saturation neutral warm gray monochrome true silver-gelatin print, subtle historic photo texture. Form a genuine close family photograph with shoulders touching and 3 separately legible faces. Create the sense that three real people are silently looking out of one old image. No collage, no panels, no multiple frames, no modern clothing, no fantasy, no artificial aging marks, no supernatural eye colors, no gore or malicious expressions, no overlapping faces, no props. Output landscape.

</details>
