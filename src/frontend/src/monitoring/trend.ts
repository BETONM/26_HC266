// 추이 그래프의 축과 선. 값 범위가 좁아도(pH 6.38~6.72) 움직임이 보이게 자동으로 잡되,
// 최소 폭을 두어 잡음이 큰 변화처럼 보이지 않게 한다.

export const TREND_POINTS = 30;

export type TrendRange = {min: number; max: number};

export function trendRange(values: readonly number[], minSpan: number): TrendRange | null {
  if (values.length === 0) return null;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (hi - lo < minSpan) {
    const mid = (lo + hi) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.1;
  return {min: lo - pad, max: hi + pad};
}

/** viewBox(width×height) 안의 꺾은선 점들. 값이 하나면 가운데 수평선. */
export function trendPoints(
  values: readonly number[],
  range: TrendRange,
  width: number,
  height: number,
): [number, number][] {
  if (values.length === 0) return [];
  const span = range.max - range.min || 1;
  const y = (v: number) => height - ((v - range.min) / span) * height;
  if (values.length === 1)
    return [
      [0, y(values[0]!)],
      [width, y(values[0]!)],
    ];
  return values.map((v, i) => [(i / (values.length - 1)) * width, y(v)]);
}
