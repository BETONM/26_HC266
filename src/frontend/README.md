# ChemBot Lab UI

로봇 화학 실험 스테이션의 챗봇 중심 웹 UI. 대화로 실험을 구성하면 채팅 옆 그래프 카드가 갱신되고, 확정한 구성으로 실행 계획 → 실시간 모니터링 → 결과 보고서까지 이어진다.

공통 맥락과 규칙은 [`AGENTS.md`](AGENTS.md), 단계별 작업 지시는 [`rebuild-prompts/`](rebuild-prompts/)에 있다.

## 실행

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # lint → 타입 검사 → 테스트 → 빌드
```

| 스크립트 | 하는 일 |
| --- | --- |
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 타입 검사 후 `dist/`로 빌드 |
| `npm run lint` | oxlint (react, typescript, jsx-a11y, vitest 규칙) |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm test` | Vitest 단위 테스트 |
| `npm run format` | Prettier |
| `npm run screenshot` | 화면 확인용 스크린샷(라이트/다크 × 390/1440px). 아래 '디자인 리뷰' 참고 |

## 폴더 구조

```text
src/
  config.ts              어댑터 mock/http 선택과 서버 주소. env를 읽는 유일한 곳
  graph/
    model.ts             그래프 타입(Neo4j property graph 모양), 라벨별 속성 타입과 타입 가드
    parse.ts             느슨한 원본 → 검증된 스냅샷. 어긋난 항목만 버리고 경고
    ops.ts               병합(추가·변경 id 반환), n-hop 이웃, 라벨·속성·글자 필터
  adapters/
    index.ts             어댑터 조립. 화면은 여기서 인터페이스 값만 가져간다
    faults.ts            목업 공통 지연·실패 주입
    graph/               GraphSource 인터페이스, 목업(메모리 + 시드), http(자리만)
    chat/                ChatProvider 인터페이스, 목업(mock/: 의도 분류·이름 맞추기·답 생성·실행 계획 만들기와 고치기), http(SSE)
    device/              DeviceSource 인터페이스·타입(이전 deviceApi.ts), http(경로 그대로), RealSense 브라우저 카메라,
                         목업(mock/: 실측 곡선 센서, canvas 열화상·카메라 셋 영상, 메모리 ROI)
    run/                 RunSource 인터페이스, 목업(타이머로 동작을 하나씩), http(자리만)
    report/              ReportSource 인터페이스, 목업(이번 실행 기록에서 만든 보고서 + 예시 fixture), http(GET /runs/{id}/report)
  chat/
    types.ts             ChatEvent, ChatRequest, 작업 단계
    events.ts            서버 이벤트 검증, 한 응답의 graph 이벤트를 한 번에 반영(applyGraphEvents)
    sse.ts               SSE 파서
    ui/                  입력창(IME 처리), 대화 기록, 예시 질문
  domain/draft.ts        실험 초안: 템플릿 → 초안, 초안 그래프 만들기·되읽기, 재고·위험 점검
  domain/confirm.ts      구성 확정 검증(재고 차단, high·critical 위험 확인), 스냅샷 id
  domain/plan.ts         실행 계획 모델(묶음 → 동작, 버전 기록), 전체 순번·진행 위치, 버전 사이 바뀐 동작, 서버 응답 검증
  domain/run.ts          실행 상태·실행 기록(표본·이벤트), 진행 표시 창(planWindowStart)
  domain/report.ts       보고서 모델(RunReport)과 순수 함수: mm:ss, 시간축 눈금, 축, 정규화, 차트 aria 문장, CSV, 채팅용 요약
  domain/reportFromRun.ts 실행 기록 → 보고서. 재료는 확정 그래프에서, 절차는 실행한 계획에서
  device/feed.ts         장비 피드 규칙: 응답 뒤 예약하는 폴링, health·센서·열화상 따로 반영, 대표값, ROI 좌표, 장치 상태 판정
  monitoring/            모니터링 관제 화면(머리·지금과 장치·카메라 셋·센서·계획 진행·위험·장비 로그), 열화상 대화상자, 장비 피드(LiveFeed)
  graph/canvas/          그래프 그림: GraphCanvas(React) + engine(명령형) + layout(살아 있는 d3-force)
                         + declutter(보이는 그래프로 줄이는 규칙)·cull(이름표 겹침)·viewport·nav(순수 함수)
  report/                결과 보고서 화면(목차·요약·KPI·재료·반응식·절차·센서 차트·색 변화·에이전트 판단·타임라인·실행 로그),
                         visx 차트(탭 차트·인쇄용 겹침 차트), 인쇄 스타일
  hazard/                위험 심각도 배지와 요약(모양 + 글자 + 채움 무게)
  workspace/             작업 영역: 레일(단계), 그래프 카드, 요약 열(SidePanel), 노드 상세, 목록 보기, 구성 확정 대화상자,
                         실행 계획 카드(PlanStage), 실행 시작 대화상자(RunDialog)
  app/                   화면 셸(카드 배치), 상태(Zustand), 대화·실행 컨트롤러, 뒤로가기, 안전한 저장소, 설정 경고
  styles/                tokens.css(디자인 토큰), base.css, fonts.css(화학식 첨자 보충)
  assets/fonts/          Pretendard 첨자 서브셋과 라이선스
proposals/               3단계 뒤 디자인 시안 A~F(독립 페이지, 앱 빌드에 들어가지 않는다). '디자인 시안' 참고
scripts/screenshot.mjs   리뷰용 스크린샷
.claude/agents/apple-design-reviewer.md   5단계까지 쓴 디자인 리뷰 서브에이전트(6단계부터 쓰지 않는다)
```

## 기술 스택

| 영역 | 선택 | 이유 |
| --- | --- | --- |
| 언어·UI | React 19 + TypeScript | 고정. 옮겨 오는 장비 훅이 React 훅이다 |
| 번들러 | Vite 8 | 이전 레포와 같은 도구라 훅 이전이 매끄럽고, `import.meta.env`로 어댑터 전환을 읽는다. Vitest와 설정을 공유한다 |
| 라우팅 | 없음 | 화면이 사실상 하나(첫 화면 ↔ 작업 화면)라 라우터가 줄 것이 적다. 라우트 전환으로 그래프가 다시 마운트될 위험도 없앤다. 뒤로가기는 2단계에서 `history.pushState`/`popstate`로 연동한다 |
| 상태 관리 | Zustand 5 | 작고, 어댑터·그래프 엔진처럼 React 밖에서도 읽고 쓸 수 있다. persist에 저장소 실패 시 메모리 대체를 끼우기 쉽다 |
| 테스트 | Vitest 5 | Vite 설정을 그대로 쓴다. 도메인 로직은 순수 함수 + 단위 테스트 |
| lint·포맷 | oxlint + Prettier | 이전 레포에서 쓰던 oxlint. `jsx-a11y` 플러그인을 켰다 |
| 글꼴 | Pretendard Variable (자체 호스팅) | '디자인 토큰' 참고 |
| UI 컴포넌트 | React Aria Components | 스타일 없는 접근성 컴포넌트(탭, 토글 그룹, 툴팁, 버튼). 키보드·스크린 리더·포커스 관리가 가장 철저하고, `data-*` 상태 속성으로 토큰 CSS를 입히기 쉽다. Radix보다 번들이 큰 것은 감수했다 |
| 스크린샷 | Playwright | 단계별 화면 캡처와 동작 점검(`.review/stage-N/capture.mjs`) |
| 그래프 렌더러 | SVG 직접 + d3-force(계산만) | 원본 시안의 Graph 클래스 방식. 위험 무게 사다리·보관 위치 웅덩이(SVG 필터)·이름표 겹침 처리·카드로 잘라 보이는 진입 전환을 정확히 다룰 수 있다. 수백 노드까지 SVG로 충분하다. React Flow(줌·키보드 내장, 번들 큼)와 Cytoscape(캔버스, 접근성 직접 구현)를 비교했다 |

| 차트 | visx 4 (`@visx/scale`·`shape`·`axis`·`group`) | 6단계에서 SVG 직접·visx·Recharts를 비교해 사용자가 visx를 골랐다. 스케일·축·선/면 생성기만 빌리고 모양은 직접 그려서, 보정 구간 음영·사건선·기준선·인쇄용 정규화 겹침·흑백용 점선을 정확히 다루고 색은 CSS 토큰으로 준다. Recharts는 내장 기능이 많지만 마크업·aria를 세밀하게 다루기 어렵고 번들이 크다 |

## 그래프 데이터 모델

Neo4j HTTP API의 graph 결과와 같은 모양이다. `parseGraph`는 스냅샷 모양과 Neo4j 응답(`results[].data[].graph`) 둘 다 받는다.

```ts
type GraphNode = {id: string; labels: NodeLabel[]; properties: Record<string, unknown>};
type GraphRelationship = {id: string; type: RelationshipType; startNode: string; endNode: string; properties: Record<string, unknown>};
type GraphSnapshot = {nodes: GraphNode[]; relationships: GraphRelationship[]; source?: 'mock' | 'live'};
```

| 라벨 | 뜻 | 주요 속성 |
| --- | --- | --- |
| `Experiment` | 실험 템플릿(`kind: 'template'`) 또는 구성 중 초안(`'draft'`) | name, shortName(그래프 이름표), description, duration, temperature, formula, observation |
| `Chemical` | 시약·용액 (인벤토리) | name, english, formula, cas, phase, concentration, quantity, unit, lot, expiresAt, status(available·low·expired) |
| `Equipment` | 기구 (인벤토리) | name, spec, quantity, status |
| `Device` | 센서·카메라·로봇팔·레일 | name, kind, model, connection(5단계 장비 API가 채움) |
| `Location` | 보관 위치 | name, description |
| `Hazard` | 위험. GHS에 묶지 않는다 | title, shortName(그래프 이름표), description, severity(low·medium·high·critical), mitigation |
| `Product` | 생성물·부산물·중간 생성물 | name, formula, kind(product·byproduct·intermediate) |

| 관계 | 방향 | 속성 |
| --- | --- | --- |
| `USES` | Experiment → Chemical | amount, unit, role(reactant·indicator·solvent·titrant·analyte) |
| `REQUIRES` | Experiment → Equipment·Device | quantity, purpose |
| `STORED_AT` | Chemical·Equipment → Location | |
| `HAS_HAZARD` | Chemical·Equipment·Experiment → Hazard | 물질 자체의 위험 |
| `REACTS_WITH` | Chemical ↔ Chemical | condition, formula, step, title |
| `PRODUCES` | Experiment·Chemical → Product | |
| `CAUSES` | Chemical·Product → Hazard | condition. 두 시약이 섞여 생기는 위험은 양쪽에서 같은 Hazard로 잇는다 |

초안에서 바꾼 것:

- `UsageRole`에 `titrant`(적정액)·`analyte`(분석 시료)를 더했다. 산–염기 적정 템플릿에서 시약의 역할이 반응물·지시약·용매로 나뉘지 않는다.
- `Product.kind`에 `intermediate`를 더했다. 색 변화 실험의 요오드화 이온·요오드는 최종 생성물이 아니지만 위험(요오드 착색)의 출발점이다.
- 반응 2·3처럼 중간 생성물이 참여하는 반응은 별도 `Reaction` 라벨을 만들지 않고 출발 시약 쌍의 `REACTS_WITH` 속성(step, formula)에 단다. 라벨을 늘리면 그래프가 복잡해지는 데 비해 지금 화면에서 얻는 것이 적다.

### 목업 시드 (`src/adapters/graph/seed.ts`)

이전 레포(`hanium-ui@8e23068`)의 `reagentPresets` 6종, `reagentSheet`, `reactionSteps`, `experiments` 3종을 옮겼다. 여기에 산–염기 적정 템플릿과 조합 위험을 위해 염산·수산화 나트륨·페놀프탈레인을 더했다.

- 재고 부족: 탄산 나트륨 15 mL(앙금 실험 한 번에 25 mL 필요)
- 만료: 페놀프탈레인 지시약(2026-08-31)
- 조합 위험: 아황산 수소 나트륨 + 염산 → 이산화황(`critical`), 요오드산 칼륨 + 녹말(가연물) → 화재(`high`)

## 어댑터와 mock/http 전환

외부 의존(그래프 DB, LLM, 장비, 로봇 실행, 실행 기록)은 모두 인터페이스 뒤에 있고 기본은 목업이다. 화면은 `src/adapters/index.ts`가 내보내는 인터페이스 값만 쓴다.

`.env.local`에 적는다(`VITE_` 값은 브라우저 번들에 들어가므로 **비밀 키를 넣지 않는다**).

