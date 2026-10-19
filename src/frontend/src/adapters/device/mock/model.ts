// 목업 장비의 '물리'. 모두 순수 함수라 같은 시각·진행이면 같은 값이 나온다.
// 센서 곡선은 이전 레포 experimentReportData.ts의 anchors(색 변화 실험 한 번의 실측 모양)를 따른다.

import {THERMAL_SENSOR_HEIGHT, THERMAL_SENSOR_WIDTH, type ThermalSample, type ThermalStats} from '../types';

type Anchor = {second: number; ec: number; color: number; ph: number; temperature: number};

const ANCHORS: Anchor[] = [
  {second: 0, ec: 842, color: 0.8, ph: 6.72, temperature: 23.4},
  {second: 60, ec: 906, color: 2.4, ph: 6.64, temperature: 23.5},
  {second: 120, ec: 974, color: 7.2, ph: 6.57, temperature: 23.7},
  {second: 180, ec: 998, color: 11.8, ph: 6.53, temperature: 23.8},
  {second: 200, ec: 1002, color: 12, ph: 6.52, temperature: 23.8},
  {second: 222, ec: 1004, color: 12.2, ph: 6.52, temperature: 23.8},
  {second: 238, ec: 1058, color: 46, ph: 6.46, temperature: 23.9},
  {second: 248, ec: 1092, color: 72, ph: 6.42, temperature: 24},
  {second: 256, ec: 1116, color: 84.2, ph: 6.4, temperature: 24.1},
  {second: 258, ec: 1120, color: 86.1, ph: 6.4, temperature: 24.1},
  {second: 288, ec: 1132, color: 93.4, ph: 6.38, temperature: 24.2},
  {second: 360, ec: 1138, color: 93.8, ph: 6.37, temperature: 24.15},
  {second: 440, ec: 1134, color: 93.2, ph: 6.39, temperature: 24.1},
  {second: 512, ec: 1136, color: 93.4, ph: 6.38, temperature: 24.1},
];

/** 실측 한 번의 길이(초). 목업 실행의 진행(0~1)을 이 시간축에 펼친다. */
export const REACTION_SECONDS = ANCHORS.at(-1)!.second;

export type Chemistry = {ec: number; ph: number; temperature: number; tds: number; color: number};

/** 반응 시각(초)의 센서 값. 앵커 사이는 직선으로 잇는다. TDS는 전도도의 0.5배로 어림한다. */
export function chemistryAt(second: number): Chemistry {
  const s = Math.min(REACTION_SECONDS, Math.max(0, second));
  const upper = ANCHORS.findIndex((a) => a.second >= s);
  const end = ANCHORS[Math.max(upper, 0)]!;
  const start = ANCHORS[Math.max(upper - 1, 0)]!;
  const f = end.second === start.second ? 0 : (s - start.second) / (end.second - start.second);
  const lerp = (k: keyof Omit<Anchor, 'second'>) => start[k] + (end[k] - start[k]) * f;
  const ec = lerp('ec');
  return {ec, ph: lerp('ph'), temperature: lerp('temperature'), tds: ec * 0.5, color: lerp('color')};
}

/** 측정 잡음. 난수 대신 시각의 사인 합이라 같은 시각이면 같은 값이다. */
export function jitter(t: number, scale: number, seed = 0): number {
  return scale * (0.6 * Math.sin(t * 1.7 + seed) + 0.4 * Math.sin(t * 4.3 + seed * 2.1));
}

// ── 열화상 ─────────────────────────────────────────────────

export type ThermalField = {width: number; height: number; values: Float32Array};

/**
 * 센서 격자(160×120)의 온도. 바탕(실온)에 반응 비커가 있고, 교반기·로봇팔 끝처럼 움직이는 열점이 하나 돈다.
 * t는 벽시계 초(열점 움직임), temperature는 지금 반응 용액 온도다.
 */
