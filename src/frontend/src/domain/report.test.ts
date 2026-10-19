import {describe, expect, it} from 'vitest';
import {generatePlan} from '../adapters/chat/mock/plan';
import {createSeedGraph} from '../adapters/graph/seed';
import {fixtureReadings, fixtureReport} from '../adapters/report/mock/fixture';
import {MockReportSource} from '../adapters/report/MockReportSource';
import {buildDraftGraph, draftFromTemplate} from './draft';
import {
  chartSummary,
  mmss,
  niceAxis,
  normalize,
  reportCsv,
  reportCsvName,
  startEnd,
  timeTicks,
  type RunReport,
} from './report';
import {materialsFrom, reportFromRun} from './reportFromRun';
import type {RunRecord} from './run';

describe('시간', () => {
  it('mm:ss', () => {
    expect(mmss(0)).toBe('00:00');
    expect(mmss(222)).toBe('03:42');
    expect(mmss(3725)).toBe('62:05');
  });

  it('시간축 눈금: 넓으면 다섯쯤, 좁으면 셋, 끝 시각을 넣고 끝에 붙은 눈금은 뺀다', () => {
    expect(timeTicks(512, 840)).toEqual([0, 120, 240, 360, 512]);
    expect(timeTicks(512, 400)).toEqual([0, 300, 512]);
    expect(timeTicks(50, 840)).toEqual([0, 15, 30, 50]);
    expect(timeTicks(0, 840)).toEqual([0]);
  });
});