| 변수 | 값 | 뜻 |
| --- | --- | --- |
| `VITE_GRAPH_SOURCE` | `mock`(기본) · `http` | 그래프 어댑터 선택. `CHAT`·`DEVICE`·`RUN`·`REPORT`도 같은 꼴 |
| `VITE_GRAPH_API_URL` | URL | http 구현의 기본 주소 |
| `VITE_MOCK_LATENCY_MS` | 숫자 | 모든 목업 호출 앞의 지연 |
| `VITE_MOCK_FAIL_EVERY` | 숫자 | n번째 호출마다 실패(1이면 매번). 결정적이다 |
| `VITE_MOCK_DISCONNECT_EVERY` | 숫자 | 스트림을 주는 목업(채팅)이 n번째 호출마다 `done` 없이 중간에 끊긴다 |
| `VITE_GRAPH_MOCK_LATENCY_MS`, `..._MOCK_FAIL_EVERY`, `..._MOCK_DISCONNECT_EVERY` | 숫자 | 어댑터별로 위 공통값을 덮어쓴다(`VITE_CHAT_…`도 같다) |
| `VITE_CHAT_MOCK_CHAR_DELAY_MS` | 숫자(기본 12) | 목업 답을 흘려보내는 속도. 글자 2개마다 쉬는 시간 |
| `VITE_DEVICE_RGB_SOURCE` | `browser`(기본) · `mjpeg` | 장비가 http일 때 탑뷰 카메라(RealSense)를 브라우저가 직접 열지, 장비 서버 `/camera/stream`을 받을지 |
| `VITE_DEVICE_MOCK_OFFLINE` | 예: `thermal:error,left-camera:off` | 목업 장치 꺼짐·오류. 장치는 `sensors`·`thermal`·`camera`(탑뷰)·`left-camera`·`right-camera`(팔 카메라)·`rail`·`arm` |
| `VITE_DEVICE_MOCK_STALE` | `1` | 목업 센서가 마지막 값에 멈추고 '오래된 데이터'로 표시된다 |
| `VITE_RUN_MOCK_STEP_MS` | 숫자(기본 3000) | 목업 로봇이 동작 하나에 쓰는 시간 |

예: 오류 화면을 보려면 `VITE_CHAT_MOCK_FAIL_EVERY=2 npm run dev`(두 번째 질문마다 실패), 연결 끊김은 `VITE_CHAT_MOCK_DISCONNECT_EVERY=1 npm run dev`. 장비 쪽은 `VITE_DEVICE_MOCK_DISCONNECT_EVERY=3`(세 번째 요청마다 네트워크 실패), `VITE_DEVICE_MOCK_OFFLINE=thermal:error`, `VITE_DEVICE_MOCK_STALE=1`.

잘못된 값은 조용히 목업으로 돌리지 않고 화면에 설정 경고로 보인다. 실제 장비에 붙었다고 믿었는데 목업이 돌고 있으면 실험 직전에 위험하다.

### 어댑터별 mock/http

| 어댑터 | mock(기본) | http | 켜는 법 |
| --- | --- | --- | --- |
| 그래프 `GraphSource` | 메모리 그래프 + 시드 | `HttpGraphSource` 자리만(부르면 '연결되지 않았습니다') | `VITE_GRAPH_SOURCE=http`, `VITE_GRAPH_API_URL` |
| LLM `ChatProvider` | 키워드 의도 분류 + 그래프 조회 + 계획·실행·보고서 답 | `HttpChatProvider` 구현됨(`POST /chat`, SSE) | `VITE_CHAT_SOURCE=http`, `VITE_CHAT_API_URL` |
| 장비 `DeviceSource` | 실측 곡선 센서, canvas 열화상·카메라 셋, 메모리 ROI | `HttpDeviceSource` 구현됨(이전 장비 API). 팔 카메라·장비 비상 정지는 아직 없다 | `VITE_DEVICE_SOURCE=http`, `VITE_DEVICE_API_URL`, `VITE_DEVICE_RGB_SOURCE` |
| 로봇 실행 `RunSource` | 타이머로 동작을 하나씩, E-STOP은 기록만 | `HttpRunSource` 자리만 | `VITE_RUN_SOURCE=http`, `VITE_RUN_API_URL` |
| 보고서 `ReportSource` | 이번 실행 기록에서 만든 보고서 + 예시 fixture | `HttpReportSource` 구현됨(`GET /runs/{id}/report`). 예시 보기는 숨긴다 | `VITE_REPORT_SOURCE=http`, `VITE_REPORT_API_URL` |

목업 장비는 목업 로봇의 진행을 따라 값과 장면을 바꾼다. 로봇만 http로 바꾸면 장비 목업은 진행을 몰라 바탕값에 머문다. 한 화면·한 기록에 목업과 실측이 섞이지 않게 데이터마다 `source`를 달고, 화면은 출처를 글로 보인다.

## 채팅과 LLM 목업

### `ChatProvider`

`send(request, signal)`가 `ChatEvent` 스트림을 준다: `text-delta`, `status`('인벤토리 조회 중'), `graph`(`merge`·`replace`, `focus`), `plan`(버전 기록까지 담은 실행 계획 전체), `done`, `error`. `done` 없이 끝나면 화면은 '응답이 중간에 끊겼습니다'로 처리한다. `ChatRequest`에는 대화 이력과 상태(진행 단계, 실험 초안 그래프, 확정 그래프 id, 계획, 실행을 시작한 계획 버전, 텔레메트리, 띄운 보고서의 요약)가 실린다. 화면 조작이 시킨 요청에는 `action`이 붙는다(지금은 구성 확정 직후의 `'generate-plan'` 하나). 사용자가 같은 말을 직접 쳤을 때와 구분하기 위해서다.

http 구현(`HttpChatProvider`)은 `POST {VITE_CHAT_API_URL}/chat`에 `ChatRequest`를 JSON으로 보내고, 서버가 이벤트 하나를 `data: <ChatEvent JSON>` 한 줄로 SSE에 흘려보낸다고 가정한다. 모양이 틀린 줄은 건너뛴다. HTTP 오류는 본문의 `detail`/`error`를 보여 준다.

### 목업 (`src/adapters/chat/mock/`)

- **의도 분류**(`intent.ts`, 순수 함수): 계획 수정 > 보고서 질문(보고서를 띄웠을 때: 요약·이유) > 실행 중 질문(진행·센서 값) > 초안 수정(추가·빼기·양 바꾸기) > 실험 구성 > 위험 > 실험 탐색 > 인벤토리 > 알아듣지 못함. 상태를 바꾸는 의도일수록 조건을 좁게 잡았다. 애매하면 '알아듣지 못함'으로 떨어져 그래프를 바꾸지 않는다. 계획이 생긴 뒤의 '빼 줘', '뒤로' 같은 말은 기구 이름이 들어 있어도 계획 수정으로 읽는다(구성은 이미 확정되어 바꿀 수 없다).
- **이름 맞추기**(`names.ts`): '요오드산 칼륨', 'KIO3', '아황산수소나트륨'처럼 줄이거나 붙여 써도 노드를 찾는다. 긴 이름이 먼저 자리를 차지한다.
- **답**(`respond.ts`): 인벤토리·위험·템플릿은 `GraphSource`를 실제로 조회한다. 시드를 바꾸면 답도 바뀐다(테스트로 확인). 실험 구성은 초안 서브그래프를 `graph` 이벤트(`replace`)로 내고 `saveDraft`로 저장한다. 재고 부족·미보유·만료를 답에서 짚는다.
- 같은 입력에는 같은 출력. 글자 단위로 흘려보내고 `AbortSignal`로 끊긴다.

### 화면

- 첫 화면(`landing`)과 작업 화면(`workspace`)은 **같은 카드들**의 자리만 바꾼다. 그래프와 입력창은 화면이 바뀌어도 다시 마운트되지 않는다. 입력창은 히어로 아래쪽 가운데에서 채팅 카드 아래로 미끄러져 내려앉는다(FLIP). 첫 화면에서 보낸 질문이 대화의 첫 메시지가 된다.
- 응답의 `graph` 이벤트는 `done` 때 한 번에 반영하고, 실패·중단한 응답의 변경은 버린다(`applyGraphEvents`). 초안을 품은 이벤트는 초안으로, 나머지는 조회 결과로 간다.
- 입력: Enter 보내기, Shift+Enter 줄바꿈, **한글 IME 조합 중 Enter 무시**(`isComposing`, Safari용 keyCode 229).
- 대화 기록은 새 메시지를 따라 내려가되, 위로 올려 읽고 있으면 끌어내리지 않고 '새 메시지 보기'를 띄운다. 스크린 리더에는 흘러드는 글자가 아니라 상태 변화만 알린다.
- 대화와 초안은 localStorage에 남는다(`chembot.session.v1`). 저장이 막히면 그 탭의 메모리로 옮겨 간다. 저장된 대화가 있으면 바로 작업 화면이 열리고, 뒤로가기로 첫 화면에 간다. '새 대화'는 첫 화면으로 가며 '이전 대화로 되돌리기'를 준다.
- 작업 단계는 왼쪽 레일(세로 탭): 그래프 · 실행 계획 · 모니터링 · 보고서. 잠긴 단계는 자물쇠와 '(잠김)', 이유는 스크린 리더 설명으로 남긴다. 레일 맨 아래 '새 대화'. 좁은 폭에서는 레일이 위쪽 막대가 되고 '대화 | 작업 영역'을 오가며, 위험 요약은 양쪽에 남는다.

## 그래프 패널과 구성 확정

### 그래프를 '보이는 그래프'로 줄이기 (`declutter.ts`)

3단계 뒤 '글씨가 너무 많고 관계가 너무 복잡하다'는 피드백으로 바꿨다. 데이터(그래프 DB 스냅샷)는 그대로 두고 그리는 방식만 바꾼다.

- **보관 위치는 선이 아니라 묶음**이다. `STORED_AT` 선을 그리지 않고, 같은 위치의 노드 둘레를 둥근 웅덩이(SVG 블러 + 알파 자르기 필터)로 칠한다. `Location` 노드는 노드로 그리지 않고 묶음 이름이 된다.
- **장비는 '로봇 스테이션' 묶음 하나**로 모은다. 장비에는 보관 위치가 없지만 모든 실험이 함께 쓴다.
- **실험 → 같은 묶음의 기구·장비(`REQUIRES`) 여러 개는 묶음으로 가는 점선 하나**로 합친다. 낱낱의 선은 그 노드를 가리킬 때만 보인다. 시약이 직접 만드는 생성물(`PRODUCES`)도 같다. 시드 기준 관계 71개 중 늘 그리는 선은 36개.
- **이름표는 실험·시약(화학식)·높음 이상 위험에만 늘** 붙는다(화면에서 최소 12px). 실험·위험은 `shortName`(예: '색 변화', 'SO₂ 발생'), 시약은 화학식(KIO₃). 나머지(생성물·기구·장비·낮은 위험)는 가리키거나 가까이(1.7배 이상) 볼 때만. 아주 멀리서(0.45배 미만) 보면 실험과 매우 높은 위험만 남는다.
- 이름표가 서로 덮거나 **다른 노드를 가리면 덜 중요한 쪽을 숨긴다**(`placeLabels`). 아래 자리가 막히면 위, 그다음 오른쪽을 시도한다. 가리킨 노드와 매우 높은 위험의 이름은 노드를 덮어서라도 남는다.
- 노드는 상자 대신 점이다: 실험(겹원), 시약(채운 원, 남은 양이 많을수록 조금 크다), 생성물(빈 원), 기구(둥근 사각), 장비(마름모), 위험(심각도 기호). 재고 부족·만료는 점선 고리. 범례가 곧 필터다(종류 단추에 같은 기호).
- 노드와 이름표는 줌을 그대로 따르지 않고 배율의 제곱근만큼(0.8~1.35배)만 커진다. 멀리서도 읽히고 가까이서도 덮지 않는다.

### 그래프 그림 (`src/graph/canvas/`)

- **살아 있는 시뮬레이션**(`layout.ts`). 3단계에는 미리 다 돌려 놓고 멈춘 지도였는데, '움직이지 않아 보는 재미가 없다'는 피드백으로 살렸다.
  - 처음 열면 가운데에서 묶음 자리로 1.6초 동안 퍼진다(같은 탭에서는 처음 한 번만, `sessionStorage`). 다 퍼진 모습을 미리 계산해 화면 맞춤에 쓰므로 퍼지는 동안 화면이 흔들리지 않는다.
  - 끌면 이웃이 링크를 따라 출렁이며 따라오고, **놓으면 고정하지 않고 제자리로 돌아간다**(3단계의 '드래그 고정'과 '고정 풀기'는 없앴다).
  - 초안은 쓰는 시약·기구를 조금 끌어당긴다. 묶음이 붙잡고 있어 멀리 끌려오지는 않는다.
  - 묶음 자리는 타원 위에 놓는다. 시약 묶음은 왼쪽 호, 기구·장비 묶음은 오른쪽 호(큰 묶음이 가운데), 실험은 가운데. 한번 정한 자리는 바꾸지 않는다.
  - 마찰(velocityDecay 0.26)을 기본값보다 줄였지만 몇 초 안에 멈추고, 멈추면 프레임을 돌지 않는다.
  - `prefers-reduced-motion`이면 퍼지기·갱신 움직임 없이 다 돌린 결과로 바로 간다.
