# 브랜치 통합 검증 — 2026-11-09

## 비교 기준

원격 브랜치를 다시 fetch하고 최신 `main`에서 `integration/all-features-20261109`를 생성했습니다. 아래 SHA는 비교 당시 원격 HEAD입니다. 기존 작업 브랜치는 삭제하거나 변경하지 않습니다.

| 브랜치 | HEAD | main에 없는 커밋 | 처리 |
| --- | --- | --- | --- |
| main | `604cb7a518da83184754d1b68c2ed95bd9da9766` | — | 통합 기준 |
| feat/instagram-storyboard | `f9d4e778774cfa6202b332acf835d709e82d5972` | 0 | PR #2로 이미 포함; 재적용하지 않음 |
| feat/pencil-paper-guides | `67aaf27ba84479129d9f98729e7e6038892a1ef1` | 0 | PR #3으로 이미 포함; 재적용하지 않음 |
| feat/mini-paint-v1 | `ac81f7994ad5f16a9d61838544e87a8eaa52a73c` | 1 | 남은 커밋을 merge |

누락된 커밋은 `ac81f79`(보기 좌우 반전, 래스터 레이어 도구, 스포이트, 테스트 반복량 축소)입니다. UI·프리셋·PSD 변경은 PR #4로 이미 main에 있습니다.

## 병합 및 충돌

`git merge --no-ff origin/feat/mini-paint-v1` 방식으로 이력을 보존합니다. main이 해당 브랜치의 조상이므로 파일 충돌은 없었습니다. 어느 한쪽 파일로 덮어쓰거나 기존 기능을 제거하지 않았습니다. `src/`, 의존성, 빌드 설정의 최종 내용은 `ac81f79`와 동일합니다. 새 기능과 UI 재설계는 없습니다.

통합 과정의 추가 변경은 이 기록과 `tests/paint.spec.ts`의 자동 복구 검증 보강입니다. 기존 자동 복구 검사가 최초 전체 실행에서 1회 실패(복구 후 기대 픽셀이 투명)했고, 원본 테스트 단독 재실행에서는 통과했습니다. 원인이 확정됐거나 엔진 결함을 수정했다고 주장하지 않습니다. 입력 직후 픽셀, 커밋된 IndexedDB 레코드의 디코딩 결과, 복구 성공 알림과 비동기 복구 완료 후 픽셀을 각각 확인하도록 보강했습니다. 실패를 재시도 설정으로 숨기거나 저장·복구 검사를 생략하지 않았습니다.

## 기능 보존 확인

| 기능 | 관련 회귀 검사 |
| --- | --- |
| 펜·연필·진한 연필·지우개, 짧은 입력, 확대 좌표 | paint, pencil-guides |
| 레이어 관리·픽셀 격리·복제·이동·실제 좌우 반전 | paint, editing |
| 보기 좌우 반전·스포이트·반전 중 입력 좌표 | editing |
| 격자·줄노트·점 가이드, PNG 제외, 컷별 설정 | pencil-guides, integration |
| 다중 컷·독립 히스토리·비활성 Canvas 해제 | storyboard, integration |
| A4/A5·인스타툰·사용자 지정·방향·px/mm/DPI | productivity, storyboard |
| 슬라이더 숫자 입력·입력 중 단축키 보호 | productivity, paint |
| 브러시·작업 프리셋, 브라우저 보관·JSON | productivity |
| PSD 별도 레이어·이름·순서·숨김·불투명도·투명·합성 픽셀 | productivity |
| Ctrl+Z/Ctrl+Y·새 분기·취소·오류 후 복구 | paint, editing, storyboard |
| 프로젝트 파일 저장·자동 저장·새로고침 복구·용량 오류 | paint, storyboard, pencil-guides |
| 원본 HTML JSON·mpaint v1·v2·DPI/가이드 기본값 | paint, productivity, storyboard, integration |

반복량은 점/작은 원 25회, Undo/Redo 8회, 레이어 5개를 유지합니다. 포맷 호환성의 작은 50레이어 파일 검사와 비활성 컷 해제에 필요한 최소 4컷 검사는 유지합니다.

## 실행 결과

- 추가 편집 기능 관련 테스트: 7개 통과.
- `npm run build`: TypeScript 검사, Vite 빌드, 서비스 워커 생성 통과. 이후 애플리케이션 코드는 바뀌지 않아 빌드는 중복 실행하지 않았습니다.
- 최초 전체 회귀: 48개 통과 / 자동 복구 1개 실패. 위에 실패와 보강 내용을 기록했습니다.
- 자동 복구 검증 보강 후 관련 테스트: 1개 통과.
- 보강 후 최종 `npm test -- --reporter=line`: **49개 모두 통과**, 약 1.3분, 실패/자동 재시도 0개. 필수 저장·복구, 파일 호환성, PSD 정확성 검사를 포함합니다. 첫 실패 조사와 테스트 보강에 따른 전체 재실행 1회 외에는 전체 테스트를 중복 실행하지 않았습니다.

Linux Chromium 자동화 결과입니다. Windows 브라우저·실제 타블렛 및 Photoshop에서 새로 수동 검증한 결과는 아닙니다. PSD 생성·재파싱·전체 합성 픽셀 비교는 자동화에 포함됩니다.
