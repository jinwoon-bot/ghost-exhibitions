# 출처·배포 안내

## MediaPipe Tasks Vision

- `@mediapipe/tasks-vision` **1.2.3** 공식 npm 배포의 브라우저 번들 및 WASM. Apache-2.0 원문: `licenses/mediapipe-APACHE-2.0.txt`.
- 공식 저장소 https://github.com/google-ai-edge/mediapipe
- https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web
- https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web
- Pose Lite·Face 모델의 공식 다운로드 URL·SHA-256은 `licenses/models-and-vendor.json`. 파일은 수정하지 않았습니다. 두 모델의 Google 모델 카드에 Apache-2.0 명시. 전체 런타임 파일 해시는 `ASSET_HASHES.json`.

## 샘플 입력

`assets/demo/pose_1.mp4`: TensorFlow Models의 공식 pose-detection 테스트 영상. https://github.com/tensorflow/tfjs-models/blob/master/pose-detection/test_data/pose_1.mp4 . 저장소 Apache-2.0 출처, 원본 라이선스 사본 `licenses/tfjs-models-APACHE-2.0.txt`. 실제로 촬영된 공개 샘플이며 이 작품의 실제 관객·카메라 검증이라고 표시하지 않습니다. dark.mp4는 저조도 파생, multi.mp4는 한 인물을 세 번 배치한 비율 보존 파생 영상입니다. 서로 다른 세 관객의 촬영이 아닙니다.

## 가상 귀신 영상

사용자의 기존 손각시·몽달귀신 프로젝트에서 제작한 Google Flow/Veo 가상 몽달귀신. 한국 단령·사모의 실사풍 영상이며 실제 배우의 촬영이 아닙니다. 기존 V11의 RGB+알파 OGV 원본에서 제작 단계 변환한 두 WebM을 재사용합니다. Veo 표시는 자르거나 제거하지 않았습니다. 새 유료 API·생성 크레딧은 쓰지 않았습니다. 이 영상에 Apache/CC0 같은 제3자 라이선스를 새로 부여하지 않습니다. 원본·변환 방법: `docs/ASSETS.md`, `tools/convert-ghosts.mjs`.

## 참고 작품

Pulse, Tall Ships, Shutter, Ringu, Eye Contact는 연구용 링크/분석에만 사용합니다. 해당 영화·전시의 이미지·영상·음악은 배포 런타임에 포함하지 않습니다. 출처와 실제 확인 범위는 `docs/VISUAL_REFERENCES.md`.

## 자체 제작

TV 프레임·미세 노이즈·공간음은 코드로 제작했습니다. 외부 글꼴·추적 서비스·음원·분석 API는 없습니다. 기존 작품의 API 키나 서버 설정을 포함하지 않습니다.

오프라인 실행기는 자체 C# 소스 `tools/ScreenExhibition.cs`를 이 Windows의 Microsoft .NET Framework 공식 컴파일러로 빌드한 약12KB 서버입니다. 127.0.0.1 정적 GET/HEAD·영상 Range만 제공하며 원본 영상 업로드/API는 없습니다. Windows 기본 .NET Framework를 사용합니다. Node 바이너리·FFmpeg는 재배포하지 않습니다. 개발용 server.mjs/변환 스크립트를 실행할 때만 개발자가 해당 도구를 별도로 사용합니다.