- **위치 유지:** 본 적 있는 모든 노드의 자리를 기억한다. 새 노드는 이웃 근처(템플릿을 본뜬 초안은 그 템플릿 자리)에서 생겨나고, 기존 노드는 순간이동 없이 그 자리에서 이어 움직인다. 같은 그래프 → 같은 배치(고정 씨앗).
- **명령형 엔진:** 위치·화면 이동·입력·이름표 표시는 `GraphEngine`이 다루고 React는 요소만 만든다. 매 프레임 React를 다시 그리지 않는다.
- **진입 전환:** 그래프 SVG는 화면 전체 한 장이고 `clip-path`로 그래프 카드 모양만 보인다. 진입하면 카드 틀(`--g-*` 변수)이 600ms에 걸쳐 가운데로 줄어들고, 엔진은 새 '보이는 영역'(`.graph-region`을 잰 여백)에 같은 시간으로 화면을 맞춘다. SVG 크기가 바뀌지 않으므로 노드 좌표·줌이 흔들리지 않는다. 히어로 그라데이션은 걷히고 그래프 색은 흰색에서 짙은 색으로 같은 시간에 바뀐다.
- **설명 카드:** 노드를 가리키거나 키보드로 고르면 그래프 카드 왼쪽 위에 이름·종류·한 줄 정보, 시약이면 연결된 위험(둘까지, 나머지는 '외 n건')이 뜬다. 노드 옆에 띄우면 막 보려던 이웃을 가린다.
- **관계 설명 글:** 가리키거나 키보드로 고른 노드의 관계가 넷 이하일 때만, 짧게(조건·양·목적 16자, 반응식은 빼고) 단다. 이름표와 같은 겹침 처리를 받고, 끄는 동안에는 숨긴다. 전체 설명은 상세·목록에 있다.
- 공용 로봇 스테이션으로 가는 템플릿의 선은 가리킬 때만 그린다(모든 실험이 같은 스테이션을 써서 정보가 없다). 초안의 선은 늘 그린다. '위험만 보기'나 종류 필터를 바꾸면 남은 것에 맞춰 다시 맞춘다.
- **키보드:** 그래프 전체에 탭 정지 하나, 방향키로 그 방향의 가까운 노드, Enter로 열기(첫 화면에서는 진입), Esc로 닫기, +/−/0으로 확대·축소·전체.

### 패널

- 첫 화면은 연구실 전체(`GraphSource.getAll`). 진입은 질문 전송 또는 노드 클릭·Enter(그 노드에 포커스하고 입력창에 '○○에 대해 '를 넣어 둔다. 보내지 않는다).
- 작업 화면은 초안 > 조회 결과 > 연구실 전체 순으로 보여 준다. 진입 뒤 첫 답이 끝나기 전에는 전체 그대로.
- 그래프 카드 머리말: 제목(연구실 전체·구성 중인 실험·조회 결과) + 목업 표시, 그래프|목록, 확대·축소·전체, 범례 겸 종류 필터. 좁은 폭에서는 필터를 접는다. 머리말 높이는 재서 그래프·목록·상세가 그 아래에서 시작한다.
- 노드 상세(요약 열의 위험 카드 아래, 좁은 폭에서는 아래 시트): 시약병 라벨 격자(이 실험에서의 사용량, 화학식, 농도, 상, 보유량, 위치, CAS·로트·유효기간은 고정폭), 연결된 위험, '대화에 넣기'.
- **요약 열**(`SidePanel.tsx`): 위험 요약(어두운 카드 한 장. 가장 무거운 위험의 이름을 먼저, 그 아래 '외 n건'과 심각도 배지, '위험 목록 보기'), 다음 할 일 카드(확정 전 '구성 확정' → 확정 뒤 '실행 시작' → 시작 뒤 실행 기록), '위험만 보기' 타일, 재고(이 실험이 쓰는 양 / 보유량 막대, 부족·미보유 칩). 좁은 폭에서는 위험 요약 + 다음 할 일 띠 하나로 줄어든다. 모니터링 탭에서는 접힌다(그 내용은 모니터링 카드 안에 있다).
- **목록 보기:** 그래프의 글 대안. 초안이면 위험(심각도순) → 시약 표(역할·사용량·보유량·상태·위치) → 기구 → 장비. 아니면 위험을 맨 앞에 둔 종류별 목록. 인쇄하면 그래프 대신 목록이 나온다.

### 구성 확정

- 재고 부족·미보유·만료가 있으면 막고 이유와 해결 방법을 보여 준다. high·critical 위험은 하나씩 '확인함'을 눌러야 확정할 수 있다(`checkConfirmation`, `canConfirm`).
- 확정하면 그 시점의 초안 그래프를 `cfg-xxxxxxxx`(내용 해시) id로 고정 저장하고(`confirmed`, 기록은 `confirmedHistory`), 실행 계획 탭을 열고 계획을 요청한다('실행 계획' 절). 이후 계획과 보고서는 이 스냅샷을 기준으로 한다.
- 확정 뒤 채팅으로 구성을 바꾸려 하면 바꾸지 않고 새 초안을 만들지 묻는다. '새 초안 만들어 줘'(또는 실행 계획 탭의 '새 초안 만들기')는 확정 구성을 바탕으로 번호가 하나 큰 초안을 만들고, 확정은 풀리지만 기록은 남는다.

## 실행 계획

### 모델 (`src/domain/plan.ts`)

- `ExecutionPlan`: `id`, 기준이 된 확정 스냅샷 `graphSnapshotId`, 지금 `version`, `versions`(v1부터 지금까지 각 버전의 변경 요약과 묶음 목록 전체), `source`.
- 묶음(`PlanGroup`: title, target, 근거 `basis`) → 동작(`PlanAction`: id, label). 근거는 그 묶음이 나온 노드 id와 쓰는 이유('5 mL · 지시약', '센서 프로브')다.
- 같은 묶음 안에 같은 이름의 동작이 나올 수 있어서('레일 이동 · 시험관대') 동작 id는 이름이 아니라 순번(`reagent-starch-2`)이다. 옮겨도 id는 따라간다.
- 진행 위치(cursor)는 '끝난 동작의 수'다. `steps[cursor]`가 지금 실행 중인 동작이고 cursor가 전체 수와 같으면 끝난 상태다(`planProgress`, 5단계에서 쓴다).
- 버전마다 목록 전체를 남긴다. 되돌리기는 지난 버전을 지우지 않고 그 목록으로 새 버전을 쌓는다. '바뀐 동작'은 앞 버전과의 최장 공통 부분열에서 빠진 동작과 다른 묶음으로 간 동작이다(`changedActionIds`). 하나를 맨 뒤로 옮겼을 때 번호만 당겨진 나머지까지 강조하면 무엇을 옮겼는지 묻힌다.
- 서버가 보낸 계획은 `parsePlan`으로 검증한다. 동작 하나라도 모양이 틀리거나 id가 겹치면 계획 전체를 버린다. 실행 직전 목록에서 동작이 조용히 빠지는 쪽이 더 위험하다.

### 생성과 수정 (목업: `src/adapters/chat/mock/plan.ts`)

- 확정하면 `ChatProvider`에 `action: 'generate-plan'`으로 요청하고 `plan` 이벤트로 받는다. 대화에는 '구성 확정 · ○○' 한 줄이 남는다. 답이 끊기면 계획 카드의 '실행 계획 만들기'나 그 답의 '다시 시도'로 같은 요청을 다시 보낸다.
- 색 변화 실험(템플릿 그대로의 시약 구성)은 이전 레포 `planSeeds`(시약 분주 → 시약 분취 → 반응 개시, 3묶음 16동작). 이전 계획과 같게 아황산 수소 나트륨은 따로 분주하지 않는다. 시약을 바꾼 구성과 다른 실험은 `USES`·`REQUIRES`에서 규칙으로 만든다: 시약마다 시약병 파지 → 레일 이동 → 분주(적정액은 적하) → 레일 이동 → 안치, 센서가 필요하면 첫 시약 전에 프로브 삽입, 마지막에 교반·정리.
- 채팅 수정: "교반을 맨 뒤로", "센서 프로브 삽입을 마개 개방 뒤로", "05 삭제"·"5번 빼 줘", "되돌려 줘"·"v1 버전으로 되돌려 줘". 이해하면 새 버전을 `plan` 이벤트로 내고 무엇을 바꿨는지 번호와 함께 답한다. 이름이 여러 동작에 맞으면 후보를 번호로 보여 주고 되묻는다. 없는 번호·없는 동작·알아듣지 못한 말이면 계획을 바꾸지 않는다.
- 화면 쪽은 지금 확정 스냅샷의 계획만 받고, 실행을 시작한 뒤에 온 계획은 버린다. 목업도 시작 뒤 수정 요청은 거절한다.

### 화면 (`PlanStage.tsx`)

- 가운데 카드: 실험 이름, '실행 계획 v2', 묶음 수·동작 수(목업이면 '목업'), '계획은 여기서 고치지 않습니다. 바꿀 점을 채팅으로 요청하세요'와 예시. 끌어 옮기기·삭제 단추 같은 편집 UI는 없다.
- 묶음별 번호 목록. 묶음 머리에 번호 범위(01–08), 각 동작에 전체 순번. 이번 버전에서 바뀐 동작은 면 색 + 왼쪽 막대 + '바뀜' 글자로 표시하고, 카드 밖에 있으면 보이는 곳으로 스크롤한다(버전마다 한 번). 위에는 'v2 반응 비커 교반을 맨 뒤로 · 바뀐 동작 1개 표시 · 뺀 동작: …' 요약. 바뀐 버전은 스크린 리더에도 알린다.
- 묶음마다 '근거 n개'를 접어 둔다. 펼치면 종류(시약·기구·장비), 이름, 쓰는 이유.
- 버전 기록(최근 것부터, 'v2 · 반응 비커 교반을 맨 뒤로'). 지난 버전의 '되돌리기'는 채팅으로 'v1 버전으로 되돌려 줘'를 보낸다. 계획을 바꾸는 길을 채팅 하나로 두고 대화에 기록이 남게 한다.
- 계획이 오기 전에는 '실행 계획 만드는 중'(상태 문구), 오지 않았으면 '실행 계획 만들기'.

### 실행 시작

- 요약 열의 '실행' 카드: '계획 v2 · 16동작으로 시작합니다. 시작한 뒤에는 계획을 고칠 수 없습니다.' + '실행 시작'. 누르면 확인 대화상자(alertdialog, 취소·Esc·바깥 누르기는 시작하지 않음).
- 시작하면 `RunSource.start`가 받은 뒤에 실행 기록(`RunRecord`)을 만들고 모니터링 탭을 연다. 로봇 서버가 받지 못하면 기록을 만들지 않고 대화상자에 이유를 남긴다. 대화에 '실행 시작 · 계획 v2' 한 줄. 이후 계획 카드는 잠긴 안내를 보이고 되돌리기를 숨긴다.
- 새 초안을 만들어 확정이 풀리면 계획과 지금 실행을 비운다(실행 기록은 `runHistory`로 내려놓는다).

## 장비 피드와 모니터링

### 어댑터

- **`DeviceSource`**(`src/adapters/device/`): health, 센서 값, 열화상 통계·ROI 목록·추가·삭제·시계열 CSV·영상, 카메라 셋 영상(`openCamera('top' | 'left-arm' | 'right-arm')`), 비상 정지(자리만). 타입(`DeviceHealth`, `SensorReading`, `ThermalStats`, `ThermalRoi`, `ThermalSample`)과 상수(`THERMAL_SENSOR_WIDTH/HEIGHT = 160×120`, `THERMAL_ROI_COLORS`)는 이전 `deviceApi.ts`에서 그대로 옮겼다.
  - http: `GET /health`, `/sensors`, `/thermal/stats`, `/thermal/rois`, `POST /thermal/roi`, `DELETE /thermal/roi/{id}`, `GET /thermal/roi/{id}/series.csv`, 영상은 `/thermal/stream?fps=9&width=640&colormap=inferno`·`/camera/stream?fps=10`(탑뷰). 이전 서버에는 카메라가 하나뿐이라 팔 카메라 둘은 경로를 지어내지 않고 '아직 장비 서버에 연결하지 않았습니다'(501)로 답한다. 경로 문자열은 `HttpDeviceSource` 안에만 있다. 오류는 본문의 `detail`/`error`를 먼저 쓰고, JSON이 아니어도 깨지지 않는다.
  - 영상은 `VideoSource`(MJPEG URL 또는 `MediaStream`) 하나로 다룬다. `VideoView`가 URL은 `<img>`, 스트림은 `<video>`로 그린다(`srcObject`를 붙인 뒤 `play()`를 직접 부른다).
  - 탑뷰 카메라: 기본은 이전처럼 브라우저가 RealSense를 직접 연다(`browserCamera.ts`). 권한용으로 먼저 아무 카메라나 열고, `enumerateDevices`에서 `/realsense/i`를 찾아, 같은 장치면 재사용·아니면 1280×720으로 다시 연다. 여는 도중 취소돼도 트랙을 모두 멈춘다. 권한 거부·카메라 없음·사용 중·RealSense 못 찾음(인식된 카메라 이름 함께)을 문구로 가르고, 라벨 끝 USB id를 지운다.
  - 목업: 센서는 이전 `experimentReportData.ts`의 실측 곡선(anchors)을 따라 실행 진행에 맞춰 변한다(앞 1/4은 시약을 넣는 시간이라 바탕값). 열화상은 160×120 격자(실온 + 반응 비커 + 움직이는 열점)를 계산해 통계·ROI 표본·CSV를 만들고, 같은 격자를 inferno로 칠한 canvas를 `captureStream()`으로 준다. 카메라는 셋이 장면만 다르고 같은 실행 진행을 본다. 탑뷰는 작업대를 위에서(비커 용액 색, 시약대, 레일 위 캐리지, 오가는 두 팔), 왼팔은 반응 비커 옆모습(용액 색이 청람색 면적 비율 — 이전 `colorFrames` — 을 따르고 교반 중이면 소용돌이), 오른팔은 시약대 위 피펫 끝이 진행에 따라 옮겨 간다. 영상 안에 `MOCK · TOP` 같은 표시가 있다. 꺼짐·오류·오래된 데이터·연결 끊김(TypeError)을 주입할 수 있다.
