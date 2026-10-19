// 메시지 보내기·중단·재시도. 화면 컴포넌트는 이 함수들만 부르고 ChatProvider를 직접 다루지 않는다.

import {chatProvider, graphSource} from '../adapters';
import {applyGraphEvents, diffNodeIds, draftExperimentId} from '../chat/events';
import type {ChatAction, ChatEvent, ChatRequest, ChatTurn, ExecutionPlanEvent, TelemetrySnapshot} from '../chat/types';
import {draftName, snapshotId} from '../domain/confirm';
import {currentVersion, planProgress} from '../domain/plan';
import {reportBrief} from '../domain/report';
import {primaryThermalReading, deviceStatuses} from '../device/feed';
import {emptySession, useAppStore, type ChatMessage} from './store';

let active: {controller: AbortController; messageId: string} | null = null;
let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

export const isStreaming = () => active !== null;

function buildRequest(history: ChatMessage[], action?: ChatAction): ChatRequest {
  const state = useAppStore.getState();
  // 실패하거나 중단된 답은 LLM에게 다시 보이지 않는다. 반쯤 쓴 답이 다음 답을 흐리지 않게.
  // 화면 조작 줄(event)은 대화가 아니다. 그 사실은 state와 action으로 간다.
  const messages: ChatTurn[] = history
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'done'))
    .map((m) => ({role: m.role as ChatTurn['role'], content: m.text}));
  return {
    messages,
    state: {
      stage: state.stage,
      draftGraph: state.draftGraph,
      confirmedGraphId: state.confirmed?.id ?? null,
      plan: state.plan,
      runPlanVersion: state.run?.planVersion ?? null,
      telemetry: telemetrySnapshot(),
      report: shownReport(),
    },
    ...(action && {action}),
  };
}

/** 보고서 탭에서 띄운 보고서. 예시이거나 지금 실행의 것일 때만 싣는다(지난 실행의 보고서로 답하지 않게). */
function shownReport() {
  const {reportShown, run} = useAppStore.getState();
  if (!reportShown) return null;
  if (reportShown.meta.basis === 'run' && reportShown.meta.id !== run?.id) return null;
  return reportBrief(reportShown);
}

/** LLM이 '지금 pH 얼마야?', '지금 뭐 하는 중이야?'에 답할 수 있게 최신 장비 값과 진행을 싣는다. */
function telemetrySnapshot(): TelemetrySnapshot | null {
  const {telemetry, thermal, run, plan} = useAppStore.getState();
  if (!run && !telemetry.lastUpdated) return null;
  const groups = plan ? currentVersion(plan).groups : [];
  const progress = run ? planProgress(groups, run.cursor) : null;
  return {
    at: telemetry.lastUpdated,
    sensors: telemetry.sensors,
    sensorError: telemetry.sensorError,
    thermal: primaryThermalReading(thermal),
    devices: deviceStatuses(telemetry.health).map((d) => ({name: d.name, label: d.label})),
    run:
      run && progress
        ? {
            state: run.state,
            cursor: run.cursor,
            total: run.total,
            current: progress.active ? {order: progress.active.order, label: progress.active.label, group: `${progress.active.group.title} · ${progress.active.group.target}`} : null,
            next: progress.active ? (planProgress(groups, run.cursor + 1).active?.label ?? null) : null,
          }
        : null,
  };
}

