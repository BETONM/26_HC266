import {describe, expect, it} from 'vitest';
import type {GraphSnapshot} from '../graph/model';
import {applyGraphEvents, toChatEvent} from './events';
import {createSseParser} from './sse';
import type {ChatEvent} from './types';

describe('createSseParser', () => {
  it('줄 중간에서 끊긴 조각을 이어 붙인다', () => {
    const parser = createSseParser();
    expect(parser.push('data: {"type":"te')).toEqual([]);
    expect(parser.push('xt-delta"}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{event: 'message', data: '{"type":"text-delta"}'}]);
  });

  it('CRLF·CR 줄 끝, 여러 줄 data, event·id, 주석을 처리한다', () => {
    const parser = createSseParser();
    const out = parser.push(': keep-alive\r\nevent: chat\r\nid: 7\r\ndata: a\r\ndata: b\r\n\r\ndata: c\r\r\n');
    expect(out).toEqual([
      {event: 'chat', data: 'a\nb', id: '7'},
      {event: 'message', data: 'c', id: '7'},
    ]);
  });

  it('조각 경계에 걸친 CRLF를 줄 끝 두 번으로 세지 않는다', () => {
    const parser = createSseParser();
    expect(parser.push('data: x\r')).toEqual([]);
    expect(parser.push('\n\r\n')).toEqual([{event: 'message', data: 'x'}]);
  });

  it('BOM을 지우고, 빈 줄 없이 끝난 이벤트는 버린다', () => {
    const parser = createSseParser();
    expect(parser.push('﻿data: 1\n\ndata: 2')).toEqual([{event: 'message', data: '1'}]);
    expect(parser.end()).toEqual([]);
  });
});

describe('toChatEvent', () => {
  it('알맞은 이벤트만 통과시킨다', () => {
    expect(toChatEvent({type: 'text-delta', text: '안'})).toEqual({type: 'text-delta', text: '안'});
    expect(toChatEvent({type: 'text-delta', text: 3})).toBeNull();
    expect(toChatEvent({type: 'mystery'})).toBeNull();
    expect(toChatEvent('done')).toBeNull();
    expect(toChatEvent({type: 'error'})).toEqual({type: 'error', message: '알 수 없는 오류입니다.'});
  });

  it('graph 이벤트의 그래프를 검증하고 실측 출처를 단다', () => {
    const event = toChatEvent({
      type: 'graph',
      mode: 'merge',
      focus: ['a', 1],
      graph: {nodes: [{id: 'a', labels: ['Location'], properties: {name: 'A'}}, {id: 'b'}], relationships: []},
    });
    expect(event).toMatchObject({type: 'graph', mode: 'merge', focus: ['a'], graph: {source: 'live'}});
    expect(event?.type === 'graph' && event.graph.nodes).toHaveLength(1);
  });
});

describe('applyGraphEvents', () => {
  const location = (id: string, name = id) => ({id, labels: ['Location' as const], properties: {name}});
  const draftNode = {
    id: 'exp-draft-1',
    labels: ['Experiment' as const],
    properties: {name: '초안', description: '', kind: 'draft'},
  };
  const graph = (...nodes: GraphSnapshot['nodes']): GraphSnapshot => ({nodes, relationships: []});

  it('초안을 품은 이벤트는 초안으로, 나머지는 조회 결과로 보낸다', () => {
    const events: ChatEvent[] = [
      {type: 'graph', mode: 'replace', graph: graph(location('a')), focus: ['a']},
      {type: 'graph', mode: 'replace', graph: graph(draftNode, location('b')), focus: ['exp-draft-1']},
    ];
    const result = applyGraphEvents({draft: null, query: null}, events);
    expect(result.query?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(result.draft?.nodes.map((n) => n.id)).toEqual(['exp-draft-1', 'b']);
    expect(result.focus).toEqual(['a', 'exp-draft-1']);
  });

  it('merge는 기존 위에 덮고, 바뀐 id만 돌려준다', () => {
    const before = {draft: null, query: graph(location('a'), location('b'))};
    const result = applyGraphEvents(before, [
      {type: 'graph', mode: 'merge', graph: graph(location('b', 'B2'), location('c'))},
    ]);
    expect(result.query?.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(result.changedIds.sort()).toEqual(['b', 'c']);
  });

  it('replace에서 그대로인 항목은 바뀐 것으로 세지 않는다', () => {
    const before = {draft: graph(draftNode, location('a')), query: null};
    const result = applyGraphEvents(before, [{type: 'graph', mode: 'replace', graph: graph(draftNode, location('z'))}]);
    expect(result.changedIds).toEqual(['z']);
  });

  it('graph 이벤트가 없으면 그대로 둔다', () => {
    const before = {draft: null, query: graph(location('a'))};
    expect(applyGraphEvents(before, [{type: 'text-delta', text: '안녕'}, {type: 'done'}])).toMatchObject(before);
  });
});

describe('diffNodeIds', () => {
  it('없던 노드와 속성이 바뀐 노드만', async () => {
    const {diffNodeIds} = await import('./events');
    const a = {id: 'a', labels: ['Location' as const], properties: {name: 'A'}};
    const b = {id: 'b', labels: ['Location' as const], properties: {name: 'B'}};
    const b2 = {...b, properties: {name: 'B2'}};
    const c = {id: 'c', labels: ['Location' as const], properties: {name: 'C'}};
    expect(diffNodeIds({nodes: [a, b], relationships: []}, {nodes: [a, b2, c], relationships: []})).toEqual(['b', 'c']);
    expect(diffNodeIds(null, {nodes: [a], relationships: []})).toEqual(['a']);
  });
});