- **`RunSource`**(`src/adapters/run/`): `start`, `connect`(상태 스트림. 새로고침 뒤 다시 붙을 때 화면이 아는 상태를 함께 준다), `pause`·`resume`·`emergencyStop`. 진행 위치는 끝난 동작의 수. 목업은 타이머로 동작을 하나씩 끝내고, 일시정지하면 그 동작에 쓴 시간을 기억했다가 재개 때 이어 간다. E-STOP은 지연·실패 주입을 거치지 않고 바로 멈추며 '실제 장비 미연결'을 기록한다. http는 자리만 있다.

### 이전 훅에서 지킨 것 (`src/device/feed.ts`, `src/monitoring/feed.ts`)

- 폴링은 응답을 받은 뒤 2초 뒤에 다음 요청을 예약한다. 요청마다 이전 요청을 끊고, 멈추면 타이머와 요청을 정리한다.
- health·센서, 열화상 통계·ROI 목록을 `Promise.allSettled`로 따로 반영한다. 실패해도 마지막 정상 값을 남기고 오류만 따로 표시한다. `lastUpdated`는 하나라도 성공했을 때만 바뀐다. 취소는 오류가 아니다.
- 장비 피드는 실행 중이면 어느 탭을 보든 받는다(실행 기록의 시계열이 끊기지 않게). 실행이 없으면 모니터링 탭을 볼 때만 받는다. 열화상 영상은 대화상자가 열려 있을 때만, 카메라 셋은 모니터링 카드가 보일 때만 연다. 타일과 확대 보기는 카메라마다 같은 스트림을 나눠 쓴다.
- 열화상 ROI: 포인터로 끌어 그리고(`setPointerCapture`로 영상 밖까지, `pointercancel`도 끝으로), 화면 배율과 상관없이 센서 격자 좌표로 바꿔 자른다. 2칸 미만(그냥 누름)은 등록하지 않는다. 이름은 '영역 N'. 키보드로는 '가운데 영역 추가'. 추가·삭제는 바로 반영하고 다음 폴링이 서버 상태로 맞춘다. 실패하면 ROI 오류를 따로 보인다. 색점은 서버가 사각형에 쓰는 색과 같다. 영역마다 CSV.
- 열화상 대표값: 추적 영역 평균 > 프레임 최고 온도 > 짧은 상태 문구. 원문 오류는 대화상자에서.
- 장치 상태: 센서는 확인 중·정상·대기·오류, 카메라·열화상·레일·로봇팔은 확인 중·연결됨·대기·오류. 판정 순서는 이전 `DeviceStatusPills`.

### 화면 (`src/monitoring/MonitoringStage.tsx`)

관제 화면이다. 모니터링 탭을 보는 동안 요약 열을 접고, 가운데 카드가 그 자리까지 넓어져 위험·실행·장치 상태를 함께 담는다. 카드가 충분히 넓고 높으면(카드 폭 34rem·높이 40rem 이상, 1024×768부터) 스크롤 없이 카드 높이에 맞추고, 남는 높이는 가운데 줄(센서·카메라)과 아래 칸이 1.6 : 1로 나눠 갖는다. 그보다 작으면(390 등) 한 줄로 흐르고 머리(비상 정지)가 위에 붙어 남는다.

- 머리: 실험 이름, 상태 배지(진행 중·일시정지·완료·비상 정지, 점 모양 + 글자), 경과 시간(1초마다), 시작·끝난 시각, 계획 버전, 목업이면 '목업 실행 · 비상 정지는 기록만 남깁니다'. 오른쪽에 일시정지·재개와 E-STOP(가장 무거운 단추, 묻지 않고 바로). 끝나면 그 자리가 '보고서 보기'가 된다.
- 지금 띠: 지금 동작과 묶음, 진행 막대(`progressbar`)와 n/N·%. 오른쪽에 장치 상태(센서·탑뷰 카메라·열화상·레일·로봇팔, 점 모양 + 글자)와 마지막 갱신·동기화 주기·출처.
- 가운데 줄: 왼쪽에 센서 2×2, 오른쪽에 카메라. 12칸 격자에서 센서 5칸, 카메라 7칸.
- 카메라 셋: 탑뷰가 위 한 줄 전체, 왼팔·오른팔이 그 아래 나란히(한 줄 흐름에서도 같은 배치). 영상 위 이름표에 이름과 '실시간·연결 중·연결 안 됨'(칠한 점·빈 점 + 글자). 누르면 확대 대화상자(머리에 E-STOP).
- 센서 넷(2×2, 한 줄 흐름에서는 네 칸 나란히): pH, EC, TDS, 열화상 대표값. 칸마다 이름 / 지금 값 / 최근 30개 흐름선(남는 높이를 채운다, 그림에는 최저·최고를 담은 레이블) / 무엇인지. 출처(목업 값·측정값·센서 오류)는 줄 머리에 한 번. '표로 보기'는 대화상자(시각·pH·EC·TDS·열화상). 열화상 칸을 누르면 열화상 대화상자.
- 아래 세 칸: 계획 진행(지금 묶음의 앞뒤 세 동작 + 묶음별 마친 수, '전체 16동작'은 대화상자), 이 실험의 위험(무거운 것부터 모두, 모양·심각도 글자·제목. 대시보드에서 유일한 어두운 면), 장비 로그(최신이 위, 칸 안에서 넘긴다).

### 채팅과 실행 기록

- 실행 중에는 `ChatRequest.state.telemetry`에 최신 센서 값·열화상 대표값·장치 상태·진행(지금 동작, 다음 동작)이 실린다. 목업은 "지금 pH 얼마야?"(물은 값을 먼저, 받은 시각과 함께, 오래됐으면 그렇다고)와 "지금 뭐 하는 중이야?"(지금 동작, 마친 수, 다음)에 그 값으로만 답한다. 값이 없으면 숫자를 지어내지 않는다.
- 실행 기록(`RunRecord`, `src/domain/run.ts`): 시작·종료 시각, 기준 계획 버전과 확정 스냅샷 id, 센서 표본(2초, `ph`·`ec`·`tds`·`temp`·열화상 대표값·진행 위치·stale. 최대 3600개), 진행 이벤트, 오류(같은 장비 오류는 바뀔 때만), 사용자 조작(시작·일시정지·재개·E-STOP), 출처. 6단계 보고서의 입력이다. 실행이 끝나면 보고서 탭이 열린다.

## 결과 보고서

이전 `ExperimentReport.tsx`는 색 변화 실험 한 건의 문구와 수치('03:42 요오드 추가', 'KPI 93.4%')를 컴포넌트에 박아 두었다. 그것을 `RunReport` 데이터로 끌어내 어떤 실행이든 같은 화면이 그리게 했다. 실행이 끝나면(완료 또는 비상 정지) 보고서 탭이 열린다.

### 모델 (`src/domain/report.ts`)

- 메타: id, 제목, 날짜, 시작·종료 시각, 길이(초), 표본 간격, 출처(`source: mock | live`), 바탕(`basis: fixture | run`), 계획 버전.
- 지표 정의: key, 이름, 단위, min/max, 눈금, 색 자리(`tone` 1–5 → `--chart-1…5`), 소수 자리, 해석 문구. 측정 시계열은 `{t, values: {지표: 값}}`이고 없던 값은 비운다.
- 사건(감지·투입·목표 도달·검증·일시정지·재개·비상 정지·완료·오류)과 구간(보정, 일시정지), 지표별 기준선.
- KPI(이름·값·단위·시작 대비 변화·배지), 사용 재료(시약·화학식·CAS·상·농도·투입량과 추가 투입·위험 심각도 + 문구), 반응식·절차·색 변화 프레임(있을 때만 그 절을 그린다).
- 에이전트 판단(감지 → 판단 → 실행 → 검증), 허용 범위 안에서 실행했는지, 실행 로그, 타임라인, 결론과 후속 제안.
- 순수 함수: `mmss`, `timeTicks`(폭이 480px 아래면 눈금 셋), `niceAxis`, `normalize`, `chartSummary`(차트 aria 문장), `reportCsv`, `reportBrief`(채팅에 싣는 요약). 테스트는 `report.test.ts`.

### 목업 두 가지 (`src/adapters/report/`)

둘은 한 화면에 섞지 않는다. 보고서 위의 '이번 실행 | 예시 보고서'로 오가고, 머리에 출처를 적는다.

1. **이번 실행**(`reportFromRun.ts`): 5단계 `RunRecord`에서 만든다. 지표는 기록에 있는 것만(전도도·pH·TDS·용액 온도·열화상), 축은 관측값에서 잡는다. 일시정지는 구간, 비상 정지는 빨간 세로선이 된다. 재료는 확정 그래프의 `USES`와 시약의 `HAS_HAZARD`·`CAUSES`(조건은 괄호로)에서, 절차는 실행한 계획 버전의 묶음에서 가져온다. 목업 로봇은 스스로 판단하지 않으므로 에이전트 판단·반응식·색 변화 절은 만들지 않고, 해석은 수치만 옮긴다('목업 장비가 만든 값이라 반응 해석에 쓰지 않습니다').
2. **예시**(`mock/fixture.ts`): 이전 `experimentReportData.ts`를 이 모델로 옮겼다. 앵커 보간으로 2초 간격 257개 시점, 결정적이다. 위험은 GHS 픽토그램 대신 심각도 + 문구로 바꿨고, 심각도는 목업 그래프의 같은 위험과 맞췄다. '예시 데이터 · 이전 레포의 발표용 기록(실측 아님)'으로 표시한다.

http(`HttpReportSource`)는 `GET /runs/{id}/report`로 받고 예시는 없다(예시 보기를 숨긴다).

### 화면 (`src/report/ReportStage.tsx`)

- 요약 열을 접고 가운데 카드를 넓혀 표와 차트에 폭을 준다(모니터링과 같다).
- 머리: 실행 id · 출처, '센서 데이터 CSV', 'PDF 저장 / 인쇄'. 그 아래 목차(있는 절만). 목차는 주소(해시)를 바꾸지 않고 그 절 제목으로 스크롤·포커스한다. 뒤로 가기가 화면 전환에 쓰이기 때문이다.
- 요약(결과 표시: 달성은 체크, 멈춤은 네모 + 글자, 자율 보정 횟수) → KPI → 재료 표 → 반응식·절차(넓으면 두 칸) → 센서 → 색 변화 → 에이전트 판단 → 해석과 후속 제안 → 타임라인과 펼쳐 보는 실행 로그.

### 차트 (`src/report/ReportChart.tsx`, visx)

- 지표별 탭(React Aria Tabs, 화살표 키로 이동). 차트 폭은 `ResizeObserver`로 칸을 따라간다(최소 240px).
- 보정·일시정지 구간 음영, 사건 세로선(투입·목표 도달·비상 정지·오류. 감지·검증은 구간 양끝이라 선을 긋지 않는다), 기준선, 마지막 값 점, 면 그라디언트, 단위, 측정 개수.
- `aria-label`: '전도도 추이. 시작 842 µS/cm에서 끝 1,136 µS/cm. 최저…, 최고…. 257개 측정. 기준선…. 사건: 03:42 요오드 용액 2.0 mL 추가, …. 구간: 03:20–04:48 보정 구간.'
- 범례: 지표별 시작 → 끝(선 견본은 겹침 차트와 같은 굵기·점선), 음영과 세로선이 무엇인지. 탭 아래 해석 문구는 지표를 따라 바뀐다(`aria-live`).

### CSV

UTF-8 BOM, CRLF. 열은 경과 시간(mm:ss), 경과 초, 지표별 값(열 이름에 단위), 그 시점의 사건(그 시각 이하 가장 가까운 행에, 여럿이면 ' / '). 쉼표·따옴표는 따옴표로 감싼다. 파일명 `{runId}-sensor-data.csv`. Blob URL은 1초 뒤에 지운다(바로 지우면 일부 브라우저에서 다운로드가 실패한다). 내려받았다는 안내를 4.5초 보인다(`role="status"`).

