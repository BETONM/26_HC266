import {describe, expect, it} from 'vitest';
import {createSeedGraph} from '../../graph/seed';
import {classifyIntent} from './intent';
import {withParticle} from './korean';
import {findMentions} from './names';

const seed = createSeedGraph();
const mentionIds = (text: string) => findMentions(text, seed, ['Chemical', 'Equipment', 'Device']).map((m) => m.node.id);
const intentOf = (text: string) => classifyIntent(text, {mentionsInventory: mentionIds(text).length > 0}).kind;

describe('findMentions', () => {
  it('줄임 이름·화학식·띄어쓰기 차이로도 찾는다', () => {
    expect(mentionIds('요오드산 칼륨 얼마나 남았어')).toEqual(['chem-kio3']);
    expect(mentionIds('KIO3 어디 있어')).toEqual(['chem-kio3']);
    expect(mentionIds('아황산수소나트륨이랑 염산')).toEqual(['chem-nahso3', 'chem-hcl']);
    expect(mentionIds('녹말 빼 줘')).toEqual(['chem-starch']);
    expect(mentionIds('비커 몇 개 있어')).toEqual(['eq-beaker-100']);
  });

  it('긴 이름이 짧은 이름을 먼저 차지한다', () => {
    // '탄산 나트륨'이 '아황산 수소 나트륨' 안의 '나트륨'과 겹쳐 잡히지 않아야 한다.
    expect(mentionIds('아황산 수소 나트륨 수용액')).toEqual(['chem-nahso3']);
  });
});

describe('classifyIntent', () => {
  it.each([
    ['어떤 실험 할 수 있어?', 'explore'],
    ['색 변화 실험 하고 싶어', 'compose'],
    ['요오드산 칼륨 얼마나 남았어? 어디 있어?', 'inventory'],
    ['재고 보여 줘', 'inventory'],
    ['이 실험에서 위험한 건 뭐야?', 'hazard'],
    ['아황산 수소 나트륨이랑 염산 섞어도 돼?', 'hazard'],
    ['증류수 10 mL 추가해 줘', 'modify'],
    ['녹말 빼 줘', 'modify'],
    ['요오드산 칼륨 30 mL로 바꿔 줘', 'modify'],
    ['교반을 맨 뒤로', 'plan-edit'],
    ['오늘 날씨 어때', 'unknown'],
    ['', 'unknown'],
  ])('%s → %s', (text, kind) => {
    expect(intentOf(text)).toBe(kind);
  });

  it('양을 mL로 읽고 L는 바꿔 준다', () => {
    expect(classifyIntent('증류수 0.5 L 추가', {mentionsInventory: true})).toMatchObject({op: 'add', amount: 500, unit: 'mL', nameText: '증류수'});
    expect(classifyIntent('녹말 빼', {mentionsInventory: true})).toMatchObject({op: 'remove'});
  });

  it('인벤토리 이름도 양도 없는 빼기는 변경으로 보지 않는다', () => {
    expect(classifyIntent('그거 빼 줘', {mentionsInventory: false}).kind).not.toBe('modify');
  });
});

describe('withParticle', () => {
  it('받침에 맞는 조사를 고른다', () => {
    expect(withParticle('증류수', '은/는')).toBe('증류수는');
    expect(withParticle('녹말', '을/를')).toBe('녹말을');
    expect(withParticle('요오드산 칼륨 수용액(KIO₃, 0.04 M)', '은/는')).toBe('요오드산 칼륨 수용액(KIO₃, 0.04 M)은');
    expect(withParticle('20', '이/가')).toBe('20이');
    expect(withParticle('실험', '으로/로')).toBe('실험으로');
    expect(withParticle('반응물', '으로/로')).toBe('반응물로');
    expect(withParticle('ABC', '은/는')).toBe('ABC은(는)');
  });
});