async function stream(assistantId: string, history: ChatMessage[], action?: ChatAction) {
  const store = useAppStore.getState();
  const controller = new AbortController();
  active = {controller, messageId: assistantId};
  const graphEvents: ChatEvent[] = [];
  let finished = false;

  try {
    for await (const event of chatProvider.send(buildRequest(history, action), controller.signal)) {
      if (event.type === 'text-delta') {
        store.updateMessage(assistantId, (m) => ({...m, text: m.text + event.text}));
      } else if (event.type === 'status') {
        store.updateMessage(assistantId, (m) => ({...m, statusLabel: event.label}));
      } else if (event.type === 'graph' || event.type === 'plan') {
        graphEvents.push(event);
      } else if (event.type === 'error') {
        store.updateMessage(assistantId, (m) => ({...m, status: 'error', statusLabel: undefined, error: event.message}));
        finished = true;
        break;
      } else if (event.type === 'done') {
        // 응답이 끝났을 때만 그래프를 한 번에 반영한다. 실패·중단한 응답의 변경은 버린다.
        const current = useAppStore.getState();
        const applied = applyGraphEvents({draft: current.draftGraph, query: current.queryGraph}, graphEvents);
        // 확정 뒤 새 초안(다른 실험 id)이 오면 확정을 풀고 기록으로 옮긴다. 확정 스냅샷은 지우지 않는다.
        const newDraftId = applied.draft ? draftExperimentId(applied.draft) : null;
        const released = current.confirmed && newDraftId && newDraftId !== current.confirmed.draftId;
        const labGraph = current.lab.status === 'ready' ? current.lab.graph : null;
        const shownBefore = current.draftGraph ?? current.queryGraph ?? labGraph;
        const shownAfter = applied.draft ?? applied.query;
        const graphChanged = graphEvents.some((e) => e.type === 'graph');
        // 계획은 지금 확정한 구성의 것만 받는다. 실행을 시작한 뒤에 온 계획은 버린다(시작한 계획을 바꾸지 않는다).
        const planEvent = graphEvents.findLast((e): e is ExecutionPlanEvent => e.type === 'plan');
        const plan =
          planEvent && !released && current.confirmed && planEvent.plan.graphSnapshotId === current.confirmed.id && !current.run
            ? planEvent.plan
            : null;
        useAppStore.setState({
          draftGraph: applied.draft,
          queryGraph: applied.query,
          focusIds: applied.focus,
          changedIds: graphChanged && shownAfter ? diffNodeIds(shownBefore, shownAfter) : [],
          graphRevision: current.graphRevision + (graphChanged ? 1 : 0),
          // 계획이 바뀌면 계획 화면을 연다. 채팅으로 고친 결과를 바로 확인할 수 있게.
          ...(plan && {plan, stage: 'plan' as const}),
          ...(released && {
            confirmed: null,
            plan: null,
            run: null,
            runHistory: current.run ? [...current.runHistory, current.run] : current.runHistory,
            stage: 'graph' as const,
          }),
        });
        store.updateMessage(assistantId, (m) => ({...m, status: 'done', statusLabel: undefined}));
        finished = true;
        break;
      }
    }
    if (!finished) {
      store.updateMessage(assistantId, (m) => ({
        ...m,
        status: 'error',
        statusLabel: undefined,
        error: '응답이 중간에 끊겼습니다. 다시 시도해 주세요.',
      }));
    }
  } catch (error) {
    if (isAbort(error)) {
      store.updateMessage(assistantId, (m) => ({...m, status: 'stopped', statusLabel: undefined}));
    } else {
      const reason = error instanceof TypeError ? 'LLM 서버에 연결할 수 없습니다.' : error instanceof Error ? error.message : String(error);
      store.updateMessage(assistantId, (m) => ({...m, status: 'error', statusLabel: undefined, error: reason}));
    }
  } finally {
    if (active?.controller === controller) active = null;
  }
}

/** 메시지를 보낸다. 앞선 답이 아직 오는 중이면 보내지 않고 false를 돌려준다. */
export function sendMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || active) return false;
  const user: ChatMessage = {id: newId('u'), role: 'user', text: trimmed, status: 'done'};
  const assistant: ChatMessage = {id: newId('a'), role: 'assistant', text: '', status: 'streaming'};
  const state = useAppStore.getState();
  const history = [...state.messages, user];
  // 첫 화면에서 보낸 질문은 작업 화면 대화의 첫 메시지가 된다.
  useAppStore.setState({messages: [...history, assistant], undo: null, screen: 'workspace'});
  void stream(assistant.id, history);
  return true;
}

export function stopStreaming() {
  active?.controller.abort();
}

/** 실패·중단한 답을 같은 질문으로 다시 받는다. */
export function retry(assistantId: string) {
  if (active) return;
  const {messages} = useAppStore.getState();
  const index = messages.findIndex((m) => m.id === assistantId);
  if (index <= 0) return;
  const history = messages.slice(0, index);
  const {action} = messages[index]!;
  const fresh: ChatMessage = {id: newId('a'), role: 'assistant', text: '', status: 'streaming', ...(action && {action})};
  useAppStore.setState({messages: [...history, fresh, ...messages.slice(index + 1)]});
  void stream(fresh.id, history, action);
}