### 인쇄(PDF)

`window.print()` + 인쇄 스타일. `beforeprint`에서 접힌 실행 로그를 펼치고 `afterprint`에서 원래대로 되돌린다. 인쇄에서는 대화·레일·목차·단추·탭 차트를 숨기고, 모든 지표를 각자의 관측 범위로 정규화해 한 축에 겹친 차트와 지표별 해석을 모두 보인다. 지표마다 선 굵기·점선이 달라 흑백에서도 구분된다. 절·KPI·표 행은 페이지에서 끊지 않는다.

### 채팅

보고서를 띄우면 `ChatRequest.state.report`에 요약(`ReportBrief`: 결과, 한 줄 요약, KPI, 에이전트 판단, 사건, 결론)이 실린다. 예시이거나 지금 실행의 보고서일 때만 싣는다. 목업은 이것으로만 답한다.

- '이 결과 요약해 줘' → 출처, 결과, KPI, 결론.
- '왜 요오드를 추가했어?' → 감지 → 판단 → 실행 → 검증 순서와 보고서의 해석. '추가'가 들어 있어도 구성 변경으로 읽지 않는다.
- 판단 기록이 없는 실행에서 '왜 멈췄어?' → 기록된 사건(누가 했는지)만 말하고, 이유는 지어내지 않는다.

## 디자인 시안 (`proposals/`)

3단계를 마친 뒤 사용자가 세 가지를 짚었다. '기본 라이브러리로 만든 것처럼 심심하다', '그래프에 글씨가 너무 많고 관계가 너무 복잡하다', '물리 효과가 없어 보는 재미가 없다'. 기능을 더 쌓기 전에 방향부터 다시 정했다(3.5단계).

| 시안 | 내용 | 결과 |
| --- | --- | --- |
| A 용액 | 유리 바탕, 보관 위치를 액체 웅덩이로, 초안이 청람으로 번짐 | 둥근 묶음 모양을 가져감 |
| B 열화상 | 어두운 보라 바탕, 열화상 색 띠를 주목도로 | 버림(매우 높음이 흰빛 노랑이라 실험실 색 관례와 어긋남) |
| C 데크 | 알루미늄 바탕 + 웰 플레이트 격자, 보관 위치를 슬롯으로 | D로 이어짐 |
| D | C 테마 + A의 둥근 묶음 | E로 이어짐 |
| E 실험대 카드 | 참고 이미지의 벤토 구성 + 화학 색(황산구리 파랑, 프러시안 블루) | 배치를 가져감 |
| **F 블루 팔레트** | E의 배치 + 사용자가 준 팔레트 | **채택** |

세 시안 모두 같은 그래프 정리 규칙과 물리 효과를 썼고, 그 규칙이 `declutter.ts`·`layout.ts`가 됐다. 시안은 독립 페이지라 앱 빌드에 들어가지 않는다. 보려면 `npm run dev` 뒤 `/proposals/`를 연다(`?scheme=dark`, `?still`).

## 디자인 토큰

`src/styles/tokens.css`. 컴포넌트는 이 커스텀 속성만 참조하고 색·크기 값을 직접 쓰지 않는다. 1단계에서 `apple-design` 스킬의 Design improvement mode로 정했고, 3.5단계에서 사용자가 준 팔레트와 배치로 바꿨다. 웹 앱이라 Apple의 원칙과 기초(접근성·색·타이포·레이아웃·모션)만 적용한다.

**첫째 규칙은 그대로다:** 실험 직전에 쓰는 도구라 어느 화면에서든 **위험이 가장 먼저, 가장 무겁게 읽힌다.** 위험 신호색은 Hazard에만 쓰고, 파랑과 겹치지 않는다.

### 사용자가 준 팔레트

| UI 요소 | 값 | 토큰 |
| --- | --- | --- |
| Primary Button | `#0056FF` | `--accent` |
| Button Hover | `#2277FF` | `--accent-hover` |
| Main Background | `#FFFFFF` | `--surface-raised`(카드). 화면 바탕 `--surface`는 5b단계에서 사용자 요청으로 은은한 회색 `#F2F3F7` |
| Highlight Card | `#E3E7FC` | `--highlight`(레일·구성 확정·타일·내 말풍선), `--separator`(카드 테두리) |
| Heading | `#000000` | `--heading` |
| Hero Section | Futurewave Gradient | `--hero` |
| Dark Section | Midnight Surge Gradient | `--feature` |

두 그라데이션은 값이 주어지지 않아 Primary를 축으로 정의했다.

- **Futurewave(히어로):** `#0048E0 → #0056FF → #4A4FD9 → #0068C9`. 처음에는 밝은 하늘색(`#38B6FF`)으로 끝났지만, 흰 12px 이름표가 그 위에서 2.26:1이라 가장 밝은 곳도 흰 글자 5.4:1 이상이 되게 눌렀다.
- **Midnight Surge(위험 요약 카드):** `#0A2E9A → #0047D9 → #0056FF`. 처음 값(`#04091F → #0A1D5C → #0040C9`)이 '너무 어둡다'는 의견으로 밝혔다. 가장 밝은 끝에서도 흰 글자 5.56, 보조 글자(`#E3E9FF`) 4.60.

### 색

명암비는 WCAG 2(라이트 / 다크).

| 토큰 | 라이트 | 다크 | 명암비 | 역할 |
| --- | --- | --- | --- | --- |
| `--surface` / `--surface-raised` | `#F2F3F7` / `#FFFFFF` | `#05081A` / `#0B1129` | 흰 카드 1.11 | 바탕 / 카드. 회색 바탕 위에 흰 카드가 떠 보이고, `--separator` 테두리를 함께 둔다 |
| `--highlight` | `#E3E7FC` | `#18224D` | — | 강조 카드 |
| `--heading` | `#000000` | `#FFFFFF` | 21 | 큰 제목 |
| `--content` | `#0B1020` | `#EEF1FF` | 18.93 / 16.57 | 본문 |
| `--content-secondary` | `#4A5270` | `#A9B2D6` | 7.69 / 8.90 (강조 카드 위 6.26 / 7.29) | 메타·placeholder |
| `--control-border` | `#7D859F` | `#5A6595` | 흰 카드 3.67 · 회색 바탕 3.31 / 3.31 | 입력·버튼 테두리, 그래프 선(비텍스트 3:1). 바탕을 회색으로 바꾸며 `#8A92AE`(회색 위 2.78)에서 진하게 했다 |
| `--accent` | `#0056FF` | `#0056FF` | 흰 글자 5.56 | 주 동작, 현재 단계, 구성 중인 실험이 고른 노드. 4단계부터 '이번 계획 버전에서 바뀐 동작', 5단계부터 '실행 진행 중'(상태 배지·진행 막대·하는 중인 동작). 모두 '지금 여기'를 가리키는 뜻이다 |
| `--accent-hover` | `#2277FF` | `#2277FF` | 흰 바탕 4.08 | 주 단추를 가리킬 때의 바깥 고리. 그 위 흰 글자가 4.08이라 글자 바탕으로는 쓰지 않는다(면은 `--accent` 그대로) |
| `--accent-strong` | `#0056FF` | `#7AA2FF` | 5.56 / 7.49 | 카드 위 파란 글자·선(다크에서는 밝힌다) |

히어로와 위험 요약 카드 위에서는 글자와 그래프를 흰색 계열로 바꾼다(`--on-feature` `#FFFFFF`; 히어로 부제도 흰색, `#E3E9FF`는 밝은 끝에서 4.54라 여유가 없다). 칩·단추 바탕은 흰색을 겹치면 흰 글자 대비가 떨어지므로 남색을 겹친다(`--hero-control`, 칩 위 흰 글자 7.5 이상). 선은 흰색 66%(`--hero-edge`, 최소 3.24).

빨강·주황은 파란 면 위에서 3:1에 못 미친다(`#FF8A8A` 2.45). 그래서 히어로 위 위험은 **스티커**로 그린다: 기호 뒤에 흰 원(`--hero-hazard-disc`), 이름표 둘레에 흰 테를 깔고 그 위에 라이트 신호색을 그대로 쓴다(흰 바탕 6.57 · 5.43 · 5.93). 신호색과 대비를 둘 다 지킨다. 위험 요약 카드의 배지는 매우 높음만 흰 면에 빨간 글자(6.57), 나머지는 흰 글자 + 테두리 굵기(2 · 1.5 · 1px)다.

**예외: 비상 정지.** 위험 빨강(`--signal-critical-fill`)은 위험(Hazard)에만 쓰지만, 비상 정지 단추와 '비상 정지' 실행 상태 배지에도 쓴다. 빨간 비상 정지는 산업 장비의 관례라 다른 색이 오히려 헷갈린다(라이트 흰 글자 6.57, 다크 `#05081A` 글자 9.01). 장치 오류 표시(×)는 빨강을 쓰지 않고 모양과 글자로만 가른다.

**차트.** 보고서 지표 색 자리 다섯(`--chart-1…5`): 라이트 `#0F766E` · `#4F46E5` · `#A21CAF` · `#B45309` · `#475569`(흰 카드 위 5.47 · 6.29 · 6.32 · 5.02 · 7.58), 다크는 밝힌 같은 계열(카드 위 9 이상). 빨강은 위험과 비상 정지에만 쓰므로 지표 색에서 뺐고, 비상 정지 세로선만 빨강이다. 사건선·기준선 `--chart-event`(5.85), 보정 구간 음영 `--chart-span`(그 위 지표 선도 4.39 이상), 일시정지 구간은 `--surface-inset`. 인쇄·흑백에서는 선 굵기와 점선이 지표를 가른다.

**영상 바탕.** 카메라·열화상 영상 뒤(`--video-backdrop` `#05081A`)와 그 위 글자(`--on-video` `#E3E9FF`, 16.44)는 라이트·다크와 상관없이 어둡다. 몰입해 보는 영상은 어두운 바탕이 낫다.

### 위험 심각도 (Hazard 전용)

3단계에서 정한 그대로다. 순서는 **채움 무게 + 모양 + 글자 + 선 두께** 네 겹으로 싣는다. 색을 지워도(흑백 인쇄, 색각 이상, 파란 면 위) 읽힌다.

| 심각도 | 모양 | 표시 | 라이트 | 다크 |
| --- | --- | --- | --- | --- |
| 매우 높음 `critical` | 채운 팔각형 | 칠한 면 | 면 `#B42318`, 글자 `#FFFFFF` 6.57 | 면 `#FF8F85`, 글자 `#05081A` |
| 높음 `high` | 채운 삼각형 | 틴트 + 2px 테두리 | `#B54708` on `#FEF0E6` 4.86 | `#FDB27A` on `#3A2414` 8.20 |
| 보통 `medium` | 반 채운 원 | 틴트 + 1.5px 테두리 | `#8A5A00` on `#FDF3D8` 5.36 | `#F2C94C` on `#33290F` 9.03 |
| 낮음 `low` | 빈 원 | 테두리만 + '낮음' | `--content` + `--control-border` | 같음 |

- 모양은 위험에만 예약한다. 다른 노드 종류는 점·고리·사각·마름모로 나눈다(범례에 같은 기호).
- `low`는 초록이 아니다. 낮은 위험도 '안전'이 아니다.
- 그래프에서 위험은 심각할수록 크다(반지름 매우 높음 12 · 높음 11 · 보통 9 · 낮음 7, 시약은 최대 11). 매우 높음은 늘 신호색 2px 고리를 단다. 이름표 자리도 위험(매우 높음 70 · 높음 58)이 실험(50)·초안(60)보다 먼저 차지한다.
- 구성 중인 실험이 고른 노드는 파란 테두리(1.5px)로 위험 고리보다 가볍다. 공용 로봇 스테이션의 장비에는 고리를 달지 않고 웅덩이를 칠한다(다 달면 파란 고리 묶음이 위험보다 먼저 보인다). 위험에는 붙이지 않는다.
- 위험 선은 2px(매우 높음·높음)·1.5px(보통)로 일반 선(1px)보다 굵다. 흐리기(호버) 때도 위험은 0.55로 남는다.

### 상태 표시

| 상태 | 표시 |
| --- | --- |
| 현재 단계(레일) | 파란 원 + 진한 글자 + 테두리 |
| 잠긴 단계 | 흐린 글자 + 자물쇠 + '(잠김)' |
| 선택(노드) | `--content` 2px 고리(r+6) |
| 키보드 포커스 | `outline: 2px solid var(--focus-ring-color)`(라이트 `#0056FF`, 다크 `#8FB0FF`, 히어로·위험 카드 위 흰색). 그래프 노드는 고른 것·선택 고리 바깥 한 겹(r+10)에 2px 고리 |
| 켜진 보기(타일) | 파란 면 + 바깥 고리 + 기호가 체크로 + 글자 '위험만 보는 중' |
| 주 단추 가리킴 | 면은 그대로, `--accent-hover` 2px 바깥 고리 |
| 꺼진 종류(필터) | 점선 테두리 + 취소선 + 흐린 기호 |
| 비활성 | `--content-disabled` + `cursor: not-allowed` + 이유 문구 |
| 인벤토리 부족·만료 | 그래프는 점선 고리, 글로는 점선 칩 '부족'·'만료' |

