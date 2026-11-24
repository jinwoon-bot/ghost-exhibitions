# 금지된 방송 · 실종 접수

4:3 전시용 독립 실행본입니다. 기본 화면에는 동명 지역뉴스 네 꼭지가 약 62초 주기로 흐릅니다. 카메라가 관객을 처음 감지하면 **동명 실종기록센터** 안내 카드가 먼저 뜨고 약 1.08초 뒤 실종 공지가 나타납니다. 공지 뒤로 동명대학교 본관 전경이 비치다가 복도 자료 화면으로 넘어갑니다. 복도 인물이 든 종이에는 공지와 같은 사진이 들어갑니다. 정적 뒤 가상 인물의 얼굴이 렌즈 쪽으로 짧게 돌진하고 방송 영상과 소리가 암전으로 끊깁니다.

- 전시 화면 `site/works/forbidden-broadcast/exhibit/`
- GitHub Pages 경로 `works/forbidden-broadcast/exhibit/`
- 전시 PC에서 첫 실행은 [웹캠 전시 시작](https://jinwoon-bot.github.io/ghost-exhibitions/works/forbidden-broadcast/exhibit/?camera=1)을 열고 **웹캠 전시 시작**을 누릅니다.
- 운영실을 먼저 열려면 주소 끝에 `?operator=1`을 붙입니다.
- 카메라 없이 연습하려면 `?demo=1`을 붙입니다.

## 현장 실행

1. CRT나 4:3 모니터의 안전영역을 확인합니다. 16:9 모니터에서는 검은 여백으로 구도를 유지합니다. 실제 CRT가 컴포지트만 지원하면 사용 중인 PC 출력에 맞는 변환기를 연결합니다.
2. 최신 데스크톱 Chrome이나 Edge에서 GitHub Pages HTTPS 주소를 열거나 저장소 루트에서 `node tools/serve.mjs`로 로컬 서버를 시작합니다. 로컬 주소는 `http://127.0.0.1:4387/ghost-exhibitions/works/forbidden-broadcast/exhibit/?operator=1`입니다.
3. `D`로 운영실을 열고 **소리 켜기**를 누릅니다. 앵커 음성, 대역이 좁은 테이프 잡음, 공간음, 지연 음성, 글자 입력과 전환음은 각각 조절되는 레이어입니다. 실제 스피커에서 조용한 뉴스 음성부터 기준 음량을 잡습니다.
4. 사용할 웹캠을 먼저 고르고 **웹캠 연결**을 누릅니다. **웹캠 미리보기**로 얼굴이 프레임 안에 들어오는지 확인합니다. 먼 위치와 가까운 위치에 차례대로 서서 **기록 가능**이 표시될 때 각 점을 기록합니다. 거리값은 장면의 속도와 음향 강도에 사용됩니다. 첫 송출은 감지 자체로 시작합니다.
5. 얼굴 삽입을 운영하려면 촬영 프레임이 화면에 일시 사용되는 창작 전시라고 입구에 알리고 **관객 얼굴 삽입 허용**을 켭니다. 관객 얼굴을 사용하지 않는 회차는 이 옵션을 끈 상태로 운영합니다.
6. **대체 사진 선택**은 PNG·JPEG·WebP를 지원합니다. 설정한 파일은 현재 탭에서만 유지됩니다. **공지 한 번 송출** 또는 Space 키는 그 사진으로 한 회차를 재생합니다.
7. `F`로 전체화면을 열고 운영실을 닫습니다. `D`로 다시 열 수 있고, `M`으로 소리를 켜거나 끕니다. 카메라 없이 거리 변화를 보려면 **마우스 데모**를 켜고, 화면 위쪽에서 가까이 접근한 상태를 시뮬레이션합니다.

## 어두운 전시장

얼굴 감지는 웹캠 분석 프레임을 밝게 보정한 뒤 가장 크게 잡힌 얼굴을 후보로 삼습니다. 얼굴이 잘 잡히지 않으면 사람 영역의 어깨 폭을 상대 거리로 쓰고, 대체 사진으로 진행합니다. 카메라에 사람이 구분될 정도의 빛이 부족하면 Space로 진행할 수 있습니다. 실제 현장에서는 관객 얼굴에 약한 간접광을 댄 상태와 조명이 없는 상태를 각각 확인하세요.

관객 감지가 이어질 때 마감 장면까지 진행합니다. 프레임에서 떠나면 입력 누락을 잠시 완충한 뒤 뉴스로 복귀합니다. 결말은 관객이 화면에 남아 있어도 한 회차에 한 번만 나오며 암전이 끝날 때 사진 캔버스를 비웁니다. 프레임과 사진 합성은 탭 메모리에서만 이루어지며, 디스크에는 거리, 음량, 장치 선택 등 운영 설정을 저장합니다.

입구 문구 예시

> 창작 공포 전시입니다. 동명대학교는 작품의 공간 배경으로 재구성되었으며, 화면의 방송과 실종 사건은 허구입니다. 얼굴 삽입 운영 중에는 카메라 영상에서 잘라낸 얼굴이 작품 화면에 잠시 표시되며 기기 밖으로 전송되지 않습니다.

## 소스와 배포

- `anchor-plate.png`와 `news.wav`로 뉴스가 구성됩니다. 앵커는 AI로 만든 이미지에 음성에 맞춘 입 모양과 깜빡임을 합성했습니다. 음성은 수정된 동명 뉴스 대본을 Microsoft Heami Desktop으로 읽어 만든 62.14초 WAV입니다. 방송 신호음, 테이프 간섭, 얼굴 돌진의 저음과 파열음은 브라우저에서 합성합니다.
- `campus.jpg`는 사용자가 제공한 동명대학교 본관 사진의 형태를 기준으로 다시 그린 전경입니다. 복도는 캠퍼스를 배경으로 재구성한 가상 공간입니다. 밤 사진은 낮 사진을 편집해 원근과 구조를 맞췄습니다.
- `sample-portrait.jpg`는 데모와 대체용으로 생성한 가상 성인 인물입니다. Galmuri11 서체 라이선스는 글꼴과 함께 포함되어 있습니다. MediaPipe 모델·런타임과 라이선스는 기존 공유 경로를 사용합니다.
- 새 폴더와 제작 도구를 저장소에 추가하면 기존 Pages 워크플로가 `site/` 아래에 게시합니다. 운영실에서 고른 대체 사진은 공개 저장소로 복사되지 않습니다.
- 참고 쇼츠에서 확인한 옅은 가로 주사선, 거의 흑백인 공지, 어두운 복도의 대비를 시각 기준으로 삼았습니다. 동명 표식과 안내 카드 일러스트, 자막, 음성, 잡음은 이 작품용입니다. [실종 공지 쇼츠](https://www.youtube.com/shorts/eLsvqRGtzyQ) · [동명대학교 캠퍼스맵](https://toonani.tu.ac.kr/tuhome/sub01_05_02.do) · [갈무리 서체](https://github.com/quiple/galmuri)
- `hall-close.webp`는 가상 복도 인물의 AI 근접 컷입니다. 이미지 생성 도구에 기존 `hall-night.jpg`를 참조로 주고 아래 프롬프트로 제작했습니다. 960×720 WebP로 포함했고 렌즈 돌진과 테이프 화면 밀림은 CSS로 재생됩니다.

<details><summary>근접 컷 이미지 생성 프롬프트</summary>

Create a NEW single fictional photorealistic horror film insert using the referenced existing shot to match the exact fictional woman, muted ivory worn Korean hanbok, black hair and green tinted Korean school corridor. Extant photo is for identity, setting and continuity reference. Output a horizontal frame for a 4:3 analog television. The same adult woman is suddenly less than one foot from the security camera, her head now lifted, staring intensely and directly into the lens. Head and upper shoulders close-up, both eyes precisely in camera, dark irises and unnaturally still expression, lips closed and dry, loose wisps cross one cheek, textured skin, a little shadow under the eyes. Face fills most of the height, eyes about 44 percent down. Very slight asymmetry and real camera noise. Subtle sickly green light from the original practical fluorescent source; negative space and barely discernible matching doors and corridor behind her, blackish, allowing a single unsettling contrast cut from the reference wide shot. Photoreal analog horror, oppressive and intimate, detailed skin and cloth, one strongly readable face in a real dark shot, no glam makeup, no screaming mouth, no exaggerated monster prosthetics, no glowing eyes, no gore, no other people, no text, no logos, no interface, no CRT overlay.

</details>

### 실사 영상 교체 사양

대본은 `site/works/forbidden-broadcast/exhibit/program.json`에 있습니다. 고정 카메라로 4:3 안전영역을 잡고 같은 배우와 의상, 조명, 카메라 구도를 유지합니다. 1440×1080 이상, 29.97 또는 30fps, H.264 MP4 또는 WebM, 별도 자막·로고·스캔라인 없이 촬영합니다. 찍은 테이크에서 한국어 음성을 분리해 WAV와 편성 시간을 함께 교체하고 `assets/news.json`의 `video` 값에 `assets/anchor-live.mp4` 같은 상대 경로를 지정합니다. 마스터의 영상과 음성 길이는 같아야 합니다. 현장에서는 62초를 다 보는 것보다 반복 경계에서 호흡과 잔향이 자연스럽게 이어지는지가 중요합니다.

## 확인 범위

실제 내장 웹캠(960×540)으로 준비판의 얼굴 감지, 관객 사진이 공지와 복도에 삽입되는 동작, 렌즈 가림 뒤 뉴스 복귀와 사진 삭제, 어깨 감지 후 대체 사진, Space 수동 송출을 확인했습니다. 이 PC에서 첫 안내 카드를 추가하기 전 시연에 사용한 임시값은 먼 점 0.055, 가까운 점 0.103이었습니다. 먼 점은 공간 제한으로 실제 전시장 위치에서 측정하지 못했습니다.

새 카드와 결말을 반영한 최종판은 Chrome 수동 시연과 창작 인물로 구성한 가상 카메라 입력으로 확인했습니다. 가상 입력에서 첫 카드가 167~308ms에 관측됐고, 한 회차의 실종 공지는 입력 프레임 기준 1,267ms에 표시됐습니다. 가까운 피사체 사진을 복도에 유지한 뒤 새 애니메이션·암전·사진 삭제·뉴스 복귀와 Space 수동 송출을 확인했습니다. 실제 전시의 두 사람 동시 접근, 현장 스피커 음량, CRT 출력 및 장시간 운영은 설치 후 확인할 항목입니다.