/** 대화와 초안을 비우고 첫 화면으로. 직전 세션은 되돌리기용으로 남긴다. */
export function newConversation() {
  stopStreaming();
  const {messages, draftGraph, queryGraph, confirmed, confirmedHistory, plan, run, runHistory} = useAppStore.getState();
  useAppStore.setState({
    ...emptySession(),
    undo: messages.length > 0 ? {messages, draftGraph, queryGraph, confirmed, confirmedHistory, plan, run, runHistory} : null,
    selectedNodeId: null,
    screen: 'landing',
    stage: 'graph',
    pane: 'chat',
    focusIds: [],
    changedIds: [],
  });
}

export function undoNewConversation() {
  const {undo} = useAppStore.getState();
  if (!undo) return;
  useAppStore.setState({...undo, undo: null, screen: 'workspace'});
}

// ── 그래프 ─────────────────────────────────────────────────────

let labRequest: AbortController | null = null;

/** 연구실 전체 그래프를 (다시) 불러온다. 첫 화면과 구성 확정 검증이 쓴다. */
export async function loadLabGraph() {
  labRequest?.abort();
  const controller = new AbortController();
  labRequest = controller;
  useAppStore.setState({lab: {status: 'loading'}});
  try {
    const graph = await graphSource.getAll(controller.signal);
    if (!controller.signal.aborted) useAppStore.setState({lab: {status: 'ready', graph}});
  } catch (error) {
    if (controller.signal.aborted) return;
    useAppStore.setState({lab: {status: 'error', message: error instanceof Error ? error.message : String(error)}});
  }
}

/** 입력창에 노드 참조를 넣고 포커스를 준다. 보내지는 않는다. */
export function insertReference(name: string) {
  const {composerText, composerFocusToken} = useAppStore.getState();
  const reference = `${name}에 대해 `;
  const text = composerText.trim().length === 0 ? reference : `${composerText.trimEnd()} ${reference}`;
  useAppStore.setState({composerText: text, composerFocusToken: composerFocusToken + 1});
}

/** 첫 화면에서 노드를 눌러 들어간다. 그 노드에 포커스하고 입력창에 참조를 넣어 둔다. 자동으로 보내지 않는다. */
export function enterFromNode(id: string, name: string) {
  const state = useAppStore.getState();
  useAppStore.setState({
    screen: 'workspace',
    selectedNodeId: id,
    focusIds: [id],
    graphRevision: state.graphRevision + 1,
    pane: 'chat',
  });
  insertReference(name);
}

// ── 구성 확정 ──────────────────────────────────────────────────

/**
 * 지금 초안을 확정한다. 그 시점의 그래프를 스냅샷으로 고정해 두고, 작업 영역을 실행 계획으로 넘긴다.
 * 검증(재고·위험 확인)은 확정 대화상자가 checkConfirmation으로 먼저 한다.
 */
export function confirmConfiguration(acknowledgedHazards: string[]) {
  const {draftGraph, confirmedHistory} = useAppStore.getState();
  if (!draftGraph) return;
  const draftId = draftExperimentId(draftGraph);
  if (!draftId) return;
  const confirmed = {
    id: snapshotId(draftGraph),
    draftId,
    name: draftName(draftGraph),
    graph: structuredClone(draftGraph),
    confirmedAt: new Date().toISOString(),
    acknowledgedHazards,
  };
  useAppStore.setState({
    confirmed,
    confirmedHistory: [...confirmedHistory, confirmed],
    plan: null,
    stage: 'plan',
    selectedNodeId: null,
  });
  addEvent(`구성 확정 · ${confirmed.name}`);
  requestPlan();
}

/** 대화 흐름에 화면 조작을 한 줄 남긴다. */
export function addEvent(text: string) {
  const event: ChatMessage = {id: newId('e'), role: 'event', text, status: 'done'};
  useAppStore.setState((s) => ({messages: [...s.messages, event]}));
}

// ── 실행 계획 ──────────────────────────────────────────────────

/**
 * 확정한 구성으로 실행 계획을 만들어 달라고 LLM에 요청한다. 답은 plan 이벤트로 온다.
 * 다른 답이 오는 중이면 보내지 않는다. 계획 화면의 '실행 계획 만들기'로 다시 요청할 수 있다.
 */
export function requestPlan(): boolean {
  const state = useAppStore.getState();
  if (active || !state.confirmed || state.run) return false;
  const assistant: ChatMessage = {id: newId('a'), role: 'assistant', text: '', status: 'streaming', action: 'generate-plan'};
  const history = state.messages;
  useAppStore.setState({messages: [...history, assistant]});
  void stream(assistant.id, history, 'generate-plan');
  return true;
}