`prefers-contrast: more`에서는 보조 글자를 본문색으로, 테두리·그래프 선을 진하게, medium 테두리를 2px로 올린다. 라이트·다크는 `prefers-color-scheme`만 따르고 앱 안 전환 스위치는 없다.

### 글꼴과 크기

- Pretendard Variable 하나(자체 호스팅). 화학식 첨자 보충은 1단계 그대로(`src/assets/fonts/PretendardVariable.formula.woff2`). 크기와 굵기로만 위계를 만든다.
- 단계: caption 12px · footnote 13px · **body 15px**(좁은 폭·터치 17px) · title3 17px/700 · title2 20px/700 · 히어로 34px/750(좁은 폭 26px) · 위험 요약 숫자 44px. 그래프 이름표: 실험 14px/700, 화학식 13.5px/650, 나머지 12px/600. 노드는 멀리서 0.8배까지 작아지지만 이름표는 1배 아래로 줄지 않는다(최소 12px, 가까이 보면 1.35배까지). 입력란은 모든 폭에서 최소 16px.

### 레이아웃

**레일 | 채팅 카드 | 그래프 카드 | 요약 열.** 모두 `.app` 안의 절대 위치 카드이고, 그래프 카드의 자리는 `--g-top/right/bottom/left` 네 값이 정한다. 그래프 SVG·카드 테두리·머리말·보이는 영역·목록·상세가 모두 이 값을 따른다.

- 첫 화면: 레일 옆 전체가 그래프 카드(히어로). 제목 '무엇을 실험해 볼까요?'와 연구실 한 줄 요약, 아래쪽 가운데에 예시 칩과 입력창.
- 작업 화면: 레일(4rem) · 채팅 카드(23.75rem, 중간 폭 20.5 → 18rem) · 그래프 카드 · 요약 열(18.75rem → 16.25 → 14.5rem). 카드 사이 1rem. 노드 상세는 요약 열 안, 위험 카드 아래에 열린다(그래프 카드 안에 띄우면 1280px 아래에서 그래프가 거의 가려진다). 그동안 구성 확정·타일·재고 카드는 접힌다. 요약 열이 좁으면(64rem 아래) 라벨 격자의 이름을 값 위에 쌓아 CAS·로트를 끊지 않는다. 키보드 순서도 화면 순서(레일 → 대화 → 그래프 카드 → 요약 열)와 같다. 모니터링·보고서 탭에서는 요약 열을 접고 가운데 카드가 오른쪽 끝까지 넓어진다.
- 채팅 카드가 좁아지면(64rem 아래) 보내기·중단 단추는 아이콘만 남는다.
- 좁은 폭(< 48rem): 레일은 위쪽 막대(아이콘만), 그 아래 '대화 | 작업 영역' 전환과 위험 요약. 작업 영역은 그래프 카드 + 아래쪽 '구성 확정' 띠.

### 시그니처와 모션

- **히어로가 가운데 카드로 줄어든다.** 진입하면 첫 화면을 채우던 그라데이션 카드가 600ms(`--motion-enter`, `cubic-bezier(0.2, 0.8, 0.2, 1)`)에 걸쳐 레일과 채팅 사이 가운데 카드로 줄어든다. 같은 시간에 그라데이션이 걷히고 흰 그래프가 짙은 색이 되며, 그래프는 새 영역에 맞춰 옮겨 간다(같은 SVG, 노드 좌표 그대로). 채팅·요약 카드는 0.2초 늦게 양옆에서 들어오고, 입력창은 채팅 카드 아래로 미끄러진다.
- **그래프는 살아 있다.** 첫 화면에서 묶음 자리로 퍼지고(1.6초, 같은 탭에서는 처음 한 번만), 끌면 출렁이고, 놓으면 돌아간다. 답이 끝나 그래프가 바뀔 때는 새 노드가 자리 잡을 만큼만 데운다(alpha 0.25). 사용자 조작에 답하는 움직임이고 몇 초 안에 멈춘다.
- 그 밖의 모션은 짧은 색·투명도 전환뿐이다. `prefers-reduced-motion`이면 CSS 전환과 JS 애니메이션을 끄고, 그래프는 다 퍼진 모습으로 바로 그린다.

## 아직 목업인 곳

| 영역 | 상태 | 실제 연결에 필요한 것 |
| --- | --- | --- |
| 그래프 DB (인벤토리 포함) | 목업: 메모리 그래프 + 시드 | 그래프 DB 앞단 API. `HttpGraphSource`는 빈 클래스 |
| 구성 확정 스냅샷 | 브라우저 localStorage(`confirmed`, `confirmedHistory`) | 서버에 확정 스냅샷을 저장하는 API. 지금은 이 브라우저에만 있다 |
| LLM (`ChatProvider`) | 목업: 키워드 의도 분류 + 그래프 조회 | `POST /chat` → SSE(`data: ChatEvent`). `HttpChatProvider`는 구현돼 있고 서버만 있으면 된다 |
| 실행 계획 생성·수정 | 목업: `planSeeds` + 규칙 생성, 키워드로 옮기기·빼기·되돌리기 | 서버 LLM 플래너. `action: 'generate-plan'` 요청과 수정 대화에 `plan` 이벤트(버전 기록 포함)로 답하면 된다. 서버 쪽에서도 실행 시작 뒤 수정을 막아야 한다 |
| 장비 (`DeviceSource`) | 목업: 실측 곡선 센서, canvas 열화상·카메라 셋, 메모리 ROI | `HttpDeviceSource`는 이전 장비 API 경로로 구현돼 있다. `VITE_DEVICE_SOURCE=http`와 주소만 있으면 된다. 장비 쪽 비상 정지 API는 아직 없다 |
| 탑뷰 카메라 | 목업 canvas | http일 때 기본은 브라우저가 RealSense를 직접 연다(UI를 띄운 컴퓨터에 USB). 서버 MJPEG면 `VITE_DEVICE_RGB_SOURCE=mjpeg` |
| 왼팔·오른팔 카메라 | 목업 canvas | 장비 서버의 팔 카메라 영상 경로와 health 항목. 지금 http는 '연결하지 않았습니다'로 답하고, 장치 목록에는 없고 타일 이름표만 연결 상태를 말한다 |
| 로봇 실행 (`RunSource`) | 목업: 타이머로 동작 진행, E-STOP은 기록만 | 로봇 서버 실행 API(시작, 상태 스트림, 일시정지·재개·비상 정지). `HttpRunSource`는 자리만 |
| 실행 기록 | 브라우저 localStorage(`run`, `runHistory`): 표본·이벤트까지 | 서버가 실행 이벤트와 장비 값을 직접 쌓는다. 지금은 실행한 브라우저에서만 보고서를 만들 수 있다 |
| 보고서 (`ReportSource`) | 목업: 이번 실행 기록에서 만든 보고서, 예시 fixture(이전 레포의 발표용 기록) | `GET /runs/{id}/report`가 `RunReport`를 주면 된다. `HttpReportSource`는 구현돼 있다 |
| 에이전트 자율 판단 | 없음(예시 fixture에만 있다) | 로봇·LLM 서버가 감지·판단·실행·검증과 허용 범위를 실행 기록에 남겨야 보고서와 채팅이 '왜'에 답한다 |

## 서버 API 목록

서버를 다시 만드는 쪽이 맞출 목록이다. 요청·응답의 TypeScript 타입이 모양의 기준이다. '구현됨'은 http 어댑터가 이미 이 경로를 부른다는 뜻이고, '제안'은 어댑터가 아직 자리만 있어 이 앱이 기대하는 모양을 적은 것이다. 오류는 JSON 본문의 `detail`(또는 `error`)을 화면에 그대로 보인다.

### 그래프 DB 앞단 — `GraphSource` (제안)

모든 응답은 `GraphSnapshot`(`src/graph/model.ts`): Neo4j HTTP API graph 결과와 같은 `{nodes: [{id, labels, properties}], relationships: [{id, type, startNode, endNode, properties}]}`. 라벨별 `properties`는 같은 파일의 `*Props` 타입이다.

| 메서드 · 경로 | 요청 | 응답 |
| --- | --- | --- |
| `GET /graph` | — | 연구실 전체(인벤토리·보관 위치·장비·실험 템플릿·위험) |
| `POST /graph/search` | `NodeFilter`(라벨·속성·글자) | 찾은 노드와 그들끼리의 관계 |
| `POST /graph/nodes` | `{ids: string[]}` | 그 노드들과 그들끼리의 관계 |
| `POST /graph/neighborhood` | `{ids: string[], hops: number}` | hops 안의 서브그래프(방향 무시) |
| `PUT /drafts/{experimentId}` | 초안 서브그래프 | `{experimentId, graph, warnings}`. 초안의 USES·REQUIRES·HAS_HAZARD·PRODUCES는 통째로 바꾼다 |
| `POST /configs` | `{draftId, name, graph, acknowledgedHazards}` | `{id, confirmedAt}`. 확정 스냅샷. 지금은 브라우저에만 있다 |

### LLM — `ChatProvider` (구현됨)

| 메서드 · 경로 | 요청 | 응답 |
| --- | --- | --- |
| `POST /chat` | `ChatRequest`: `{messages: {role, content}[], state: {stage, draftGraph, confirmedGraphId, plan, runPlanVersion, telemetry, report}, action?: 'generate-plan'}` | `text/event-stream`. `data:` 한 줄에 `ChatEvent` 하나(JSON): `text-delta{text}`, `status{label}`, `graph{graph, mode: merge·replace, focus?}`, `plan{plan}`, `done`, `error{message}`. `done` 없이 끝나면 화면은 '연결이 끊겼다'고 보인다 |

- 실행 계획은 `plan` 이벤트의 `ExecutionPlan`(`src/domain/plan.ts`: 묶음 → 동작, `versions[]`에 버전마다 전체 목록과 요약). 실행을 시작한 뒤(`runPlanVersion`이 있으면) 서버도 계획 수정을 거절해야 한다.
- 실행 중에는 `state.telemetry`(최신 센서 값·열화상 대표값·장치 상태·진행), 보고서를 띄웠으면 `state.report`(`ReportBrief`)를 근거로 답한다. 없는 값을 지어내지 않는다.

### 장비 — `DeviceSource` (구현됨, 이전 장비 API 경로)

| 메서드 · 경로 | 응답 |
| --- | --- |
| `GET /health` | `DeviceHealth`: `sensors{connected, port, error, age_s}`, `thermal{…}`, `camera{available, opened, index, error}`(탑뷰), `rail{…}`, `arm{…}` |
| `GET /sensors` | `SensorReading`: `ph, ec, tds, temp, ts, age_s, stale` |
| `GET /thermal/stats` | `ThermalStats`: `t, min_c, max_c, mean_c, hotspot{x, y}`. 프레임이 없으면 오류 |
| `GET /thermal/rois` | `{rois: ThermalRoi[]}` |
| `POST /thermal/roi` | 요청 `{x, y, w, h, name?}`(160×120 센서 격자 좌표) → `ThermalRoi` |
| `DELETE /thermal/roi/{id}` | `{ok, id}` |
| `GET /thermal/roi/{id}/series.csv` | 영역 시계열 CSV |
| `GET /thermal/stream?fps=9&width=640&colormap=inferno` | 열화상 MJPEG |
| `GET /camera/stream?fps=10` | 탑뷰 MJPEG(`VITE_DEVICE_RGB_SOURCE=mjpeg`일 때. 기본은 브라우저가 RealSense를 직접 연다) |

아직 없는 것(제안): 팔 카메라 영상 `GET /camera/{left-arm|right-arm}/stream`과 `/health`의 카메라별 항목, 장비 인터록 비상 정지 `POST /estop`.

### 로봇 실행 — `RunSource` (제안)

| 메서드 · 경로 | 요청 | 응답 |
| --- | --- | --- |
| `POST /runs` | `StartRunRequest`: `{runId, planId, planVersion, graphSnapshotId, steps: {id, label}[]}` | `RunStatus`: `{runId, cursor, total, state: running·paused·done·stopped, updatedAt}`. `cursor`는 끝난 동작 수 |
| `GET /runs/{id}/events` | — | SSE. `data:` 한 줄에 `RunUpdate` `{status: RunStatus, event?: RunLogEntry{at, kind, message, by: user·system, cursor?}}` |
| `POST /runs/{id}/pause` · `/resume` | — | `RunStatus` |
| `POST /runs/{id}/estop` | — | `RunStatus`(state: stopped). 큐나 지연 주입을 거치지 않고 바로 멈춘다 |

### 실행 기록·보고서 — `ReportSource` (클라이언트 구현됨)

