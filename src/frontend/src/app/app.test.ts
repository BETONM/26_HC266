import {describe, expect, it} from 'vitest';
import {toBlocks} from '../chat/ui/MessageText';
import {createSafeStorage, type KeyValueStorage} from './storage';

describe('createSafeStorage', () => {
  it('저장소가 던지면 메모리로 옮겨 가고, 값은 그 탭 안에서 남는다', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const storage = createSafeStorage(() => broken);
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
    expect(storage.persistent()).toBe(false);
  });

  it('저장소를 얻는 것부터 막혀도 동작한다', () => {
    const storage = createSafeStorage(() => {
      throw new Error('localStorage is not available');
    });
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });

  it('정상 저장소는 그대로 쓴다', () => {
    const map = new Map<string, string>();
    const backing: KeyValueStorage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
    const storage = createSafeStorage(() => backing);
    storage.setItem('k', 'v');
    expect(map.get('k')).toBe('v');
    expect(storage.persistent()).toBe(true);
  });
});

describe('toBlocks', () => {
  it('빈 줄로 문단을, "- " 줄 묶음으로 목록을 나눈다', () => {
    expect(toBlocks('첫 문단\n둘째 줄\n\n- 가\n- 나\n\n끝')).toEqual([
      {kind: 'paragraph', lines: ['첫 문단', '둘째 줄']},
      {kind: 'list', items: ['가', '나']},
      {kind: 'paragraph', lines: ['끝']},
    ]);
  });

  it('스트리밍 중 반쯤 온 글도 깨지지 않는다', () => {
    expect(toBlocks('- 가\n-')).toEqual([{kind: 'list', items: ['가']}]);
    expect(toBlocks('')).toEqual([]);
  });
});

describe('groupForList', () => {
  it('위험 묶음을 맨 앞에, 그 안은 심각도가 높은 순으로 둔다', async () => {
    const {groupForList} = await import('../workspace/listOrder');
    const {createSeedGraph} = await import('../adapters/graph/seed');
    const groups = groupForList(createSeedGraph());
    expect(groups[0]?.label).toBe('Hazard');
    const severities = groups[0]!.nodes.map((n) => String(n.properties.severity));
    const rank = ['critical', 'high', 'medium', 'low'];
    expect([...severities].sort((a, b) => rank.indexOf(a) - rank.indexOf(b))).toEqual(severities);
    expect(severities[0]).toBe('critical');
  });
});

describe('toBlocks 스트리밍 중 꼬리', () => {
  it('마지막 줄이 "-" 하나면 아직 오는 목록 항목이라 그리지 않는다', () => {
    expect(toBlocks('시약\n- 가\n-')).toEqual([{kind: 'paragraph', lines: ['시약']}, {kind: 'list', items: ['가']}]);
  });
});

describe('applyViewFilter', () => {
  it('위험만 보기는 위험과 그 위험을 일으키는 노드를 남긴다', async () => {
    const {applyViewFilter, draftComponents} = await import('../workspace/viewFilter');
    const {createSeedGraph} = await import('../adapters/graph/seed');
    const {buildDraftGraph, draftFromTemplate} = await import('../domain/draft');
    const seed = createSeedGraph();
    const only = applyViewFilter(seed, {hiddenLabels: [], hazardsOnly: true});
    const labels = new Set(only.nodes.map((n) => n.labels[0]));
    expect(labels.has('Hazard')).toBe(true);
    expect(labels.has('Location')).toBe(false);
    expect(only.nodes.some((n) => n.id === 'chem-hcl')).toBe(true);
    // 숨긴 라벨은 빠지고, 양 끝이 남은 관계만 남는다.
    const noLoc = applyViewFilter(seed, {hiddenLabels: ['Location'], hazardsOnly: false});
    expect(noLoc.relationships.some((r) => r.type === 'STORED_AT')).toBe(false);
    // 초안 구성요소에는 위험이 없다.
    const draft = buildDraftGraph(seed, draftFromTemplate(seed, 'exp-clock', 'exp-draft-1')!);
    const parts = draftComponents(draft);
    expect(parts.has('chem-kio3')).toBe(true);
    expect([...parts].some((id) => id.startsWith('hz-'))).toBe(false);
  });
});
