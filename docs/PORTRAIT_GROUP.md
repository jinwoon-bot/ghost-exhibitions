# 〈당신을 보는 영정〉 · 세 영정

전시실의 [세 영정 버전](../site/works/portrait/index.html?version=group)은 가운데 고관대면과 양옆의 두 인물을 한 벽에 겁니다. 기존 주소에서는 한 장 버전을 실행합니다. 작품 시작 화면에서 두 버전을 전환할 수 있습니다.

카메라와 마우스는 시선 좌표 하나를 만듭니다. 가운데에 관객이 서면 가운데 영정은 정면을 보고 양쪽 영정은 그 자리를 향해 안쪽으로 시선을 돌립니다. 관객이 좌우로 이동하면 각 액자의 위치를 기준으로 눈이 움직입니다. 관객이 화면을 떠나고 다음 관객이 없으면 마지막 응시를 기본 1초간 유지한 뒤 세 영정이 정면으로 돌아옵니다.

처음 선택한 관객 한 명을 유지합니다. 가운데나 가까운 사람을 우선하는 설정은 최초 선택과 떠난 뒤 재선택에 적용합니다. 얼굴·몸통의 위치와 크기를 사용하므로 서로 완전히 겹치는 인물의 구분에는 한계가 있습니다. 사진, 얼굴 식별 정보, 영상은 저장하지 않습니다.

작품 진입 전 **마우스 시연**을 누르면 카메라 없이 시선을 시험할 수 있습니다. **D**는 운영 설정, **F**는 전체화면, **R**은 정면 초기화입니다. 두 버전의 설정은 각각 해당 브라우저에 저장합니다. 카메라 설치와 보정 방법은 [한 장 버전의 운영 문서](PORTRAIT_V2.md)와 같습니다.

## 시각 소스

가운데 사진은 V2 초상을 사용합니다. 양옆은 내장 이미지 생성으로 만든 가상의 한국 인물입니다. 각각 1086×1448 원본에서 1629×2172 WebP를 만들고 눈꺼풀 안쪽 경계를 따로 지정했습니다. 보정된 웹 에셋은 [왼쪽 영정](../site/works/portrait/assets/portrait-group-left.webp), [오른쪽 영정](../site/works/portrait/assets/portrait-group-right.webp)입니다.

## 검증

- Chrome 1920×1080에서 좌우 응시를 비교했습니다. 눈 캔버스 여섯 곳 모두 변했고 그 영역 밖의 변경 픽셀은 0개였습니다. 관객이 중앙으로 오면 양옆 네 눈만 변했습니다. 정지, 시야 이탈 후 유지, 정면 복귀에서도 기준 화면과 일치했습니다.
- Chrome F 전체화면, 3840×2160과 412×797에서 세 액자 배치, 한 장 버전의 전환 버튼을 확인했습니다. 통합 정적 검사에서 6개 작품과 315개 파일, HTML 링크 48개가 통과했습니다.
- 인물 사진 두 장으로 만든 가상 카메라가 두 얼굴을 감지했습니다. 더 큰 얼굴이 추가될 때 관객 교체 0회, 첫 관객이 사라졌을 때 교체 1회, 두 사람이 모두 사라졌을 때 정면 복귀를 확인했습니다. 최초의 더 작은 합성 피사체는 감지되지 않았습니다. 성공한 시험에서도 로딩 구간 231.9ms와 동작 구간 86.9ms의 긴 프레임이 기록됐습니다.
- 실제 웹캠과 전시 현장의 조도·가림 상황은 미검증입니다. 운영자가 서로 지나치는 두 사람과 카메라에서 멀어진 관객을 현장에서 확인해야 합니다.

<details>
<summary>양옆 초상 생성 프롬프트</summary>

왼쪽 사진

> Use case: historical-scene. Create a single genuine-looking vertical 3:4 Korean photographic memorial portrait as though taken at a provincial Korean studio around 1910–1930. This is the left photograph in a quiet horror art installation of three OLD KOREAN memorial portraits, separately mounted by software. The face must resemble a real Korean person photographed then, entirely still and straight to camera in a quiet, somber atmosphere. Fictional 71-year-old Korean matriarch with broad cheekbones, quietly severe plain expression, aged texture and visible gray hairs, traditional center-parted black-and-gray hair in a tidy low chignon, old charcoal brown hanbok jeogori with pale ivory dongjeong collar. Muted warm charcoal sepia silver-gelatin tint, soft diffuse head-on studio light, background seamless dark ash brown, minimal film grain. From mid chest to head, head centered, face large; straight head and pupils looking at lens, chin level. Both eyes clearly visible, naturally open with enough soft gray sclera to either side of each iris to allow subtle animation, natural iris border and subdued tiny catchlight. No wrinkles drawn as graphic lines. No smile, no makeup, no jewelry, no text, no frame, no heavy damage, no additional objects or people. Render like a well-preserved antique photographic print, not commercial beauty nor costumed fantasy.

오른쪽 사진

> Use case: historical-scene. Create a single vertical 3:4 old Korean memorial photograph of a fictional gaunt 55-year-old Korean man, taken in a small provincial studio in the early twentieth century, presented as a real well-preserved dark gray silver gelatin photograph. This is the RIGHT portrait in a restrained unsettling installation, with software adding the framing; show exactly one person. The sitter has angular cheekbones, an elongated face, a tiny thread of black mustache, restrained ordinary human expression that feels stern, tired eyes, dark brown-black period Korean manggeon-style simple cloth headband across high forehead and neat pulled-back hair, charcoal blue-gray Korean traditional robe with distinct ivory Korean dongjeong collar. Korean costume and features. Plain smoked dark gray studio backdrop, very low-saturation neutral warm silver-gelatin grayscale, legible softly lit face, tiny natural catchlights, clear pupils and both eyes facing exactly straight to camera with gray sclera visible to their left and right. Camera eye level, close mid-chest to head, subject fills frame, perfectly front-facing symmetrical pose with subtle natural facial asymmetry. No props, modern glasses, banners, artwork edges, writing or frame. No motion blur, no closed eyelids, no pale fantasy eyes, no gore. It should be unsettling through its human stillness and quiet direct gaze.

</details>
