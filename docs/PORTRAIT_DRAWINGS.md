# 〈당신을 보는 영정〉 · 그림판

전시 시작 화면에서 **먹그림 손각시**와 **귀면 도깨비**를 선택합니다. 기존 **가족사진**도 같은 화면에서 열 수 있습니다.

| 작품 | 전시 상대 주소 | 기본 좌우 이동 폭 |
| --- | --- | --- |
| 한지 속 손각시 | `works/portrait/?version=ink` | 원본 기준 한쪽 최대 22px |
| 귀면 도깨비 | `works/portrait/?version=dokkaebi` | 원본 기준 한쪽 최대 34px |
| 가족사진 | `works/portrait/?version=family` | 원본 기준 한쪽 최대 16px |

두 그림의 눈동자가 관객 한 명을 함께 따라갑니다. 관객이 멈추면 시선을 유지합니다. 다른 관객이 접근해도 처음 선택한 사람을 유지하고, 아무도 보이지 않으면 잠시 마지막 방향을 바라보다가 정면으로 돌아옵니다. 입, 눈꺼풀, 머리카락, 종이와 그림 가장자리는 고정됩니다.

**마우스 시연**은 카메라 없이 실행합니다. **D**에서 카메라와 최대 눈동자 이동을 조정하고, **F**에서 전체화면을 켭니다. 전시장 설치와 카메라 권한은 [고관대면 운영 안내](PORTRAIT_V2.md)를 참고합니다.

## 소재와 저작

