// 예시 보고서(fixture). 이전 레포 experimentReportData.ts의 색 변화 실험을 RunReport 모델로 옮겼다.
// 발표용으로 만든 기록이라 장비 측정값도, 에이전트가 실제로 한 일의 증거도 아니다. 이 앱의 실행 기록과 섞지 않는다.

import type {ReportReading, RunReport} from '../../../domain/report';

type Anchor = {second: number; ec: number; color: number; ph: number; temperature: number};

// 값은 결정적이고 앞뒤가 맞는 그림을 그리려고 이 앵커 사이를 직선으로 잇기만 한다.
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

const DURATION = 512;
const INTERVAL = 2;
const KEYS = ['ec', 'color', 'ph', 'temperature'] as const;

/** 2초 간격 257개 시점. 앵커 사이 직선 보간, 소수 둘째 자리. */
export function fixtureReadings(): ReportReading[] {
  return Array.from({length: DURATION / INTERVAL + 1}, (_, index) => {
    const second = index * INTERVAL;
    const upper = ANCHORS.findIndex((p) => p.second >= second);
    const end = ANCHORS[Math.max(upper, 0)]!;
    const start = ANCHORS[Math.max(upper - 1, 0)]!;
    const fraction = end.second === start.second ? 0 : (second - start.second) / (end.second - start.second);
    const values: Record<string, number> = {};
    for (const key of KEYS) values[key] = Number((start[key] + (end[key] - start[key]) * fraction).toFixed(2));
    return {t: second, values};
  });
}

