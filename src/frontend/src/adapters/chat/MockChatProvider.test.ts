import {describe, expect, it} from 'vitest';
import {applyGraphEvents} from '../../chat/events';
import type {ChatEvent, ChatRequest, ChatState} from '../../chat/types';
import type {GraphSnapshot} from '../../graph/model';
import {MockGraphSource} from '../graph/MockGraphSource';
import {createSeedGraph} from '../graph/seed';
import {MockChatProvider} from './MockChatProvider';

const baseState: ChatState = {stage: 'graph', draftGraph: null, confirmedGraphId: null, plan: null, runPlanVersion: null, telemetry: null};

async function collect(provider: MockChatProvider, text: string, state: Partial<ChatState> = {}, signal = new AbortController().signal) {
  const request: ChatRequest = {messages: [{role: 'user', content: text}], state: {...baseState, ...state}};
  const events: ChatEvent[] = [];
  for await (const event of provider.send(request, signal)) events.push(event);
  const answer = events.flatMap((e) => (e.type === 'text-delta' ? [e.text] : [])).join('');
  return {events, answer, graphs: applyGraphEvents({draft: null, query: null}, events)};
}

const newProvider = (seed?: GraphSnapshot) => new MockChatProvider(new MockGraphSource(seed ? {seed} : {}), {charDelayMs: 0});