- 손각시 기록에서 인물을 가져오고, 먹이 눈 밑으로 번진 상상 속 한지 초상으로 제작했습니다. [국립민속박물관 한국민속대백과사전 · 손각시](https://folkency.nfm.go.kr/topic/detail/2407)
- 도깨비는 국립중앙박물관 소장 통일신라 수막새가 강조한 눈·코·입과 구슬 테두리에서 착안한 창작입니다. [국립중앙박물관 · 짐승얼굴무늬 수막새](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=3124&schM=view&searchId=search)
- 두 그림은 내장 이미지 생성으로 제작했습니다. 원본은 각 1086×1448이며, 전시용은 2172×2896으로 확대한 WebP입니다. [손각시 그림](../site/works/portrait/assets/portrait-ink.webp) · [도깨비 그림](../site/works/portrait/assets/portrait-dokkaebi.webp)
- 가족사진 승인 시점은 [GitHub 보존 태그](https://github.com/jinwoon-bot/ghost-exhibitions/tree/portrait-family-v1)에 남아 있습니다.

## 검증

- Chrome 1920×1080의 같은 좌우 마우스 위치에서 눈동자 무늬가 움직인 거리를 비교했습니다. 손각시는 23~24px, 도깨비는 36~37px였습니다. 눈 영역 바깥의 변경 픽셀은 0개였습니다.
- 시선 정지, 관객이 사라진 직후 유지, 정면 복귀를 픽셀 비교로 확인했습니다. 그림 두 장과 가족사진의 전체화면 및 모바일 폭 배치도 확인했습니다.
- 귀면 도깨비에서 인물 두 명을 합성한 가상 카메라로 먼저 잡은 사람 유지, 다음 사람 선택, 두 사람이 떠난 뒤 정면 복귀를 검증했습니다. 그 실행에서 초기 최대 프레임 간격은 200ms였고, 관객을 바꾼 구간에는 75ms 간격이 있었습니다. 실제 웹캠과 현장 관람 거리에서의 검증은 남아 있습니다.
- 단위 검사 7개와 통합 정적 검사 6개 작품, 321개 파일, HTML 링크 49개가 통과했습니다.

<details>
<summary>그림 제작 프롬프트</summary>

손각시 초안

> Use case: illustration-story and historical-scene. A single original portrait illustration for an unsettling Korean ghost exhibition: the Korean unmarried female ghost Songaksi (손각시), hand-brushed in dense Korean ink wash and dry brush with just a trace of faded iron red pigment on old rough pale tan Korean hanji paper. This is an actual convincing hand-painted image with exposed paper fibers, fine ink hairs and deliberate washes, very different from photography or a digital illustration. Portrait 3:4. Close frontal head and upper chest, both eyes absolutely unobstructed and center at about 40–45% of the image height, no head turn. Large face takes 61–65% of picture width, encroaching black ink-wash hair, a few disheveled strands outside the eye region. Long face of pale raw paper with thin angular eyebrows, mostly flat restrained shading and old pigment blooms; mid length nose, still closed cracked dark lips, serene deeply uncanny blank expression. Both almond eyes open just wide enough to clearly see off-white warm gray sclera beside a dense black circular iris; normal anatomy and matching gaze straight forward. Eyes are sharply delineated even as edges of the hair dissolve into hand-inked bleeding strokes. No hair over eyes, no fully black eye sockets, no glow. She wears rumpled off-white Korean mourning jeogori, identifiable crossover collar and narrow tie; a very small wine-red pigment trace near the collar. No elaborate Japanese or Chinese clothing, no crown. Portrait hung as a Korean folktale haunting. Tangible emptiness in the gaze. Keep the paper aged at the edges with subtle discoloration and black washes, gunmetal charcoal and warm subdued parchment with clear head-eye contrast; use delicate traditional brush texture throughout. One painted Korean person, no extra figures, no frame, no captions, no letters, no red seals, no borders, no extreme gore.

손각시 수정

> Use case precise-object-edit, original hand-painted horror ghost portrait. Refine the provided Korean Songaksi ink painting into a genuinely severe, unnerving cursed portrait on hanji. Preserve the frontal framing, head angle, approximate positions and shapes of both visible eyes, Korean crossed white jeogori collar and little faded red stain, one figure, portrait ratio, static closed mouth. Remove the softly attractive or makeup-like quality. Cold desaturated sooty black ink, dead pallid gray-beige paper face with areas of visible coarse paper, deep angular dry-brush tear shadows immediately under the eyelids like old ink seepage, cheeks a little more sunken, brittle narrow dark lips with uneven dry-aged lines, further tangled wiry hair and fierce dark ink blooms around outer edges; these details should read as hand-painted ghost from a Korean folklore nightmare. Increase contrast of both entirely unobstructed eyes: intact clearly delineated natural eye shapes, pale gray matte exposed sclera clearly visible to the right and left of both irises, small dense black irises at rest facing camera, only faint natural tiny dry ink speck for catchlight. Keep both pupil regions clean enough for physical horizontal motion. Fright comes from an empty unyielding stare and the unnatural quiet old paper, no smile or mouth opening, no modern makeup or skin glamour, no flyaway brush over the visible eyes, no figure behind her, no whiteout, no black-only holes, no scrawled text or new objects, no explicit wounds or gore. More authentic paper ink texture and scratched dry brush in the shadows, more dramatic selective contrast, still careful restrained eye geometry. Single image, no frame, no captions.

귀면 도깨비

> Use case historical-scene and illustration-story. An original frightening traditional Korean dokkaebi (도깨비) staring portrait for an interactive gallery, inspired by the huge eyes, emphasized nose and sculpted flat mouth of the old Korean Unified Silla 귀면문 roof-end tile motif. Invent a haunting folklore image; do not copy any artifact, do not pretend this is a documentary reconstruction. Traditional Korean dry ink rubbing meets high-contrast hand-colored ink and terracotta wash on deep warm slate-gray charcoal-stained hanji. Vertical 3:4 single face, no props, no borders. A brutally old chipped roof-tile face seems to be pressed into the paper, frontal, no shoulders, enormous stylized carved flared eyebrows and flattened nose, layers of gritted tooth ridges inside a closed carved mouthline, frayed cloud-scroll mane and erased bead rim, warm ember red dry pigment sparsely in the carving, mostly charcoal, brick and umber. Sculptural paper impression, broadly human eye contour with two wide open clearly separate eye openings near the upper-middle of image and BOTH irises centered and oriented straight at camera. Dark small nearly circular pupils/irises, surround each by legible aged light ash-gray pigment sclera where the black eyes can slide from side to side. For interactive use each eye should be at least 16% of the picture width, generous blank ash-gray on both horizontal sides of iris, no ornament crossing across either eye opening, no highlight gleam only one tiny mineral speck, no second set of fake eyes. Deep creases and carved flat fury around eyes, still mouth and almost petrified incredulously straight stare. One ghost face, recognizably Korean roof-tile style, avoid Japanese oni horns, fantasy monster horns, anime, bulging comic balloon eyes, modern typography, absolute black eye sockets or white glowing eyes, graphic injury or gore. Original terrifying ominous old paper art with recognizable dry-grain Korean printmaking material.

</details>
