// 이름표가 서로 덮거나 다른 노드를 가리지 않게, 우선순위가 높은 것부터 자리를 차지하고 겹치는 것은 숨긴다.
// 위험이 언제나 먼저 남는다.

export type LabelBox = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  priority: number;
  /** 기본 자리가 막혔을 때 차례로 시도할 다른 중심(예: 노드 위). */
  alternatives?: readonly {x: number; y: number}[];
};

const overlaps = (a: LabelBox, b: LabelBox, gap: number) =>
  Math.abs(a.x - b.x) * 2 < a.width + b.width + gap * 2 && Math.abs(a.y - b.y) * 2 < a.height + b.height + gap * 2;

/**
 * 보일 이름표와 그 자리. 값은 쓴 자리의 번호(0 = 기본 자리, 1부터 alternatives).
 * x, y는 상자 중심(화면 px). 우선순위가 같으면 id 순으로 정해 결정적이다.
 * obstacles는 자리를 내주지 않는 것(노드 모양)이다. 자기 노드(같은 id)는 피하지 않는다.
 * 우선순위가 keepAbove 이상인 이름표(가리킨 노드, 매우 높은 위험)는 노드 모양을 덮어도 남긴다.
 */
export function placeLabels(
  boxes: readonly LabelBox[],
  gap = 2,
  obstacles: readonly LabelBox[] = [],
  keepAbove = Infinity,
): Map<string, number> {
  const order = [...boxes].sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : 1));
  const kept: LabelBox[] = [];
  const placed = new Map<string, number>();
  for (const box of order) {
    const spots = [{x: box.x, y: box.y}, ...(box.alternatives ?? [])];
    // 남길 이름표는 노드를 덮어도 되지만, 덮지 않는 자리가 있으면 그쪽을 먼저 쓴다.
    const free = (b: LabelBox, strict: boolean) =>
      !kept.some((k) => overlaps(k, b, gap)) && (!strict || !obstacles.some((o) => o.id !== b.id && overlaps(o, b, 0)));
    let index = spots.findIndex((p) => free({...box, ...p}, true));
    if (index < 0 && box.priority >= keepAbove) index = spots.findIndex((p) => free({...box, ...p}, false));
    if (index < 0) continue;
    kept.push({...box, ...spots[index]!});
    placed.set(box.id, index);
  }
  return placed;
}

/** 보일 이름표의 id(기본 자리만). */
export function cullLabels(
  boxes: readonly LabelBox[],
  gap = 2,
  obstacles: readonly LabelBox[] = [],
  keepAbove = Infinity,
): Set<string> {
  return new Set(
    placeLabels(
      boxes.map((b) => ({...b, alternatives: []})),
      gap,
      obstacles,
      keepAbove,
    ).keys(),
  );
}