export function fixtureReport(): RunReport {
  const readings = fixtureReadings();
  const first = readings[0]!.values;
  const last = readings.at(-1)!.values;
  const ecChange = (((last.ec ?? 0) / (first.ec ?? 1) - 1) * 100).toFixed(1);
  return {
    meta: {
      id: 'CB-260905-014',
      title: '요오드 용액의 첨가량에 따른 녹말–아황산염 용액의 색 변화',
      date: '2026. 09. 05',
      startedAt: '14:32:00',
      endedAt: '14:40:32',
      duration: DURATION,
      source: 'mock',
      basis: 'fixture',
      interval: INTERVAL,
    },
    outcome: {achieved: true, label: '반응 목표 충족', detail: '색 전환 기준 85% 이상 유지', corrections: 1},
    summary: {
      headline: '요오드 추가 투입 후 뚜렷한 청람색 전환을 확인했습니다.',
      body: '초기 색 전환 미달은 에이전트가 보정했고, 이후 관찰 종료까지 색과 센서 값이 안정적으로 유지되었습니다.',
      facts: [
        {label: '2026. 09. 05', value: '14:32:00–14:40:32'},
        {label: '시약 3종', value: '총 47.0 mL'},
        {label: '반응 용기', value: '100 mL'},
      ],
    },
    kpis: [
      {
        label: '최종 청람색 면적',
        value: '93.4',
        unit: '%',
        change: '보정 전 12.0% → +81.4%p',
        badge: {text: '목표 충족', tone: 'good'},
      },
      {label: '최종 전도도', value: '1,136', unit: 'µS/cm', change: `시작 842 µS/cm → +${ecChange}%`},
      {
        label: '에이전트 자율 보정',
        value: '1',
        unit: '회',
        change: '요오드 +2.0 mL · 감지 후 1분 28초',
        badge: {text: '복구 완료', tone: 'neutral'},
      },
      {label: '총 실험 시간', value: '08:32', change: `2초 간격 · ${readings.length}개 측정 시점`},
    ],
    // 위험은 GHS 픽토그램 대신 심각도 + 문구. 심각도는 목업 그래프(seed)의 같은 위험과 맞췄다.
    materials: [
      {
        order: '01',
        role: '반응물',
        name: '요오드산 칼륨 수용액',
        english: 'Potassium Iodate Solution',
        formula: 'KIO₃',
        cas: '7758-05-6',
        phase: '액체 · 수용액',
        concentration: '0.04 M',
        amount: '20.0 mL',
        amountNote: '보정 시 +2.0 mL',
        hazards: [
          {severity: 'high', text: '산화성 · 가연물과 접촉 시 화재 위험'},
          {severity: 'medium', text: '피부·눈·호흡기 자극'},
        ],
      },
      {
        order: '02',
        role: '반응물',
        name: '아황산 수소 나트륨 수용액',
        english: 'Sodium Bisulfite Solution',
        formula: 'NaHSO₃',
        cas: '7631-90-5',
        phase: '액체 · 수용액',
        concentration: '0.04 M',
        amount: '20.0 mL',
        hazards: [
          {severity: 'critical', text: '산과 접촉 시 이산화황(SO₂) 발생'},
          {severity: 'medium', text: '삼키면 유해 · 눈 자극'},
        ],
      },
      {
        order: '03',
        role: '지시약',
        name: '녹말 용액',
        english: 'Starch Solution',
        formula: '(C₆H₁₀O₅)ₙ',
        cas: '9005-25-8',
        phase: '액체 · 수용액',
        concentration: '1% (w/v)',
        amount: '5.0 mL',
        hazards: [],
      },
    ],
    materialNotes: [
      '녹말은 고분자라 단위 분자량이 정해지지 않는다. 몰농도 대신 질량/부피 백분율 1% (w/v)로 표기했다.',
      '위험 심각도와 문구는 일반 시약 기준의 초안이다. 실제 사용 제품의 MSDS로 확인한 뒤 확정한다.',
    ],
    reactions: {
      steps: [
        {
          index: '반응 1',
          title: '요오드화 이온의 생성',
          tempo: '느린 반응 · 속도 결정',
          formula: 'IO₃⁻ + 3HSO₃⁻ → I⁻ + 3SO₄²⁻ + 3H⁺',
          text: '요오드산 이온이 아황산 수소 이온에 환원되어 요오드화 이온이 만들어집니다. 이 단계가 가장 느려 청람색 전환까지의 시간을 결정합니다.',
        },
        {
          index: '반응 2',
          title: '요오드 분자(I₂)의 생성',
          tempo: '빠른 반응',
          formula: 'IO₃⁻ + 5I⁻ + 6H⁺ → 3I₂ + 3H₂O',
          text: '반응 1에서 생긴 요오드화 이온이 남은 요오드산 이온과 만나 요오드 분자가 됩니다. 녹말과 결합해 청람색을 낼 수 있는 형태입니다.',
        },
        {
          index: '반응 3',
          title: '아황산 수소 이온의 방해',
          tempo: '즉시 진행',
          formula: 'I₂ + HSO₃⁻ + H₂O → 2I⁻ + SO₄²⁻ + 3H⁺',
          text: '아황산 수소 이온이 남아 있는 동안에는 요오드 분자가 곧바로 되돌아가 색이 나타나지 않습니다. 아황산 수소 이온이 고갈되는 순간 남은 요오드가 녹말과 결합해 청람색으로 전환됩니다.',
        },
      ],
      conclusion:
        '요오드를 추가로 넣으면 반응 3에서 소모되고 남는 요오드 분자가 늘어납니다. 이번 실험에서 추가 투입 뒤 청람색이 발현된 결과는 이 경로와 일치합니다.',
    },
    procedure: {
      steps: [
        {
          no: '01',
          title: '용액 준비',
          text: '요오드산 칼륨 0.04 M, 아황산 수소 나트륨 0.04 M, 녹말 1% (w/v) 수용액을 시약 보관대에 거치하고 라벨·CAS 번호를 대조합니다.',
          meta: '실온 23–25 °C',
        },
        {
          no: '02',
          title: '안전 확인',
          text: '보안경과 니트릴 장갑을 착용하고, 밀폐 채널 잠금과 비상 정지 버튼 위치를 확인합니다.',
          meta: '밀폐 채널',
        },
        {
          no: '03',
          title: '기준값 기록',
          text: '100 mL 반응 비커를 거치하고 전도도·pH·온도 프로브를 삽입한 뒤, 카메라 관심영역(ROI)을 설정하고 혼합 전 기준값을 기록합니다.',
          meta: '00:00',
        },
        {no: '04', title: '지시약 분주', text: '녹말 용액 5.0 mL를 반응 비커에 분주합니다.', meta: '5.0 mL'},
        {
          no: '05',
          title: '반응물 주입',
          text: '아황산 수소 나트륨 수용액 20.0 mL를 주입한 뒤, 요오드산 칼륨 수용액 20.0 mL를 메스실린더로 분취해 주입합니다.',
          meta: '00:40 · 총 45.0 mL',
        },
        {
          no: '06',
          title: '교반',
          text: '반응 비커를 15초간 교반해 세 용액을 고르게 혼합하고, 기구를 원위치에 안치합니다.',
          meta: '15초',
        },
        {
          no: '07',
          title: '관찰 및 기록',
          text: 'ROI의 청람색 면적 비율과 전도도·pH·온도를 2초 간격으로 기록합니다.',
          meta: '2초 간격',
        },
        {
          no: '08',
          title: '색 전환 판정',
          text: '청람색 면적이 85% 이상을 30초 연속 유지하면 색 전환 완료로 판정합니다.',
          meta: '목표 85%',
        },
        {
          no: '09',
          title: '미달 시 추가 투입',
          text: '정체가 확인되면 요오드 용액을 최대 2.0 mL, 1회까지 추가하고 15초 교반 후 같은 기준으로 재검증합니다.',
          meta: '한도 2.0 mL · 1회',
        },
        {
          no: '10',
          title: '종료 및 정리',
          text: '센서 최종값과 관찰 결과를 기록하고 측정 데이터를 CSV로 저장한 뒤, 반응 폐액을 분리 배출합니다.',
          meta: '08:32',
        },
      ],
    },
    metrics: [
      {
        key: 'ec',
        label: '전도도',
        unit: 'µS/cm',
        min: 750,
        max: 1250,
        ticks: [800, 1000, 1200],
        tone: 1,
        digits: 0,
        description:
          '추가 투입 후 전도도가 상승했고, 검증 구간 이후 1,132–1,138 µS/cm 범위에서 안정화되었습니다. 색 전환과 함께 반응 상태를 해석하는 보조 지표로 사용했습니다.',
      },
      {
        key: 'color',
        label: '색 변화',
        unit: '%',
        min: 0,
        max: 100,
        ticks: [0, 25, 50, 75, 100],
        tone: 2,
        digits: 1,
        description:
          '반응 용기 관심영역(ROI)에서 청람색으로 분류된 면적의 비율입니다. 04:18에 목표 85%를 넘었고, 30초 연속 유지 후 색 전환 완료로 판정했습니다.',
      },
      {
        key: 'ph',
        label: 'pH',
        unit: 'pH',
        min: 6.2,
        max: 6.9,
        ticks: [6.2, 6.4, 6.6, 6.8],
        tone: 3,
        digits: 2,
        description:
          'pH는 6.72에서 6.38로 완만하게 감소했습니다. 추가 투입 이후 급격한 변동 없이 안정되었으며, 설정 관찰 범위 6.0–7.0을 유지했습니다.',
      },
      {
        key: 'temperature',
        label: '온도',
        unit: '°C',
        min: 23,
        max: 24.6,
        ticks: [23, 23.5, 24, 24.5],
        tone: 4,
        digits: 2,
        description:
          '반응 용기 ROI 평균 온도는 23.4°C에서 24.1°C로 상승했습니다. 관찰 중 최고 24.2°C로, 설정 상한 26°C 이내에서 유지되었습니다.',
      },
    ],
    readings,
    events: [
      {kind: 'detect', at: 200, label: '색 전환 미달 감지'},
      {kind: 'dose', at: 222, label: '요오드 용액 2.0 mL 추가'},
      {kind: 'target', at: 258, label: '청람색 목표 도달'},
      {kind: 'verify', at: 288, label: '복구 검증 완료'},
      {kind: 'done', at: 512, label: '실험 종료'},
    ],
    spans: [{kind: 'correction', from: 200, to: 288, label: '보정 구간'}],
    thresholds: [{metric: 'color', value: 85, label: '목표 85%'}],
    secondary: [
      {label: 'pH 시작 → 종료', value: '6.72 → 6.38'},
      {label: '용기 평균 온도 시작 → 종료', value: '23.4 → 24.1 °C'},
      {label: '관찰 중 최고 온도', value: '24.2 °C', note: '상한 26°C 이내'},
    ],
    // 색은 '찍힌 용액'의 대표색 재구성이라 디자인 토큰이 아니다.
    colorFrames: {
      title: '옅은 용액에서, 선명한 청람색으로',
      frames: [
        {at: 0, label: '혼합 전', detail: '투명한 용액', color: '#e5e9e3', coverage: 0.8},
        {at: 200, label: '색 전환 미달', detail: '옅은 색 · 반응 정체', color: '#b3b8b5', coverage: 12},
        {at: 238, label: '추가 투입 후', detail: '청람색 발현', color: '#737da8', coverage: 46},
        {at: 258, label: '목표 도달', detail: '청람색 전환 확인', color: '#394d8d', coverage: 86.1},
        {at: 512, label: '반응 종료', detail: '청람색 유지', color: '#2a3974', coverage: 93.4},
      ],
      caption: '동일한 반응 용기 ROI의 대표 색상 재구성 · 수치는 청람색으로 분류된 면적 비율입니다.',
      conclusion: {
        title: '추가 투입 36초 후, 색 전환 목표에 도달했습니다.',
        text: '04:18에 청람색 면적 86.1%를 기록했으며, 종료 시점에도 93.4%로 유지되었습니다.',
      },
    },
    agent: {
      title: '관찰하고, 판단하고, 복구하다',
      intro: '색 전환이 충분하지 않은 상황에서 추가 투입을 결정하고, 반응 결과를 다시 검증했습니다.',
      steps: [
        {
          stage: 'detect',
          at: 200,
          title: '목표 색 전환 미달',
          text: '청람색 면적 12.0%. 관찰 시점의 목표 85%에 미달하고, 최근 20초 변화가 0.2%p에 그쳐 반응 정체로 분류했습니다.',
        },
        {
          stage: 'assess',
          at: 204,
          title: '잔류 아황산에 의한 요오드 소모 가능성',
          text: '색 전환 정체와 완만한 전도도 변화를 함께 검토했습니다. 요오드가 충분히 남지 않았을 가능성을 가설로 두고 추가 투입을 선택했습니다.',
        },
        {
          stage: 'act',
          at: 222,
          title: '요오드 용액 2.0 mL 추가',
          text: '설정된 추가 투입 한도 2.0 mL와 용기 잔여 용량을 확인한 뒤 1회 분주했습니다. 이후 15초간 교반하여 용액을 다시 혼합했습니다.',
        },
        {
          stage: 'verify',
          at: 288,
          title: '색 전환 기준 충족 · 실험 재개',
          text: '04:18부터 청람색 면적 85% 이상을 30초 연속 확인했습니다. 온도 상한 이내와 전도도 안정화를 함께 확인하고 후속 관찰을 진행했습니다.',
        },
      ],
      outcome: {label: '자율 보정 성공', duration: '01:28'},
      boundary: {within: true, text: '추가 투입 1회 · 2.0 mL / 허용 2.0 mL'},
    },
    agentLog: [
      {at: 200, op: 'OBSERVE', detail: 'color.coverage=12.0%; target≥85%; Δ20s=+0.2pp'},
      {at: 204, op: 'ASSESS', detail: '가설: 잔류 아황산에 의한 요오드 소모 · 색 전환 지연'},
      {at: 210, op: 'CHECK', detail: '추가 투입 2.0/2.0 mL · 예상 총량 47/100 mL'},
      {at: 222, op: 'DISPENSE', detail: '요오드 용액 2.0 mL 분주 완료 · 추가 투입 1/1회'},
      {at: 222, op: 'MIX', detail: '교반 시작 · 15초'},
      {at: 237, op: 'MIX', detail: '교반 종료 · 색 변화 재평가'},
      {at: 258, op: 'OBSERVE', detail: 'color.coverage=86.1% · 목표 도달 · 30초 검증 시작'},
      {at: 288, op: 'VERIFY', detail: 'color.coverage=93.4%; EC=1132 µS/cm; T=24.2°C'},
      {at: 288, op: 'RESUME', detail: '검증 통과 · 후속 관찰 재개'},
    ],
    timeline: [
      {at: 0, title: '실험 시작', text: '센서 기준값 기록 · 반응 용기 ROI 설정', status: 'done'},
      {
        at: 40,
        title: '시약 혼합',
        text: '녹말 1% 5 mL · 아황산 수소 나트륨 0.04 M 20 mL · 요오드산 칼륨 0.04 M 20 mL',
        status: 'done',
      },
      {at: 200, title: '색 전환 미달 감지', text: '청람색 면적 12.0% · 목표 대비 부족', status: 'warning'},
      {at: 222, title: '에이전트 추가 투입', text: '요오드 용액 +2.0 mL · 교반 15초', status: 'agent'},
      {at: 288, title: '복구 검증 완료', text: '색 전환 기준 30초 유지 · 후속 관찰 진행', status: 'agent'},
      {at: 512, title: '실험 종료', text: '청람색 유지 · 센서 최종값 및 결과 기록', status: 'done'},
    ],
    conclusion: {
      title: '색 변화는 확인, 원인은 추정',
      paragraphs: [
        '요오드 추가 후 청람색이 발현된 결과는 요오드 부족 가설과 일치합니다. 잔류 아황산의 양을 직접 측정한 것은 아니므로 원인 확정과는 구분합니다.',
        '다음 실험에서는 초기 시약 비율과 혼합 시간을 점검하고, 같은 조건에서 반복해 재현성을 확인하세요.',
      ],
    },
  };
}