export function thermalField(t: number, temperature: number): ThermalField {
  const width = THERMAL_SENSOR_WIDTH;
  const height = THERMAL_SENSOR_HEIGHT;
  const values = new Float32Array(width * height);
  const ambient = temperature - 1.6;
  const hx = 80 + 34 * Math.sin(t * 0.55);
  const hy = 62 + 22 * Math.cos(t * 0.37);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dBeaker = Math.hypot((x - 80) / 34, (y - 72) / 30);
      const beaker = dBeaker < 1 ? (temperature - ambient) * (1 - dBeaker ** 4) : 0;
      const dHot = ((x - hx) ** 2 + (y - hy) ** 2) / (2 * 7 ** 2);
      const hot = 9 * Math.exp(-dHot);
      values[y * width + x] = ambient + beaker + hot + jitter(t + x * 0.13 + y * 0.07, 0.08);
    }
  }
  return {width, height, values};
}

export function fieldStats(field: ThermalField, t: number): ThermalStats {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let hotspot = {x: 0, y: 0};
  for (let i = 0; i < field.values.length; i += 1) {
    const v = field.values[i]!;
    sum += v;
    if (v < min) min = v;
    if (v > max) {
      max = v;
      hotspot = {x: i % field.width, y: Math.floor(i / field.width)};
    }
  }
  const round = (v: number) => Number(v.toFixed(2));
  return {t, min_c: round(min), max_c: round(max), mean_c: round(sum / field.values.length), hotspot};
}

/** 사각형 영역의 평균·최저·최고. 격자 밖은 잘라 낸다. */
export function regionSample(
  field: ThermalField,
  roi: {x: number; y: number; w: number; h: number},
  t: number,
): ThermalSample {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, roi.y); y < Math.min(field.height, roi.y + roi.h); y += 1) {
    for (let x = Math.max(0, roi.x); x < Math.min(field.width, roi.x + roi.w); x += 1) {
      const v = field.values[y * field.width + x]!;
      sum += v;
      count += 1;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const round = (v: number) => Number(v.toFixed(2));
  return count === 0
    ? {t, mean_c: NaN, min_c: NaN, max_c: NaN}
    : {t, mean_c: round(sum / count), min_c: round(min), max_c: round(max)};
}

/** 서버 series.csv와 같은 열. t는 유닉스 초. */
export function seriesCsv(series: readonly ThermalSample[]): string {
  return (
    ['t,mean_c,min_c,max_c', ...series.map((s) => `${s.t.toFixed(1)},${s.mean_c},${s.min_c},${s.max_c}`)].join('\n') +
    '\n'
  );
}

// ── 그림 색 (목업 영상 전용. 화면 토큰이 아니라 '찍힌 장면'의 색이다) ─────────

const INFERNO: [number, number, number][] = [
  [0, 0, 4],
  [40, 11, 84],
  [101, 21, 110],
  [159, 42, 99],
  [212, 72, 66],
  [245, 125, 21],
  [250, 193, 39],
  [252, 255, 164],
];

/** inferno 색표. v는 0~1. */
export function inferno(v: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, v)) * (INFERNO.length - 1);
  const i = Math.min(INFERNO.length - 2, Math.floor(x));
  const f = x - i;
  const a = INFERNO[i]!;
  const b = INFERNO[i + 1]!;
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

// 이전 레포 colorFrames: 청람색 면적 비율에 따른 용액 색.
const LIQUID: {coverage: number; rgb: [number, number, number]}[] = [
  {coverage: 0.8, rgb: [229, 233, 227]},
  {coverage: 12, rgb: [179, 184, 181]},
  {coverage: 46, rgb: [115, 125, 168]},
  {coverage: 86.1, rgb: [57, 77, 141]},
  {coverage: 93.4, rgb: [42, 57, 116]},
];

export function liquidColor(coverage: number): [number, number, number] {
  const c = Math.min(LIQUID.at(-1)!.coverage, Math.max(LIQUID[0]!.coverage, coverage));
  const upper = LIQUID.findIndex((s) => s.coverage >= c);
  const end = LIQUID[Math.max(upper, 0)]!;
  const start = LIQUID[Math.max(upper - 1, 0)]!;
  const f = end.coverage === start.coverage ? 0 : (c - start.coverage) / (end.coverage - start.coverage);
  return [0, 1, 2].map((k) => Math.round(start.rgb[k]! + (end.rgb[k]! - start.rgb[k]!) * f)) as [
    number,
    number,
    number,
  ];
}