describe('값', () => {
  it('정규화: 관측 범위 안의 0–1, 폭이 0이면 가운데', () => {
    expect(normalize(1000, {min: 750, max: 1250})).toBe(0.5);
    expect(normalize(3, {min: 3, max: 3})).toBe(0.5);
  });

  it('축: 여유를 두고 읽기 좋은 간격, 값이 거의 같아도 최소 폭', () => {
    expect(niceAxis([842, 1136], 20)).toEqual({min: 800, max: 1200, ticks: [800, 900, 1000, 1100, 1200]});
    const flat = niceAxis([6.4, 6.41], 0.2);
    expect(flat.max - flat.min).toBeGreaterThanOrEqual(0.2);
    expect(flat.ticks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('예시 보고서(fixture)', () => {
  it('2초 간격 257개, 앵커 값 그대로, 같은 입력이면 같은 값', () => {
    const readings = fixtureReadings();
    expect(readings).toHaveLength(257);
    expect(readings[0]).toEqual({t: 0, values: {ec: 842, color: 0.8, ph: 6.72, temperature: 23.4}});
    expect(readings.find((r) => r.t === 258)?.values.color).toBe(86.1);
    expect(readings.at(-1)?.t).toBe(512);
    expect(fixtureReadings()).toEqual(readings);
  });

  it('시작 → 끝과 aria 문장에 사건이 들어간다', () => {
    const report = fixtureReport();
    expect(startEnd(report, 'ec')).toMatchObject({first: 842, last: 1136, count: 257});
    const summary = chartSummary(
      report,
      report.metrics.find((m) => m.key === 'color')!,
    );
    expect(summary).toContain('시작 0.8 %에서 끝 93.4 %');
    expect(summary).toContain('03:42 요오드 용액 2.0 mL 추가');
    expect(summary).toContain('기준선 목표 85%');
    expect(summary).toContain('03:20–04:48 보정 구간');
  });
});

describe('CSV', () => {
  it('BOM, CRLF, 단위가 붙은 열 이름, 사건은 그 시각의 행에', () => {
    const report = fixtureReport();
    const csv = reportCsv(report);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('경과 시간,경과 초,전도도 (µS/cm),색 변화 (%),pH,온도 (°C),사건');
    expect(lines[1]).toBe('00:00,0,842,0.8,6.72,23.4,');
    expect(lines.find((l) => l.startsWith('03:42,'))).toMatch(/,요오드 용액 2\.0 mL 추가$/);
    expect(lines.find((l) => l.startsWith('08:32,'))).toMatch(/실험 종료$/);
    expect(lines).toHaveLength(257 + 2); // 머리 + 257행 + 마지막 줄바꿈 뒤 빈 문자열
    expect(csv.includes('\n') && !/[^\r]\n/.test(csv)).toBe(true);
    expect(reportCsvName(report)).toBe('CB-260905-014-sensor-data.csv');
  });

  it('쉼표·따옴표가 든 값은 따옴표로 감싸고, 없는 값은 비운다. 사이 시각의 사건은 앞 행에', () => {
    const base = fixtureReport();
    const report: RunReport = {
      ...base,
      metrics: base.metrics.slice(0, 1),
      readings: [
        {t: 0, values: {ec: 1}},
        {t: 2, values: {}},
      ],
      events: [{kind: 'error', at: 1, label: '센서: "끊김", 다시 연결'}],
    };
    const lines = reportCsv(report).slice(1).split('\r\n');
    expect(lines[1]).toBe('00:00,0,1,"센서: ""끊김"", 다시 연결"');
    expect(lines[2]).toBe('00:02,2,,');
  });
});

describe('실행 기록에서 만든 보고서', () => {
  const inventory = createSeedGraph();
  const spec = draftFromTemplate(inventory, 'exp-clock', 'draft-1')!;
  const graph = buildDraftGraph(inventory, spec);
  const plan = generatePlan(inventory, spec, 'cfg-1');
  const start = Date.parse('2026-10-17T05:00:00Z');
  const iso = (s: number) => new Date(start + s * 1000).toISOString();
  const run: RunRecord = {
    id: 'run-1',
    planId: plan.id,
    planVersion: 1,
    graphSnapshotId: 'cfg-1',
    startedAt: iso(0),
    endedAt: iso(20),
    state: 'stopped',
    cursor: 8,
    total: 16,
    samples: [0, 2, 4].map((s, i) => ({at: iso(s), cursor: i, ph: 6.7 - i * 0.1, ec: 840 + i * 10})),
    events: [
      {at: iso(0), kind: 'start', message: 'v1 계획으로 실행을 시작했습니다.', by: 'user'},
      {at: iso(6), kind: 'pause', message: '일시정지했습니다.', by: 'user'},
      {at: iso(10), kind: 'resume', message: '재개했습니다.', by: 'user'},
      {at: iso(16), kind: 'step', message: '08 시약병 안치 완료', by: 'system', cursor: 8},
      {at: iso(20), kind: 'estop', message: 'E-STOP', by: 'user'},
    ],
    source: 'mock',
  };
  const report = reportFromRun({run, confirmed: {name: '색 변화 실험', graph}, plan});

  it('기록에 있는 지표만, 경과 초로', () => {
    expect(report.meta).toMatchObject({id: 'run-1', title: '색 변화 실험', duration: 20, basis: 'run', source: 'mock'});
    expect(report.metrics.map((m) => m.key)).toEqual(['ec', 'ph']);
    expect(report.readings.map((r) => r.t)).toEqual([0, 2, 4]);
    expect(report.metrics[0]!.description).toContain('목업 장비가 만든 값');
  });

  it('비상 정지: 결과·구간·타임라인·결론', () => {
    expect(report.outcome).toMatchObject({achieved: false, label: '비상 정지', detail: '8/16동작에서 멈춤'});
    expect(report.spans).toEqual([{kind: 'pause', from: 6, to: 10, label: '일시정지'}]);
    expect(report.events.map((e) => e.kind)).toEqual(['pause', 'resume', 'estop']);
    expect(report.timeline.map((t) => t.title)).toEqual([
      '실행 시작',
      '일시정지',
      '재개',
      '시약 분주 마침',
      '비상 정지',
    ]);
    expect(report.conclusion.paragraphs[0]).toContain('09');
    expect(report.agent).toBeUndefined();
    expect(report.colorFrames).toBeUndefined();
  });

  it('재료는 확정 그래프에서: 쓰는 양과 위험(무거운 것부터)', () => {
    const materials = materialsFrom(graph);
    expect(materials.map((m) => m.formula)).toEqual(['(C₆H₁₀O₅)ₙ', 'NaHSO₃', 'KIO₃']);
    const nahso3 = materials.find((m) => m.formula === 'NaHSO₃')!;
    expect(nahso3.amount).toBe('20 mL');
    expect(nahso3.hazards[0]!.severity).toBe('critical');
    expect(nahso3.hazards[0]!.text).toContain('(산과 접촉)');
  });

  it('목업 어댑터는 그 기록이 없으면 알아듣지 못했다고 한다', async () => {
    const source = new MockReportSource();
    await expect(source.getReport({runId: 'run-1', local: {run, confirmed: null, plan}})).resolves.toMatchObject({
      meta: {basis: 'run'},
    });
    await expect(source.getReport({runId: 'run-2', local: {run, confirmed: null, plan}})).rejects.toThrow(
      '실행 기록이 없습니다',
    );
    await expect(source.getExample()).resolves.toMatchObject({meta: {basis: 'fixture'}});
  });
});