| 메서드 · 경로 | 응답 |
| --- | --- |
| `GET /runs/{id}/report` | `RunReport`(`src/domain/report.ts`). `meta.source`는 실측이면 `live` |

실행 기록(센서 표본·이벤트)은 지금 브라우저 localStorage에 있다. 서버가 실행 이벤트와 장비 값을 직접 쌓아 보고서를 만들면 화면은 바꿀 것이 없다.

## 디자인 리뷰

UI가 바뀐 단계를 마칠 때 화면을 캡처하고 동작 점검 스크립트(`.review/stage-N/capture.mjs`)를 돌려 모두 통과시킨다. 알면서 남긴 문제와 확인하지 못한 것은 여기에 남긴다.

5단계까지는 `apple-design-reviewer` 서브에이전트(`.claude/agents/apple-design-reviewer.md`)가 `apple-design` 스킬 기준으로 리뷰했다. Critical·High는 그 단계 안에서 고쳤고, 아래 1~5단계 기록이 그 결과다. 6단계부터는 사용자 결정으로 리뷰 에이전트를 쓰지 않는다. 디자인 판단이 필요하면 구현하면서 `apple-design` 스킬을 직접 참고한다.

스크린샷은 `npm run dev`를 띄운 뒤 찍는다. `.review/`는 git에 넣지 않는다.

```bash
npm run screenshot -- --out .review/stage-2/round-1 --path / --name landing
```

### 1단계: 토큰 계획

화면이 빈 셸이라 화면 리뷰 대신 토큰 계획을 사용자 승인 전에 리뷰했다. 3회.

| 라운드 | 결과 | 주요 지적 |
| --- | --- | --- |
| 1 | Needs work · High 3 · Medium 5 · Low 5 | 청람 서브그래프가 위험보다 무거움, 심각도 순서와 시각 무게가 반대, 모양이 노드 종류와 겹침 |
| 2 | Good · High 1 · Medium 2 · Low 2 | high·medium 노드가 서브그래프보다 가벼움, box-shadow 포커스가 강제 색상 모드에서 사라짐 |
| 3 | Good · Low 2 | 둘 다 반영(medium 1.5px, 문서 정합) |

남은 Medium·Low: 없음. 2·3단계 화면 리뷰에서 다시 볼 것: Pretendard의 화학식 첨자 렌더링, 그래프 렌더러 안 노드 포커스 링, 라이트에서 medium(1.5px) 대 서브그래프 노드(1px)의 실제 무게.

### 2단계: 채팅·첫 화면·작업 영역 셸

스크린샷 27장(라이트/다크 × 390/1440px, 구성·위험 답·스트리밍·중단·연결 끊김·새 대화 되돌리기·알아듣지 못한 요청·진입 전환 중간)과 코드를 함께 봤다. 동작 확인 10개(자동 포커스, 새로고침 복원, 뒤로가기, Shift+Enter, 되돌리기, 잠긴 탭 등)는 모두 통과.

| 라운드 | 결과 | 주요 지적 |
| --- | --- | --- |
| 1 | Good · High 1 · Medium 4 · Low 6 | 넓은 폭 첫 화면에서 숨긴 채팅 머리줄이 1행 높이를 차지해 제목·출처 표시를 덮음, 입력창 포커스가 1px 색 변화뿐, 선택 탭이 강제 색상 모드에서 사라짐, 목록에서 위험이 맨 앞이 아님 |
| 2 | Good · Low 3 | 2건 반영(좁은 폭 탭 한 줄, 주석) |

남은 Low:

- '알아듣지 못한 요청' 답의 예시 질문이 글자 목록이라 누를 수 없다. 빈 대화의 예시 칩과 같은 컴포넌트로 그리려면 ChatEvent에 제안 목록(예: `{type: 'suggestions'}`)을 더해야 해서, 인터페이스를 다시 볼 4단계(계획 수정 의도)에서 함께 정한다.

확인하지 못한 것: 강제 색상 모드 실물, 글자 200% 확대, 스크린 리더 실제 낭독. 시그니처(그래프가 줄어드는 진입 전환)는 그래프가 들어오는 3단계에서 판단한다.

### 3단계: 그래프 패널·진입 전환·구성 확정

스크린샷 34장(첫 화면, 초안, 호버, 진입 전환 중간·끝, 조회 결과, 키보드 포커스, 노드 진입, 노드·위험 상세, 위험만 보기, 목록, 확정 대화상자 전·후·차단, 확정 뒤 계획 자리, 새 초안, 인쇄, 390 상세·목록)과 코드를 봤다. 동작 확인 32개(호버 흐리기, 줌 한계, 드래그 고정, 진입 뒤 같은 SVG 인스턴스와 노드 좌표 불변, 방향키 이동, 노드 Enter 진입·자동 전송 없음, 물듦·위험 비물듦, 확정 흐름, 재고 차단, 확정 뒤 새 초안, 390 가로 스크롤 없음, 콘솔 오류 없음) 모두 통과.

| 라운드 | 결과 | 주요 지적 |
| --- | --- | --- |
| 1 | Good · High 1 · Medium 2 · Low 5 | 전체 보기에서 노드 글자가 최소 크기 아래(390에서 약 3px), 물든 엣지 덩어리가 high·medium 위험보다 무거움, 흐리기가 위험까지 지우고 진입 직후 의도치 않은 호버 |
| 2 | Good · Medium 2 · Low 2 | 점 모드에서 노드 종류가 안 보임, 엣지 이름표가 줌을 따라 작아짐 → 둘 다 반영(종류 태그, 엣지 이름표 화면 12px) |

시그니처 판단(리뷰어): 무채색 연구실 지도에서 위험만 신호색으로 떠 있다가, 실험을 구성하면 그 부분이 청람으로 물든다. 진입 때 같은 그래프가 노드 배치를 지킨 채 옆으로 줄어든다.

남은 Low:

- (3.5단계에서 해당 없음: 상자 노드·점 모드·청람 물듦을 없앴고, 맞춤은 이름표·웅덩이 자리까지 넣는다.) 점 모드에서 화면 가장자리의 이름표가 잘릴 수 있다(맞춤이 노드 좌표만 보고 이름표 폭은 보지 않는다).
- 점 모드에서 서브그래프 점 안의 옅은 청람 면은 거의 보이지 않는다. 물듦은 엣지와 점 테두리가 전한다(리뷰어 판단: 시그니처로 충분).
- 호버·선택 때 나오는 엣지 전체 이름표끼리, 또는 노드 이름표와 겹칠 수 있다. 같은 정보가 상세 패널과 목록에 있다.

확인하지 못한 것: 물듦 240ms 중간 장면, 모션 줄이기 상태의 진입, 스크린 리더 실제 낭독, 터치 핀치·드래그.


### 3.5단계: 디자인 다시 정하기(시안 F 이식)

3단계 뒤 사용자 피드백으로 배치·팔레트·그래프 표현·물리 효과를 다시 정했다('디자인 시안' 절). 사용자가 직접 정한 배치와 팔레트는 리뷰에서 다시 따지지 않고, 그 안의 접근성·일관성만 봤다. 스크린샷 31~35장(라이트/다크 × 1440/1024/390, 첫 화면, 초안, 호버, 끌기, 진입 전환 중간·끝, 조회 결과, 키보드 포커스, 노드 진입, 노드 상세(1440·1024·390), 위험만 보기, 목록, 확정 대화상자, 실행 계획, 동작 줄이기)과 코드를 봤다. 동작 확인 41개 모두 통과: 같은 SVG로 진입하고 진입 뒤 모든 노드가 보이는 영역 안, 끌면 움직이고 놓으면 제자리로, 초안의 매우 높음 이름표가 모든 폭에서 보임, 1024 상세가 그래프를 덮지 않음, 키보드 포커스에 설명 카드, 390 가로 스크롤 없음, 콘솔 오류 없음 등.

| 라운드 | 결과 | 주요 지적 |
| --- | --- | --- |
| 1 | Critical issues · Critical 3 · High 7 · Medium 9 · Low 7 | 히어로 위 글자·신호색 대비(흰 이름표 2.26, 칩 2.46~3.28, 빨강 2.45), 위험 카드 배지 대비(2.88~3.8), 그래프 이름표 9.6px, 그래프에서 위험이 가장 가벼운 표시, 위험만 보기 뒤 다시 맞추지 않음, 타일 켜짐이 색뿐, 호버 때 이름표 겹침, 포커스 고리가 고른 것 고리와 같음, 1280 아래에서 상세가 그래프를 덮음, 1024 입력창 잘림 |
| 2 | Needs work · High 3 · Medium 1 · Low 4 | 1차의 Critical 3·High 7은 해결 또는 부분 해결. 수정이 낳은 회귀: 진입 뒤 다시 맞추지 않음(맞춤 key가 같아 건너뜀), 매우 높음 이름표가 culling에 밀려 사라짐, 1024 상세에서 CAS·로트가 끊김 |
| 3 | Good · Medium 2 · Low 2 | 2차 지적 모두 해결. 남은 Medium 2건(설명 카드가 매우 높음을 덮음, 좁은 상세에서 '높음'이 쪼개짐)도 이 단계에서 고쳤다 |

시그니처 판단(리뷰어): 파란 히어로 위에 위험 스티커와 화학식 이름표가 떠 있는 그래프가, 진입하면 같은 인스턴스로 가운데 카드에 줄어들어 맞춰진다. 히어로의 위험 스티커(흰 원 + 라이트 신호색)는 첫째 규칙을 파란 면 위에서도 지키는 답이다.

남은 Low:

- 범례(종류 필터) 칩 하나만 다음 줄로 넘어가는 폭이 있다(1440 초안의 '위치 4' 등).
- 잠긴 단계의 이유('구성을 확정하면 열립니다')가 스크린 리더 설명에만 있다. 보는 사람은 자물쇠와 '(잠김)'만 본다.

받아들인 것: 진입 전환 600ms와 갱신 때 다시 데우기(alpha 0.25)는 모션을 줄이라는 지적과 사용자의 물리 효과 요청 사이의 절충이다.

확인하지 못한 것: 강제 색상 모드 실물, 글자 200% 확대, 스크린 리더 실제 낭독, 고른 노드 위 포커스 고리 구별(코드로만 확인), 진입 전환의 연속 움직임(프레임 두 장).

### 4단계: 실행 계획

스크린샷 27장과 코드를 봤다.
- 화면 조건: 라이트/다크 × 1440/1024/390.
- 장면: v1 생성 직후, '교반을 맨 뒤로' 뒤 v2, 근거 펼침(라이트·다크), 애매한 이름 되묻기, 05 삭제, v1으로 되돌림, 버전 기록(다크), 실행 시작 대화상자(1440·390), 모니터링 자리, 시작 뒤 잠김.

동작 확인 49개가 모두 통과했다.
- 확정하면 v1이 16동작으로 생긴다. 바뀐 동작은 옮긴 것 하나만 표시된다.
- 요약 줄과 바뀐 동작이 모든 폭에서 함께 보인다.
- 이름이 애매하면 번호로 되묻고 버전을 그대로 둔다. 되돌리기는 새 버전으로 쌓인다.
- Esc로는 실행이 시작되지 않는다. 시작한 뒤에는 계획이 잠기고 채팅 수정도 거절한다.
- 새로고침해도 실행 기록이 남는다.
- 확정·되돌리기·실행 시작 뒤 포커스가 보이는 제목이나 요약 줄로 간다.
- 390에서 가로 스크롤이 없고, 콘솔 오류도 없다.

| 라운드 | 결과 | 주요 지적 |
| --- | --- | --- |
| 1 | Good · High 2 · Medium 2 · Low 5 | 실행 시작 대화상자에 위험이 없고, 위험 카드는 막 뒤로 가려짐. 확정·되돌리기·실행 시작 뒤 포커스가 문서 처음으로 빠짐. 바뀐 동작으로 스크롤하면 무엇이 바뀌었는지 요약이 화면 밖으로 밀림. 다크에서 '바뀜' 막대 대비가 2.75:1 |
| 2 | Good · Medium 1 · Low 3 | 1차 지적 해결. 되돌리기 뒤 포커스가 스크롤로 밀려난 제목에 감 → 위에 붙은 요약 줄이 포커스를 받도록 고침. 실행 대화상자에 설명(위험·결과) 연결도 넣음 |

시그니처 판단(리뷰어): 계획 화면은 일부러 조용하다. 그라데이션·그림자·모션이 없다. 번호(01–16)는 실행 순서이면서 '05 삭제' 같은 채팅 명령의 주소다. 바뀐 동작은 면 + 막대 + '바뀜' 글자로 표시하고, 옮긴 것만 표시한다.

남은 Low:

- 목록(`ol`)에 `role="list"`를 달지 않았다. Safari VoiceOver는 `list-style: none`인 목록의 역할을 버리지만, oxlint `jsx-a11y/no-redundant-roles`가 막는다.
- 계획 동작과 위험이 이어져 있지 않다(예: '마개 개방' 옆에 관련 위험). 실행 직전 대화상자가 높음 이상의 위험을 다시 보여 주는 것으로 대신했다.

