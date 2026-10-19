import {create} from 'zustand';
import {createJSONStorage, persist} from 'zustand/middleware';
import type {ChatAction, WorkStage} from '../chat/types';
import type {ExecutionPlan} from '../domain/plan';
import type {RunReport} from '../domain/report';
import type {RunRecord} from '../domain/run';
import {initialTelemetry, initialThermal, type TelemetryState, type ThermalState} from '../device/feed';
import type {GraphSnapshot, NodeLabel} from '../graph/model';
import {browserStorage} from './storage';

export type MessageStatus = 'streaming' | 'done' | 'error' | 'stopped';

export type ChatMessage = {
  id: string;
  /** 'event'는 대화가 아니라 화면 조작(구성 확정, 실행 시작)을 대화 흐름에 남기는 한 줄이다. LLM에게는 보내지 않는다. */
  role: 'user' | 'assistant' | 'event';
  text: string;
  status: MessageStatus;
  /** 스트리밍 중 'status' 이벤트의 최신 문구. */
  statusLabel?: string;
  error?: string;
  /** 화면 조작이 시킨 답이면 그 요청. 다시 시도할 때 같은 요청을 보낸다. */
  action?: ChatAction;
};

/** 구성 확정 때 고정해 둔 그래프. 이후의 실행 계획과 보고서는 이것을 기준으로 한다. */
export type ConfirmedConfig = {
  id: string;
  draftId: string;
  name: string;
  graph: GraphSnapshot;
  confirmedAt: string;
  /** 확정 전에 하나씩 '확인함'을 누른 high·critical 위험 id. */
  acknowledgedHazards: string[];
};

export type {RunRecord};

/** 새로고침해도 남기는 것. '새 대화'를 되돌릴 때도 이 단위로 되살린다. */
export type Session = {
  messages: ChatMessage[];
  draftGraph: GraphSnapshot | null;
  queryGraph: GraphSnapshot | null;
  confirmed: ConfirmedConfig | null;
  /** 지난 확정 기록. 확정을 풀고 새 초안을 만들어도 남는다. */
  confirmedHistory: ConfirmedConfig[];
  /** 지금 확정한 구성의 실행 계획. 확정을 풀면 비운다. */
  plan: ExecutionPlan | null;
  /** 지금 구성의 실행(진행 중이거나 끝난 것). 센서 표본과 이벤트를 쌓는다. 보고서의 입력이다. */
  run: RunRecord | null;
  /** 확정을 풀거나 새 대화로 넘어가며 내려놓은 지난 실행 기록. */
  runHistory: RunRecord[];
};

export type Screen = 'landing' | 'workspace';
export type NarrowPane = 'chat' | 'work';
export type GraphViewMode = 'graph' | 'list';

export type LabGraphState = {status: 'loading'} | {status: 'ready'; graph: GraphSnapshot} | {status: 'error'; message: string};

type AppState = Session & {
  screen: Screen;
  stage: WorkStage;
  pane: NarrowPane;
  /** 마지막 응답이 가리킨 노드와 새로 생기거나 바뀐 노드. */
  focusIds: string[];
  changedIds: string[];
  /** 그래프를 다시 맞출 때마다 늘린다. 그래프 그림이 이 값으로 맞춤 요청을 구분한다. */
  graphRevision: number;
  /** '새 대화' 직전의 세션. 되돌리기용이고 저장하지 않는다. */
  undo: Session | null;
  /** 입력창 글. 첫 화면과 작업 화면이 같은 입력창을 쓰고, 노드 참조를 미리 넣기도 한다. */
  composerText: string;
  /** 늘어나면 입력창이 포커스를 가져간다. */
  composerFocusToken: number;
  /** 연구실 전체 그래프(인벤토리). 첫 화면과 확정 검증이 쓴다. */
  lab: LabGraphState;
  selectedNodeId: string | null;
  graphViewMode: GraphViewMode;
  hiddenLabels: NodeLabel[];
  hazardsOnly: boolean;
  /** 최신 장비 피드. 저장하지 않는다(새로고침하면 다시 받는다). */
  telemetry: TelemetryState;
  thermal: ThermalState;
  /** 보고서 탭이 보여 줄 것: 이번 실행 또는 예시(fixture). 둘은 섞지 않는다. */
  reportView: 'run' | 'example';
  /** 화면에 그린 보고서. 채팅이 '이 결과 요약해 줘'에 답할 때 쓴다. 저장하지 않는다(다시 만든다). */
  reportShown: RunReport | null;
  setScreen(screen: Screen): void;
  setStage(stage: WorkStage): void;
  setPane(pane: NarrowPane): void;
  patch(partial: Partial<AppState>): void;
  updateMessage(id: string, update: (message: ChatMessage) => ChatMessage): void;
};

export const emptySession = (): Session => ({
  messages: [],
  draftGraph: null,
  queryGraph: null,
  confirmed: null,
  confirmedHistory: [],
  plan: null,
  run: null,
  runHistory: [],
});

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...emptySession(),
      screen: 'landing',
      stage: 'graph',
      pane: 'chat',
      focusIds: [],
      changedIds: [],
      graphRevision: 0,
      undo: null,
      composerText: '',
      composerFocusToken: 0,
      lab: {status: 'loading'},
      selectedNodeId: null,
      graphViewMode: 'graph',
      hiddenLabels: [],
      hazardsOnly: false,
      telemetry: initialTelemetry,
      thermal: initialThermal,
      reportView: 'run',
      reportShown: null,
      setScreen: (screen) => set((state) => ({screen, graphRevision: state.graphRevision + 1})),
      setStage: (stage) => set({stage}),
      setPane: (pane) => set({pane}),
      patch: (partial) => set(partial),
      updateMessage: (id, update) => set((state) => ({messages: state.messages.map((m) => (m.id === id ? update(m) : m))})),
    }),
    {
      name: 'chembot.session.v1',
      storage: createJSONStorage(() => browserStorage),
      partialize: (state): Session => ({
        messages: state.messages,
        draftGraph: state.draftGraph,
        queryGraph: state.queryGraph,
        confirmed: state.confirmed,
        confirmedHistory: state.confirmedHistory,
        plan: state.plan,
        run: state.run,
        runHistory: state.runHistory,
      }),
      // 스트리밍 중에 새로고침하면 그 답은 끝나지 않는다. 다시 시도할 수 있게 '중단됨'으로 되살린다.
      merge: (persisted, current) => {
        const session = (persisted ?? {}) as Partial<Session>;
        const messages = (session.messages ?? []).map((m) =>
          m.status === 'streaming' ? {...m, status: 'stopped' as const, statusLabel: undefined} : m,
        );
        const confirmed = session.confirmed ?? null;
        const run = session.run ?? null;
        return {
          ...current,
          messages,
          draftGraph: session.draftGraph ?? null,
          queryGraph: session.queryGraph ?? null,
          confirmed,
          confirmedHistory: session.confirmedHistory ?? [],
          plan: session.plan ?? null,
          run,
          runHistory: session.runHistory ?? [],
          screen: messages.length > 0 ? 'workspace' : 'landing',
          stage: run ? 'monitoring' : confirmed ? 'plan' : 'graph',
        };
      },
    },
  ),
);
