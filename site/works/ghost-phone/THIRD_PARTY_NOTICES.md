# 출처와 에셋

- 전화기 SVG, 배경/종이 노이즈 CSS, 벨/통화 톤, decoder-probe 시험 신호: 이 프로젝트에서 절차적으로 제작. 외부 사진/타인의 음원/배우 목소리 복제 없음.
- 귀신3종의 대사와 연기 메모: 전시용 창작. 민속 고증 원문이나 실제 귀신의 음성이라고 주장하지 않음.
- 브라우저 내장 speechSynthesis: 해당 운영체제/브라우저 공급자 음성. 지원/네트워크/사용권을 설치PC에서 확인.
- ElevenLabs API: 실제 공급자 키·목소리 ID는 포함하지 않음. 서버 코드는 공식 문서에 맞춘 연동이며 서비스 요금/목소리 권리는 별도.
- Windows 오프라인 패키지의 Node.js: 공식 배포 실행기. 출처/해시/Node LICENSE는 패키지 runtime에 동봉. 웹사이트에는 Node 바이너리를 배포하지 않음.
- 테스트 신호의 MP3 인코딩에 기존 개발 도구 ffmpeg-static을 사용. ffmpeg는 배포 패키지나 웹사이트에 포함하지 않음. 자체 생성 오디오에 별도 제3자 원음 없음.

공식 기술문서 링크는 docs/AI_SETUP.md와 docs/HARDWARE.md에 기록. 운영자 음원과 커스텀 목소리의 권리는 운영자가 별도로 확인해야 함.

## CC0 background recordings (V3 production)
Six source field recordings from Freesound are used in edited background soundscapes under CC0 1.0. The source creators, page URLs, public HQ MP3 URLs, changes and hashes are recorded in assets/soundscapes/SOURCES.json and docs/voices/SOUNDSCAPE_CREDITS.md. Mixkit was reviewed but not adopted for the source-distributed backgrounds. No new sound library code or model was installed. Existing ElevenLabs voice material retains its separate conditions and is not covered by the backgrounds' CC0 status.
