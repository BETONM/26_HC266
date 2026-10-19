// 키보드로 그래프를 돌아다닐 때, 방향키가 가리키는 쪽에서 가장 가까운 노드를 고른다.
// 순서대로 도는 Tab 대신 방향을 쓰는 이유: 그래프는 목록이 아니라 지도라서, 오른쪽 이웃은 오른쪽에 있어야 한다.

import type {Point} from './viewport';

export type Direction = 'up' | 'down' | 'left' | 'right';

const AXIS: Record<Direction, Point> = {
  up: {x: 0, y: -1},
  down: {x: 0, y: 1},
  left: {x: -1, y: 0},
  right: {x: 1, y: 0},
};

/**
 * 방향 쪽 ±60° 원뿔 안의 노드 중 점수가 가장 낮은 것. 점수는 거리에 옆으로 벗어난 만큼을 더 무겁게 더한다.
 * 원뿔 안에 아무도 없으면 null(제자리).
 */
export function nextInDirection(
  points: ReadonlyMap<string, Point>,
  fromId: string,
  direction: Direction,
): string | null {
  const from = points.get(fromId);
  if (!from) return null;
  const axis = AXIS[direction];
  let best: {id: string; score: number} | null = null;
  for (const [id, p] of points) {
    if (id === fromId) continue;
    const dx = p.x - from.x;
    const dy = p.y - from.y;
    const along = dx * axis.x + dy * axis.y;
    if (along <= 0) continue;
    const across = Math.abs(dx * axis.y - dy * axis.x);
    if (across > along * Math.tan(Math.PI / 3)) continue;
    const score = along + across * 2;
    if (!best || score < best.score || (score === best.score && id < best.id)) best = {id, score};
  }
  return best?.id ?? null;
}

/** 처음 그래프에 들어왔을 때 포커스할 노드: 왼쪽 위에서 가장 가까운 것. 읽는 순서와 같다. */
export function firstInReadingOrder(points: ReadonlyMap<string, Point>): string | null {
  let best: {id: string; score: number} | null = null;
  for (const [id, p] of points) {
    const score = p.y * 2 + p.x;
    if (!best || score < best.score) best = {id, score};
  }
  return best?.id ?? null;
}
