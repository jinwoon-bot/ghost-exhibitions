# 출처와 사용 범위

- MediaPipe Tasks Vision **1.2.3**, Pose Landmarker Lite float16 모델. 공식 저장소 https://github.com/google-ai-edge/mediapipe . Web 문서 https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js . Apache-2.0 원문은 licenses. 모델·WASM의 버전/다운로드 정보 licenses/models-and-vendor.json, 실제 사용 파일 전체 SHA-256은 ASSET_HASHES.json. 이 작품은 Face 모델을 포함하거나 요청하지 않습니다.
- assets/demo/pose_1.mp4: TensorFlow Models 공식 Pose Detection 테스트 영상. https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/test_data/pose_1.mp4 . Apache-2.0 사본 licenses/tfjs-models-APACHE-2.0.txt. 공개 촬영 샘플이며 현재 관객/실제 카메라 시험으로 표시하지 않습니다. 모의 행동은 별도 표시합니다.
- assets/news/*.webp: 사용자 요청으로 내장 image_gen에서 생성한 가상의 취재 사진 3장. 실촬영·실제 보도 아님. docs/ART_PROMPTS.md에 프롬프트/변환/보존 위치. 모든 인물·사건·지명은 허구이며 이 사진을 역사 자료로 재배포하지 않습니다.
- assets/ghosts/*.webm: 기존 사용자 손각시·몽달귀신 전시의 가상 Google Flow/Veo 몽달 원본을 사용한 두 영상. 실촬영 배우 아님. 기존 작품의 동일 SHA-256 파일을 재사용하며 Veo 표시 보존. 새 외부 생성·유료 크레딧을 사용하지 않았습니다. Apache/CC0처럼 별도 권리를 부여하지 않습니다.
- 방송 문구/프로그램/지도/송출 일지/노이즈/전기 공기음은 이번 작품 코드로 자체 제작. 실제 방송 로고·음악·뉴스 영상·서체 파일을 복사하지 않습니다. 글꼴은 기기 시스템 한글 글꼴 사용.
- BroadcastExhibition.exe: tools/BroadcastExhibition.cs 자체 정적 서버를 Windows 공식 .NET Framework 컴파일러로 빌드. 127.0.0.1만 바인딩. 마이크/카메라 업로드 API 없음. Node·Python·FFmpeg·Chrome 바이너리 재배포 없음.
- LOCAL58/Ghostwatch/WNUF/The Mandela Catalogue/KBS Archive는 연구 링크로만 사용. 작품 영상·스크린샷·음원을 런타임에 포함하지 않습니다. 참고 확인 범위와 차용하지 않은 요소는 docs/VISUAL_REFERENCES.md.

실제 관객의 카메라 프레임·랜드마크·마스크는 메모리에만 있습니다. 수치 검수와 공식 샘플/가상 이미지 장면만 개발자 로컬 docs/qa에 남겼으며 공개 패키지에서 제외합니다. 브라우저 개발자 도구 및 화면 녹화를 별도로 켜면 그 운영자가 책임지고 촬영 동의를 관리해야 합니다.