확인하지 못한 것: '실행 계획 만드는 중'과 생성 실패 화면의 실물(지연을 주입해 찍지 않았다), 다크의 실행 대화상자, `prefers-contrast: more`, 스크린 리더 실제 낭독.

### 5단계: 장비 피드와 실시간 모니터링

스크린샷 24장과 코드를 봤고, 리뷰어가 개발 서버에서 Playwright로 탭 순서·포커스·크기·reduced-motion을 직접 쟀다.
- 화면 조건: 라이트/다크 × 1440/1024/390, 실행 중 위·아래.
- 장면: 390 대화 쪽, 채팅 답, 일시정지, 실행 계획 탭의 비상 정지, 열화상 대화상자, 카메라 확대, 계획 진행 전체, 비상 정지 뒤, 대화상자 안 비상 정지, 보고서 자리, 완료.

동작 확인 62개가 모두 통과했다.
- 동작이 하나씩 진행되고, 목업 RGB·열화상 영상이 재생된다. 실행 기록에 표본이 쌓인다.
- 채팅으로 지금 pH와 지금 동작을 답한다.
- 일시정지 중에는 진행하지 않고, 키보드로 누르면 포커스가 같은 단추에 남는다.
- 열화상 영역: 끌어 그리기(영상 밖까지 끌어도 됨), 그냥 누름은 무시, 키보드로 가운데·최고점 둘레 추가, CSV, 삭제 뒤 포커스.
- 비상 정지는 모니터링 머리, 요약 열(다른 탭에서도), 대화상자 머리, 390 대화 쪽·작업 쪽에 있다.
- 비상 정지 뒤 포커스는 '지금' 줄로 가고, 스크린 리더 알림과 대화 줄이 남는다. 보고서 탭이 열린다.
- 새로고침해도 진행이 이어진다. 완료되면 포커스가 '보고서 보기'로 간다.
- 390 대화 쪽 위험 칩이 잘리지 않고, 가로 스크롤과 콘솔 오류가 없다.

| 라운드 | 결과 | 주요 지적 |
| --- | --- | --- |
| 1 | Critical issues · Critical 1 · High 2 · Medium 10 · Low 6 | 일시정지·비상 정지 뒤 포커스가 문서 처음으로 빠지고, 실행 상태 변화가 스크린 리더에 전달되지 않음. 비상 정지가 스크롤·다른 탭·대화상자·390 대화 쪽에서 안 보임. 비상 정지 실패 문구가 '로봇이 아직 움직일 수 있다'를 말하지 않음. 그 밖에 다크 진행 막대 2.58, 일시정지 중에도 '지금 하는 동작', 목업 값을 '측정값'으로 부름, 파랑·빨강의 뜻이 넓어짐, 열화상 키보드 대안이 가운데 하나뿐, 단추 간격 8px, 카메라가 추이 아래 |
| 2 | Good · High 1 · Medium 4 · Low 4 | 1차 지적 해결. 390 대화 쪽에 비상 정지를 넣으면서 위험 칩이 잘림(수정이 낳은 회귀). 자연 완료 때 포커스, 대화상자 머리 간격과 정지 확인, 지난 오류 상자가 남음, 일시정지 알림이 순번을 하나 틀림 |
| 3 | Critical·High 0 · Low 1 | 390 대화 쪽은 두 줄로 나눠 칩 네 개가 모두 보임. 남은 Low(390 pH 눈금 '7'의 위치)도 이 단계에서 고쳤다 |

시그니처 판단(리뷰어): 이 화면은 시그니처를 다시 꺼내지 않고 조용한 도구로 물러나 있다. 파랑은 '진행 중'에만, 빨강은 위험과 비상 정지에만 쓰고, 상태는 모양과 글자로 함께 가른다. pH 눈금 위의 점은 이 제품에만 있는 작은 장치다.

남은 것:

- 장치 상태 카드와 바닥 줄이 출처(목업 장비)와 동기화 주기를 두 번 말한다. 둘 다 두었다.
- 프롬프트의 '실험 종료 · 보고서 보기'는 '보고서 보기'로 줄였다. 이 단추는 실행을 끝내지 않고 보고서로 옮겨 갈 뿐이라, '종료'가 들어가면 실행을 멈추는 단추처럼 읽힌다.

확인하지 못한 것:
- 비상 정지 실패 화면의 실물. 목업 비상 정지는 실패 주입을 거치지 않아 코드로만 확인했다.
- 장치 오류·오래된 데이터 화면의 한글 실물. 리뷰어의 임시 서버가 글꼴 허용 목록 때문에 한글을 깨뜨렸다.
- 실제 RealSense 카메라와 장비 서버.
- 스크린 리더 실제 낭독.

### 5b단계: 모니터링 관제 화면

사용자 요청: 모니터링이 대시보드·관제 화면처럼 보이지 않는다. 오른쪽 요약 열(위험·실행·장치 상태)을 가운데 모니터링과 합치고, 모든 상태를 스크롤 없이 본다. 카메라는 탑뷰·왼팔·오른팔 셋이다. 리뷰 에이전트 없이 화면 점검으로 마쳤다(`.review/stage-5b/capture.mjs`, 작업 중 크기별 확인은 `quick.mjs`).

- 화면 조건: 라이트 1440×900·1280×800·1024×768·390×844, 다크 1440×900·390×844. 그 밖에 일시정지, 실행 계획 탭, 열화상, 카메라 확대, 전체 동작, 비상 정지 뒤, 보고서 자리, 완료.
- 동작 확인 95개가 모두 통과했다. 5단계 확인(진행, 채팅 답, 일시정지·재개 포커스, 열화상 영역, 비상 정지 포커스·알림·대화 줄, 새로고침 뒤 이어 받기, 완료 포커스)에 더해:
  - 1440·1280·1024에서 모니터링 카드가 넘치지 않는다(0px). 요약 열이 접히고, 위험 5건·장치 5개·로그가 카드 안에 있다.
  - 카메라 셋이 모두 재생되고 이름표가 탑뷰·왼팔·오른팔 순이다. 장치 목록에 '탑뷰 카메라'.
  - 경과 시간, 센서 칸 흐름선 넷, 센서 기록 표, 계획 진행(하는 중 하나 + 묶음 셋), 전체 동작 대화상자(16개).
  - 390에서 끝까지 내려도 머리의 비상 정지가 보인다. 끝나면 머리 단추가 '보고서 보기'가 된다.

남은 것:

- 사용자 요청으로 가운데 줄을 '왼쪽 센서 2×2 | 오른쪽 카메라(탑뷰 위, 왼팔·오른팔 아래)'로 바꿨다(처음에는 카메라 줄 아래 센서 네 칸이었다).
- 1024×768에서는 센서 2×2 칸이 낮아 흐름선이 접히고(값·이름·설명은 남는다) '열화상 · °C' 이름이 말줄임된다. 흐름은 '표로 보기'로 볼 수 있다.
- 카드 사이 구분이 약하다는 사용자 의견에 따라 화면 바탕(`--surface`)을 은은한 회색 `#F2F3F7`로 바꾸고 카드는 흰색으로 뒀다. 그래프·실행 계획·모니터링·보고서 모든 단계에 같이 적용된다.
  - 모니터링은 바깥 카드를 지우고 칸 하나하나(지금 띠·센서 넷·카메라·계획 진행·위험·장비 로그)를 회색 바탕 위의 흰 카드로 둔다. 머리(제목·비상 정지)는 바탕 위에 바로 놓인다.
  - 회색 바탕 위에서 `--control-border` `#8A92AE`가 2.78로 3:1 아래라 `#7D859F`(흰 카드 3.67, 회색 바탕 3.31)로 진하게 했다. 보조 글자는 회색 바탕 위 6.93.
  - 다크는 원래 바탕(`#05081A`)보다 카드(`#0B1129`)가 밝아 그대로 뒀다. 카메라 영상 바탕이 다크 화면 바탕과 같은 색이라 카메라 틀에 카드와 같은 테두리를 둔다.
  - 대비 높이기에서는 `--separator`가 `--control-border`가 되어 카드 테두리가 진해진다(이전과 같다).
- 1024×768에서는 아래 세 칸(계획 진행·위험·장비 로그)이 낮아 칸 안에서 넘긴다. 카드 자체는 넘치지 않고, 계획 진행은 지금 동작이, 위험은 가장 무거운 것이 맨 위라 먼저 보인다.
- 열화상 영상은 대시보드에 띄우지 않는다. 대표값 칸을 누르면 대화상자에서 연다(대역폭 규칙 그대로).
- 재고 카드는 모니터링 탭에서 보이지 않는다. 실행 중에는 바뀌지 않는 정보라 뺐다. 다른 탭에서는 그대로다.
- pH 0–14 눈금은 흐름선으로 바꿨다. 칸 높이를 줄이려고 하나만 남겼다.
- 장비 로그 칸은 `tabIndex`를 두지 않고 브라우저의 '넘치는 칸 키보드 포커스'(Chrome·Firefox)에 맡겼다. lint 규칙(비대화형 요소에 tabIndex 금지)과 맞추려는 것이다.

확인하지 못한 것:

- 높이가 40rem보다 낮은 넓은 창(예: 1440×640)은 한 줄 흐름으로 바뀐다. 이 크기는 찍지 않았다.
- Safari의 넘치는 칸 키보드 포커스.
- 실제 팔 카메라와 장비 서버의 카메라 경로.

### 6단계: 결과 보고서

리뷰 에이전트 없이 화면 점검으로 마쳤다(`.review/stage-6/capture.mjs`, 작업 중 확인은 `quick.mjs`). 동작 확인 68개가 모두 통과했다.

- 처음부터 끝까지 목업만으로: 질의 → 그래프 초안 → 구성 확정 → 계획 v1 → 채팅으로 계획 수정(v2) → 실행 → 완료 → 보고서. 보고서는 수정한 계획 v2 기준이다.
- 이번 실행 보고서: 출처 표시, 요약 열 접힘, 결과, 재료 3종(심각도 배지 + 문구), 없는 절은 그리지 않음, 절차(계획 묶음), 기록에 있는 지표 탭, 차트 aria 문장, 지표 탭 키보드 이동, 해석이 지표를 따라감, 목차 → 절 제목 포커스(주소 그대로).
- CSV: 파일명, BOM, CRLF, 단위가 붙은 열 이름과 사건 열, 끝 사건이 마지막 행에, 안내가 몇 초 뒤 사라짐. 예시 CSV 257행.
- 예시 보고서: 출처, 반응식·색 변화·에이전트 절, 257개 측정, 보정 구간 음영·사건선 둘·목표 85% 기준선, 범례의 시작 → 끝.
- 인쇄: beforeprint에 로그 펼침, afterprint에 되돌림, 겹침 차트와 해석 넷, 탭 차트·대화·레일 숨김, 지표마다 다른 선 모양.
- 비상 정지한 실행: 결과, 일시정지 구간, 비상 정지 세로선, 결론의 멈춘 동작.
- 채팅: '이 결과 요약해 줘', '왜 요오드를 추가했어?'(예시: 감지·판단·실행·검증 / 이번 실행: 판단 기록이 없다고 답함, 구성 변경으로 오인하지 않음), '왜 멈췄어?'(기록된 사건과 사용자 조작).
- 1440 다크·1024·390 라이트/다크: 차트가 칸 폭을 따르고, 390에서 시간축 눈금이 셋으로 준다. 가로 스크롤과 콘솔 오류가 없다.

남은 것:

- 보고서 탭도 요약 열을 접는다. 여덟 칸 재료 표와 차트에 폭이 필요하다. 위험은 재료 표의 심각도 배지로 남는다.
- 이번 실행 보고서에는 반응식·색 변화·에이전트 판단 절이 없고 해석은 수치만 옮긴다. 목업 로봇은 판단하지 않고, 목업 장비 값을 반응의 증거처럼 말하지 않기 위해서다. KPI에도 목표 대비가 없다(기록에 목표가 없다).
- 반응식은 고정폭 글꼴 대신 본문 글꼴로 쓴다. 고정폭 글꼴에는 한글이 없어 '보정 시' 같은 말이 깨지고, 아래첨자·이온 기호 간격이 무너졌다. 숫자 칸은 본문 글꼴의 고른 숫자 폭을 쓴다.
- 이전 보고서의 '01 / MATERIALS' 같은 절 번호와 영어 소제목은 옮기지 않았다. 목차가 같은 일을 한다.
- 보고서 화면은 보고서 탭을 열 때 불러온다(`React.lazy`, 82 kB). 첫 로딩 묶음은 640 kB로 Vite의 500 kB 경고가 남는다. 6단계 전부터 있던 것(React Aria 등)이고, 나눌지는 따로 정한다.

확인하지 못한 것:

- 실제 인쇄 대화상자와 PDF 페이지 나눔. 헤드리스에서 print 미디어로 바꾼 화면과 이벤트만 확인했다.
- Safari·Firefox의 `beforeprint`/`afterprint`.
- 스크린 리더 실제 낭독, 실제 서버의 보고서 응답.