describe('MockChatProvider 시나리오', () => {
  it('어떤 실험 할 수 있어? → 템플릿 3종과 준비 상태', async () => {
    const {answer, events} = await collect(newProvider(), '어떤 실험 할 수 있어?');
    expect(answer).toContain('3가지');
    expect(answer).toContain('녹말–아황산염 색 변화 실험');
    expect(answer).toContain('탄산 나트륨 수용액 부족(25 mL 필요, 15 mL 보유)');
    expect(answer).toContain('페놀프탈레인 지시약 만료');
    expect(events.at(-1)).toEqual({type: 'done'});
  });

  it('색 변화 실험 하고 싶어 → 초안 그래프와 요약', async () => {
    const {answer, graphs} = await collect(newProvider(), '색 변화 실험 하고 싶어');
    expect(answer).toContain('녹말–아황산염 색 변화 실험으로 실험 초안을 구성했습니다');
    expect(answer).toContain('매우 높음 1 · 높음 1 · 보통 2 · 낮음 1');
    expect(answer).toContain('재고는 모두 충분합니다');
    expect(graphs.draft?.nodes[0]).toMatchObject({id: 'exp-draft-1', properties: {kind: 'draft'}});
    expect(graphs.focus).toEqual(['exp-draft-1']);
  });

  it('요오드산 칼륨 얼마나 남았어? 어디 있어? → 보유량과 위치, 조회 결과 그래프', async () => {
    const {answer, graphs} = await collect(newProvider(), '요오드산 칼륨 얼마나 남았어? 어디 있어?');
    expect(answer).toContain('180 mL 남아 있고, 시약장 A · 산화제 칸에 있습니다');
    expect(graphs.draft).toBeNull();
    expect(graphs.query?.nodes.map((n) => n.id).sort()).toEqual(['chem-kio3', 'loc-oxidizer']);
  });

  it('시드를 바꾸면 답도 바뀐다', async () => {
    const seed = createSeedGraph();
    const kio3 = seed.nodes.find((n) => n.id === 'chem-kio3')!;
    kio3.properties.quantity = 42;
    const {answer} = await collect(newProvider(seed), '요오드산 칼륨 얼마나 남았어?');
    expect(answer).toContain('42 mL 남아 있고');
  });

  it('이 실험에서 위험한 건 뭐야? → 심각도순 위험과 대응', async () => {
    const provider = newProvider();
    const {graphs} = await collect(provider, '색 변화 실험 하고 싶어');
    const {answer} = await collect(provider, '이 실험에서 위험한 건 뭐야?', {draftGraph: graphs.draft});
    const order = ['[매우 높음] 이산화황', '[높음] 산화제 + 가연물', '[보통]', '[낮음] 요오드 착색'].map((s) => answer.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(answer).toContain('이 실험에서 섞여 생기는 위험');
    expect(answer).toContain('대응:');
  });

  it('증류수 10 mL 추가해 줘, 녹말 빼 줘 → 초안 갱신', async () => {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const added = await collect(provider, '증류수 10 mL 추가해 줘', {draftGraph: first.graphs.draft});
    expect(added.answer).toContain('증류수를 10 mL 추가했습니다');
    const uses = (g: GraphSnapshot | null) => g?.relationships.filter((r) => r.type === 'USES').map((r) => r.endNode);
    expect(uses(added.graphs.draft)).toContain('chem-water');
    const removed = await collect(provider, '녹말 빼 줘', {draftGraph: added.graphs.draft});
    expect(removed.answer).toContain('녹말 지시약을 뺐습니다');
    expect(uses(removed.graphs.draft)).not.toContain('chem-starch');
  });

  it('양을 늘리면 재고 부족을 짚는다', async () => {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const {answer} = await collect(provider, '요오드산 칼륨 200 mL로 바꿔 줘', {draftGraph: first.graphs.draft});
    expect(answer).toContain('요오드산 칼륨 수용액: 20 → 200 mL');
    expect(answer).toContain('요오드산 칼륨 수용액 부족(200 mL 필요, 180 mL 보유)');
  });

  it('인벤토리에 없는 시약은 넣지 않는다', async () => {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const {answer, graphs} = await collect(provider, '에탄올 10 mL 추가해 줘', {draftGraph: first.graphs.draft});
    expect(answer).toContain('에탄올은 인벤토리에 없어');
    expect(graphs.draft).toBeNull();
  });

  it('알아듣지 못한 요청 → 못 알아들었다는 답 + 예시, 그래프 변화 없음', async () => {
    const {answer, events} = await collect(newProvider(), '오늘 날씨 어때');
    expect(answer).toContain('알아듣지 못했습니다');
    expect(answer).toContain('어떤 실험 할 수 있어?');
    expect(events.some((e) => e.type === 'graph')).toBe(false);
  });

  it('초안 없이 수정하려 하면 바꾸지 않는다', async () => {
    const {answer, events} = await collect(newProvider(), '녹말 빼 줘');
    expect(answer).toContain('아직 구성 중인 실험이 없어');
    expect(events.some((e) => e.type === 'graph')).toBe(false);
  });

  it('같은 입력에는 같은 출력', async () => {
    const a = await collect(newProvider(), '색 변화 실험 하고 싶어');
    const b = await collect(newProvider(), '색 변화 실험 하고 싶어');
    expect(a.events).toEqual(b.events);
  });

  it('두 시약을 섞어도 되는지 답한다', async () => {
    const {answer} = await collect(newProvider(), '아황산 수소 나트륨이랑 염산 섞어도 돼?');
    expect(answer).toContain('섞지 마세요');
    expect(answer).toContain('[매우 높음] 이산화황(SO₂) 가스 발생');
  });
});

describe('MockChatProvider 스트리밍과 고장 주입', () => {
  it('글자 단위로 흘려보낸다', async () => {
    const provider = new MockChatProvider(new MockGraphSource(), {charDelayMs: 0, charsPerTick: 1});
    const {events} = await collect(provider, '오늘 날씨 어때');
    const deltas = events.filter((e) => e.type === 'text-delta');
    expect(deltas.length).toBeGreaterThan(20);
    expect(deltas.every((e) => e.type === 'text-delta' && Array.from(e.text).length === 1)).toBe(true);
  });

  it('중단하면 AbortError로 끝난다', async () => {
    const provider = new MockChatProvider(new MockGraphSource(), {charDelayMs: 5});
    const controller = new AbortController();
    const request: ChatRequest = {messages: [{role: 'user', content: '어떤 실험 할 수 있어?'}], state: baseState};
    const seen: ChatEvent[] = [];
    await expect(
      (async () => {
        for await (const event of provider.send(request, controller.signal)) {
          seen.push(event);
          if (event.type === 'text-delta') controller.abort();
        }
      })(),
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(seen.some((e) => e.type === 'done')).toBe(false);
  });

  it('주입한 실패는 error 이벤트로, 연결 끊김은 done 없이 끝난다', async () => {
    const failing = new MockChatProvider(new MockGraphSource(), {charDelayMs: 0, faults: {failEvery: 1}});
    expect((await collect(failing, '재고')).events).toEqual([{type: 'error', message: '목업에 주입한 실패입니다.'}]);

    const dropping = new MockChatProvider(new MockGraphSource(), {charDelayMs: 0, faults: {disconnectEvery: 1}});
    const {events} = await collect(dropping, '오늘 날씨 어때');
    expect(events.some((e) => e.type === 'text-delta')).toBe(true);
    expect(events.some((e) => e.type === 'done' || e.type === 'error')).toBe(false);
  });

  it('그래프 조회가 실패하면 error 이벤트를 낸다', async () => {
    const provider = new MockChatProvider(new MockGraphSource({faults: {failEvery: 1}}), {charDelayMs: 0});
    const {events} = await collect(provider, '재고');
    expect(events.at(-1)).toMatchObject({type: 'error', message: expect.stringContaining('답을 만들지 못했습니다')});
  });
});

describe('확정 뒤', () => {
  it('구성을 바꾸려 하면 바꾸지 않고 새 초안을 만들지 묻는다', async () => {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const {answer, events} = await collect(provider, '녹말 빼 줘', {draftGraph: first.graphs.draft, confirmedGraphId: 'cfg-1'});
    expect(answer).toContain('새 초안을 만들까요?');
    expect(events.some((e) => e.type === 'graph')).toBe(false);
  });

  it('새 초안 만들어 줘 → 번호가 하나 큰 초안', async () => {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const {graphs, answer} = await collect(provider, '새 초안 만들어 줘', {draftGraph: first.graphs.draft, confirmedGraphId: 'cfg-1'});
    expect(answer).toContain('새 초안을 만들었습니다');
    expect(graphs.draft?.nodes[0]?.id).toBe('exp-draft-2');
  });

  it('확정 전에는 새 초안을 따로 만들지 않는다', async () => {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const {events} = await collect(provider, '새 초안 만들어 줘', {draftGraph: first.graphs.draft});
    expect(events.some((e) => e.type === 'graph')).toBe(false);
  });
});

describe('실행 계획', () => {
  async function planned() {
    const provider = newProvider();
    const first = await collect(provider, '색 변화 실험 하고 싶어');
    const state = {...baseState, stage: 'plan' as const, draftGraph: first.graphs.draft, confirmedGraphId: 'cfg-1'};
    const events: ChatEvent[] = [];
    const request: ChatRequest = {
      messages: [{role: 'user', content: '색 변화 실험 하고 싶어'}],
      state,
      action: 'generate-plan',
    };
    for await (const event of provider.send(request, new AbortController().signal)) events.push(event);
    const plan = events.find((e) => e.type === 'plan');
    if (plan?.type !== 'plan') throw new Error('계획 없음');
    return {
      provider,
      state: {...state, plan: plan.plan},
      answer: events.flatMap((e) => (e.type === 'text-delta' ? [e.text] : [])).join(''),
    };
  }

  it('확정 직후 generate-plan 요청에 v1 계획을 낸다', async () => {
    const {state, answer} = await planned();
    expect(state.plan).toMatchObject({version: 1, graphSnapshotId: 'cfg-1'});
    expect(answer).toContain('3묶음 16동작');
    expect(answer).toContain('- 01–08 시약 분주 · 녹말 지시약');
  });

  it('채팅으로 고치면 새 버전을 낸다', async () => {
    const {provider, state} = await planned();
    const {events, answer} = await collect(provider, '교반을 맨 뒤로', state);
    expect(events.find((e) => e.type === 'plan')).toMatchObject({plan: {version: 2}});
    expect(answer).toContain('13 반응 비커 교반을 맨 뒤로 옮겼습니다. 이제 16번입니다');
  });

  it('실행을 시작한 뒤에는 계획을 바꾸지 않는다', async () => {
    const {provider, state} = await planned();
    const {events, answer} = await collect(provider, '05 삭제', {...state, runPlanVersion: 1});
    expect(events.some((e) => e.type === 'plan')).toBe(false);
    expect(answer).toContain('v1 계획으로 이미 시작해서');
  });

  it('확정 전에는 계획을 만들지 않는다', async () => {
    const provider = newProvider();
    const request: ChatRequest = {messages: [], state: baseState, action: 'generate-plan'};
    const events: ChatEvent[] = [];
    for await (const event of provider.send(request, new AbortController().signal)) events.push(event);
    expect(events.some((e) => e.type === 'plan')).toBe(false);
  });
});
