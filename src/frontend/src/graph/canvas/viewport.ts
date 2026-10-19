// 그래프 화면 좌표 계산. 모두 순수 함수다.
// 화면 좌표 = 월드 좌표 × k + (tx, ty).

export type View = {k: number; tx: number; ty: number};
export type Size = {width: number; height: number};
export type Point = {x: number; y: number};
export type Bounds = {x0: number; y0: number; x1: number; y1: number};
/** 화면 가장자리에서 그래프가 피해야 할 여백. 첫 화면의 떠 있는 입력창 같은 것. */
export type Insets = {top: number; right: number; bottom: number; left: number};

export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3;
export const noInsets: Insets = {top: 0, right: 0, bottom: 0, left: 0};

const clampZoom = (k: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));

export const toScreen = (view: View, p: Point): Point => ({x: p.x * view.k + view.tx, y: p.y * view.k + view.ty});
export const toWorld = (view: View, p: Point): Point => ({x: (p.x - view.tx) / view.k, y: (p.y - view.ty) / view.k});

/** 화면의 한 점(커서)을 고정한 채 확대·축소한다. */
export function zoomAt(view: View, factor: number, at: Point): View {
  const k = clampZoom(view.k * factor);
  const f = k / view.k;
  return {k, tx: at.x - (at.x - view.tx) * f, ty: at.y - (at.y - view.ty) * f};
}

/** 경계 상자가 여백 안쪽에 다 들어오게 맞춘다. 너무 크게 키우지 않도록 maxK로 묶는다. */
export function fitBounds(bounds: Bounds, size: Size, insets: Insets = noInsets, maxK = 1.4): View {
  const availW = Math.max(1, size.width - insets.left - insets.right);
  const availH = Math.max(1, size.height - insets.top - insets.bottom);
  const w = Math.max(1, bounds.x1 - bounds.x0);
  const h = Math.max(1, bounds.y1 - bounds.y0);
  const k = clampZoom(Math.min(availW / w, availH / h, maxK));
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cy = (bounds.y0 + bounds.y1) / 2;
  return {k, tx: insets.left + availW / 2 - cx * k, ty: insets.top + availH / 2 - cy * k};
}

/**
 * 컨테이너 크기가 바뀌어도 기준점(포커스 노드나 화면 중심의 월드 좌표)이 화면에서 같은 비율 위치에 남게 한다.
 * 진입 전환 중에 매 프레임 fit을 다시 돌리면 노드가 흔들려 '같은 그래프가 줄어든다'는 느낌이 깨진다. 줌은 그대로 둔다.
 */
export function keepAnchor(view: View, from: Size, to: Size, anchor: Point): View {
  if (from.width <= 0 || from.height <= 0) return view;
  const screen = toScreen(view, anchor);
  const rx = screen.x / from.width;
  const ry = screen.y / from.height;
  return {k: view.k, tx: rx * to.width - anchor.x * view.k, ty: ry * to.height - anchor.y * view.k};
}

/** 점이 여백을 뺀 화면 밖이면, 가장 적게 움직여 margin 안쪽으로 들인다. 키보드로 화면 밖 노드에 갔을 때 쓴다. */
export function ensureVisible(view: View, size: Size, p: Point, margin: number, insets: Insets = noInsets): View {
  const s = toScreen(view, p);
  const minX = insets.left + margin;
  const maxX = size.width - insets.right - margin;
  const minY = insets.top + margin;
  const maxY = size.height - insets.bottom - margin;
  let dx = 0;
  let dy = 0;
  if (s.x < minX) dx = minX - s.x;
  else if (s.x > maxX) dx = maxX - s.x;
  if (s.y < minY) dy = minY - s.y;
  else if (s.y > maxY) dy = maxY - s.y;
  return dx === 0 && dy === 0 ? view : {k: view.k, tx: view.tx + dx, ty: view.ty + dy};
}

export function boundsOf(items: Array<Point & {halfWidth: number; halfHeight: number}>, pad = 24): Bounds | null {
  if (items.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const it of items) {
    x0 = Math.min(x0, it.x - it.halfWidth);
    x1 = Math.max(x1, it.x + it.halfWidth);
    y0 = Math.min(y0, it.y - it.halfHeight);
    y1 = Math.max(y1, it.y + it.halfHeight);
  }
  return {x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad};
}

/** 두 화면 상태 사이 보간. t는 0~1. */
export function lerpView(a: View, b: View, t: number): View {
  return {k: a.k + (b.k - a.k) * t, tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t};
}

/** 토큰 --ease-enter와 같은 곡선(cubic-bezier(0.2, 0.8, 0.2, 1))을 JS 애니메이션에서 쓰기 위한 근사. */
export function easeEnter(t: number): number {
  // 뉴턴법으로 x(u) = t인 u를 찾고 y(u)를 돌려준다.
  const [x1, y1, x2, y2] = [0.2, 0.8, 0.2, 1];
  const bez = (u: number, p1: number, p2: number) => 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3;
  const dBez = (u: number, p1: number, p2: number) =>
    3 * (1 - u) ** 2 * p1 + 6 * (1 - u) * u * (p2 - p1) + 3 * u ** 2 * (1 - p2);
  let u = t;
  for (let i = 0; i < 8; i += 1) {
    const d = dBez(u, x1, x2);
    if (Math.abs(d) < 1e-6) break;
    u -= (bez(u, x1, x2) - t) / d;
    u = Math.min(1, Math.max(0, u));
  }
  return bez(u, y1, y2);
}
