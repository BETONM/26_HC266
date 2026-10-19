// 사용자가 부르는 이름을 그래프 노드에 맞춘다. 사람은 '요오드산 칼륨 수용액'을 '요오드산 칼륨'이나 'KIO3'로 부른다.

import type {GraphNode, GraphSnapshot, NodeLabel} from '../../../graph/model';

const SUFFIXES = [' 수용액', ' 지시약', ' 용액'];
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[₀-₉]/g, (d) => String(SUBSCRIPT_DIGITS.indexOf(d)))
    .replace(/\s+/g, '');

/** 노드를 부를 수 있는 이름들. 정규화(공백 제거·소문자·첨자 숫자)한 값이다. */
export function aliasesOf(node: GraphNode): string[] {
  const names = new Set<string>();
  const {name, english, formula, title} = node.properties;
  for (const value of [name, english, formula, title]) {
    if (typeof value !== 'string' || value.length === 0) continue;
    names.add(value);
    for (const suffix of SUFFIXES) if (value.endsWith(suffix)) names.add(value.slice(0, -suffix.length));
  }
  // '반응 비커'는 그냥 '비커'로도 부른다.
  if (typeof name === 'string' && name.startsWith('반응 ')) names.add(name.slice(3));
  // 화학식 한두 글자(H₂O 등)는 다른 말과 잘못 맞을 수 있어 3글자 이상만 쓴다.
  return [...names].map(normalize).filter((alias) => alias.length >= 2 && !(alias === normalize(String(formula)) && alias.length < 3));
}

export type Mention = {node: GraphNode; index: number; alias: string};

/**
 * 글에 나온 노드를 찾는다. 긴 이름부터 맞추고 이미 맞춘 자리는 다시 쓰지 않는다.
 * 그래야 '아황산 수소 나트륨'이 '나트륨'이 든 다른 시약과 함께 잡히지 않는다.
 */
export function findMentions(text: string, graph: GraphSnapshot, labels: readonly NodeLabel[]): Mention[] {
  const haystack = normalize(text);
  const candidates = graph.nodes
    .filter((node) => node.labels.some((label) => labels.includes(label)))
    .flatMap((node) => aliasesOf(node).map((alias) => ({node, alias})))
    .sort((a, b) => b.alias.length - a.alias.length);
  const taken: boolean[] = Array(haystack.length).fill(false);
  const found = new Map<string, Mention>();
  for (const {node, alias} of candidates) {
    let from = 0;
    for (let index = haystack.indexOf(alias, from); index !== -1; index = haystack.indexOf(alias, from)) {
      from = index + 1;
      if (taken.slice(index, index + alias.length).some(Boolean)) continue;
      for (let i = index; i < index + alias.length; i += 1) taken[i] = true;
      if (!found.has(node.id)) found.set(node.id, {node, index, alias});
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}
