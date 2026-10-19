// 목업 그래프 시드. 내용은 이전 레포(hanium-ui@8e23068)의 reagentPresets·reagentSheet·
// reactionSteps·experiments에서 왔다. 보관 위치·수량·로트·유효기간은 그럴듯하게 지어낸 값이다.
// 2단계 목업 챗봇이 짚을 거리로 재고 부족(탄산 나트륨)과 만료(페놀프탈레인) 사례를 넣었다.

import type {
  ChemicalProps,
  DeviceProps,
  EquipmentProps,
  ExperimentProps,
  GraphNode,
  GraphRelationship,
  GraphSnapshot,
  HazardProps,
  LocationProps,
  NodeLabel,
  ProductProps,
  RelationshipType,
} from '../../graph/model';

const node = (id: string, label: NodeLabel, properties: object): GraphNode => ({
  id,
  labels: [label],
  properties: properties as Record<string, unknown>,
});
const chemical = (id: string, p: ChemicalProps) => node(id, 'Chemical', p);
const equipment = (id: string, p: EquipmentProps) => node(id, 'Equipment', p);
const device = (id: string, p: DeviceProps) => node(id, 'Device', p);
const location = (id: string, p: LocationProps) => node(id, 'Location', p);
const hazard = (id: string, p: HazardProps) => node(id, 'Hazard', p);
const product = (id: string, p: ProductProps) => node(id, 'Product', p);
const experiment = (id: string, p: ExperimentProps) => node(id, 'Experiment', p);

let relSeq = 0;
// 관계 id는 시드 안에서만 고유하면 된다. 순번으로 만들어 시드를 고쳐도 결정적으로 남게 한다.
const rel = (
  type: RelationshipType,
  startNode: string,
  endNode: string,
  properties: object = {},
): GraphRelationship => {
  relSeq += 1;
  return {
    id: `r${String(relSeq).padStart(3, '0')}`,
    type,
    startNode,
    endNode,
    properties: properties as Record<string, unknown>,
  };
};

const nodes: GraphNode[] = [
  // ── 보관 위치 ──
  location('loc-oxidizer', {name: '시약장 A · 산화제 칸', description: '가연물과 분리 보관'}),
  location('loc-general', {name: '시약장 B · 일반 시약'}),
  location('loc-acid-base', {name: '산·염기 캐비닛', description: '환기형, 산과 염기를 칸으로 분리'}),
  location('loc-glassware', {name: '기구 선반'}),
  location('loc-bench', {name: '로봇 작업대'}),

  // ── 시약 (앞의 셋은 reagentSheet 값 그대로) ──
  chemical('chem-kio3', {
    name: '요오드산 칼륨 수용액',
    english: 'Potassium Iodate Solution',
    formula: 'KIO₃',
    cas: '7758-05-6',
    phase: '액체 · 수용액',
    concentration: '0.04 M',
    quantity: 180,
    unit: 'mL',
    lot: 'KI-2608-03',
    expiresAt: '2027-08-31',
    status: 'available',
  }),
  chemical('chem-nahso3', {
    name: '아황산 수소 나트륨 수용액',
    english: 'Sodium Bisulfite Solution',
    formula: 'NaHSO₃',
    cas: '7631-90-5',
    phase: '액체 · 수용액',
    concentration: '0.04 M',
    quantity: 150,
    unit: 'mL',
    lot: 'SB-2607-11',
    // 아황산염 용액은 공기 중 산화로 유효기간이 짧다.
    expiresAt: '2027-01-31',
    status: 'available',
  }),
  chemical('chem-starch', {
    name: '녹말 지시약',
    english: 'Starch Solution',
    formula: '(C₆H₁₀O₅)ₙ',
    cas: '9005-25-8',
    phase: '액체 · 수용액',
    concentration: '1% (w/v)',
    quantity: 60,
    unit: 'mL',
    lot: 'ST-2609-02',
    expiresAt: '2026-12-31',
    status: 'available',
  }),
  // 이전 레포 주석: 10% (w/v) 시판품을 몰농도로 환산 — CaCl₂ 10% ÷ 110.98 g/mol ≈ 0.90 M
  chemical('chem-cacl2', {
    name: '염화 칼슘 수용액',
    english: 'Calcium Chloride Solution',
    formula: 'CaCl₂',
    cas: '10043-52-4',
    phase: '액체 · 수용액',
    concentration: '10% (w/v) · 0.90 M',
    quantity: 240,
    unit: 'mL',
    lot: 'CC-2605-07',
    expiresAt: '2028-05-31',
    status: 'available',
  }),
  // Na₂CO₃ 10% ÷ 105.99 g/mol ≈ 0.94 M. 앙금 실험 한 번(25 mL)에 못 미치게 남겨 둔다.
  chemical('chem-na2co3', {
    name: '탄산 나트륨 수용액',
    english: 'Sodium Carbonate Solution',
    formula: 'Na₂CO₃',
    cas: '497-19-8',
    phase: '액체 · 수용액',
    concentration: '10% (w/v) · 0.94 M',
    quantity: 15,
    unit: 'mL',
    lot: 'SC-2603-04',
    expiresAt: '2028-03-31',
    status: 'low',
  }),
  chemical('chem-water', {
    name: '증류수',
    english: 'Distilled Water',
    formula: 'H₂O',
    cas: '7732-18-5',
    phase: '액체',
    concentration: '—',
    quantity: 2000,
    unit: 'mL',
    lot: 'DW-2610-01',
    expiresAt: '2027-10-01',
    status: 'available',
  }),
  // 이하 셋은 산–염기 적정 템플릿과 조합 위험(아황산 수소 나트륨 + 산)을 위해 더했다.
  chemical('chem-hcl', {
    name: '염산',
    english: 'Hydrochloric Acid',
    formula: 'HCl',
    cas: '7647-01-0',
    phase: '액체 · 수용액',
    concentration: '0.1 M',
    quantity: 500,
    unit: 'mL',
    lot: 'HC-2604-09',
    expiresAt: '2028-04-30',
    status: 'available',
  }),
  chemical('chem-naoh', {
    name: '수산화 나트륨 수용액',
    english: 'Sodium Hydroxide Solution',
    formula: 'NaOH',
    cas: '1310-73-2',
    phase: '액체 · 수용액',
    concentration: '0.1 M',
    quantity: 400,
    unit: 'mL',
    lot: 'SH-2606-02',
    expiresAt: '2027-06-30',
    status: 'available',
  }),
  chemical('chem-phenolphthalein', {
    name: '페놀프탈레인 지시약',
    english: 'Phenolphthalein Solution',
    formula: 'C₂₀H₁₄O₄',
    cas: '77-09-8',
    phase: '액체 · 에탄올 용액',
    concentration: '1% (w/v)',
    quantity: 25,
    unit: 'mL',
    lot: 'PP-2408-01',
    expiresAt: '2026-08-31',
    status: 'expired',
  }),

  // ── 기구 ──
  equipment('eq-beaker-100', {name: '반응 비커', spec: '100 mL', quantity: 4, status: 'available'}),
  equipment('eq-cylinder-50', {name: '메스실린더', spec: '50 mL', quantity: 2, status: 'available'}),
  equipment('eq-bottle-250', {name: '시약병', spec: '250 mL', quantity: 8, status: 'available'}),
  equipment('eq-tube-rack', {name: '시험관대', spec: '12구', quantity: 1, status: 'available'}),

  // ── 장비 ──
  device('dev-rgb', {name: 'RGB 카메라', kind: 'rgb-camera', model: 'Intel RealSense D415', connection: 'unknown'}),
  device('dev-thermal', {
    name: '열화상 카메라',
    kind: 'thermal-camera',
    model: '160×120 · 9 fps',
    connection: 'unknown',
  }),
  device('dev-ph', {name: 'pH 센서', kind: 'sensor', model: 'pH 프로브', connection: 'unknown'}),
  device('dev-ec', {name: 'EC 센서', kind: 'sensor', model: '전도도 프로브', connection: 'unknown'}),
  device('dev-tds', {name: 'TDS 센서', kind: 'sensor', model: 'TDS 프로브', connection: 'unknown'}),
  device('dev-temp', {name: '온도 센서', kind: 'sensor', model: '온도 프로브', connection: 'unknown'}),
  device('dev-arm', {name: '로봇팔', kind: 'robot-arm', model: '6축 로봇팔', connection: 'unknown'}),
  device('dev-rail', {name: '레일', kind: 'rail', model: '직선 레일', connection: 'unknown'}),

  // ── 위험: reagentSheet의 hazardText를 나눠 옮기고 심각도를 매겼다 ──
  hazard('hz-kio3-irritant', {
    shortName: '자극',
    title: '피부·눈·호흡기 자극',
    description: '요오드산 칼륨 용액이 피부나 눈에 닿거나 흡입되면 자극을 일으킨다.',
    severity: 'medium',
    mitigation: '보안경과 니트릴 장갑을 착용하고, 닿으면 흐르는 물로 15분 이상 씻는다.',
  }),
  hazard('hz-oxidizer-fire', {
    shortName: '화재',
    title: '산화제 + 가연물 접촉 시 화재',
    description: '요오드산 칼륨은 산화제다. 녹말 같은 유기 가연물과 건조 상태로 섞이면 발화할 수 있다.',
    severity: 'high',
    mitigation: '산화제 칸에 분리 보관하고, 흘린 용액은 마르기 전에 닦는다.',
  }),
  hazard('hz-nahso3-harmful', {
    shortName: '유해',
    title: '삼키면 유해 · 눈 자극',
    description: '아황산 수소 나트륨은 삼키면 유해하고 눈에 심한 자극을 준다.',
    severity: 'medium',
    mitigation: '보안경을 착용한다. 피펫을 입으로 빨지 않는다.',
  }),
  hazard('hz-so2-release', {
    shortName: 'SO₂ 발생',
    title: '이산화황(SO₂) 가스 발생',
    description: '아황산 수소 나트륨이 산과 만나면 독성 기체인 이산화황이 나온다. 밀폐 채널 안에 고일 수 있다.',
    severity: 'critical',
    mitigation: '산과 같은 용기에 넣지 않는다. 혼합이 필요하면 환기를 켜고 소량씩 넣는다.',
  }),
  hazard('hz-eye-irritant', {
    shortName: '눈 자극',
    title: '눈 자극',
    description: '염 용액이 눈에 들어가면 자극을 일으킨다.',
    severity: 'low',
    mitigation: '보안경을 착용한다.',
  }),
  hazard('hz-alkaline', {
    shortName: '알칼리',
    title: '알칼리성 · 피부 자극',
    description: '염기성 용액이 피부와 눈에 자극을 준다.',
    severity: 'medium',
    mitigation: '장갑과 보안경을 착용하고, 닿으면 물로 충분히 씻는다.',
  }),
  hazard('hz-acid', {
    shortName: '산성',
    title: '산성 · 피부·눈 자극',
    description: '0.1 M 염산은 피부와 눈에 자극을 준다.',
    severity: 'low',
    mitigation: '장갑과 보안경을 착용한다.',
  }),
  hazard('hz-phenolphthalein', {
    shortName: '발암성 의심',
    title: '발암성 의심 · 인화성 용매',
    description: '페놀프탈레인은 발암성이 의심되고, 용매인 에탄올은 불이 붙는다.',
    severity: 'high',
    mitigation: '필요한 양만 쓰고 화기에서 멀리 둔다.',
  }),
  hazard('hz-iodine-stain', {
    shortName: '착색',
    title: '요오드 착색 · 자극',
    description: '생성된 요오드가 피부와 기구에 착색되고 자극을 줄 수 있다.',
    severity: 'low',
    mitigation: '장갑을 착용하고, 착색된 기구는 티오황산 나트륨 용액으로 닦는다.',
  }),
  hazard('hz-neutralization-heat', {
    shortName: '중화열',
    title: '중화열',
    description: '산과 염기를 섞으면 열이 난다. 0.1 M에서는 온도 상승이 작지만 농도가 높으면 튈 수 있다.',
    severity: 'low',
    mitigation: '적정액을 조금씩 넣는다.',
  }),

  // ── 생성물 ──
  product('prod-iodide', {name: '요오드화 이온', formula: 'I⁻', kind: 'intermediate'}),
  product('prod-iodine', {name: '요오드', formula: 'I₂', kind: 'intermediate'}),
  product('prod-starch-iodine', {name: '녹말–요오드 착물 (청람색)', kind: 'product'}),
  product('prod-sulfate', {name: '황산 이온', formula: 'SO₄²⁻', kind: 'byproduct'}),
  product('prod-caco3', {name: '탄산 칼슘 앙금', formula: 'CaCO₃', kind: 'product'}),
  product('prod-nacl', {name: '염화 나트륨', formula: 'NaCl', kind: 'byproduct'}),

  // ── 실험 템플릿: 이전 App.tsx의 experiments 3종 ──
  experiment('exp-clock', {
    shortName: '색 변화',
    name: '녹말–아황산염 색 변화 실험',
    description:
      '요오드산 칼륨과 아황산 수소 나트륨을 녹말 용액에 섞습니다. 아황산 수소 이온이 고갈되는 순간 녹말이 청람색으로 전환됩니다.',
    kind: 'template',
    duration: '약 35분',
    temperature: '20–25 °C',
    formula: 'IO₃⁻ + 3HSO₃⁻ → I⁻ + 3SO₄²⁻ + 3H⁺',
    observation: '청람색 전환 시간',
  }),
  experiment('exp-precipitation', {
    shortName: '앙금 생성',
    name: '탄산 나트륨 + 염화 칼슘 앙금 생성',
    description: '두 수용액을 섞어 탄산 칼슘 앙금이 생성되는 과정을 관찰합니다.',
    kind: 'template',
    duration: '약 20분',
    temperature: '실온',
    formula: 'CaCl₂ + Na₂CO₃ → 2NaCl + CaCO₃↓',
    observation: '흰색 앙금 형성',
  }),
  experiment('exp-titration', {
    shortName: '산–염기 적정',
    name: '산–염기 적정',
    description: '중화점 부근의 pH 변화를 측정해 미지 용액의 농도를 계산합니다.',
    kind: 'template',
    duration: '약 30분',
    temperature: '실온',
    formula: 'H⁺ + OH⁻ → H₂O',
    observation: '종말점 색 변화',
  }),
];

const relationships: GraphRelationship[] = [
  // 보관 위치
  rel('STORED_AT', 'chem-kio3', 'loc-oxidizer'),
  rel('STORED_AT', 'chem-nahso3', 'loc-general'),
  rel('STORED_AT', 'chem-starch', 'loc-general'),
  rel('STORED_AT', 'chem-cacl2', 'loc-general'),
  rel('STORED_AT', 'chem-na2co3', 'loc-general'),
  rel('STORED_AT', 'chem-water', 'loc-general'),
  rel('STORED_AT', 'chem-hcl', 'loc-acid-base'),
  rel('STORED_AT', 'chem-naoh', 'loc-acid-base'),
  rel('STORED_AT', 'chem-phenolphthalein', 'loc-general'),
  rel('STORED_AT', 'eq-beaker-100', 'loc-glassware'),
  rel('STORED_AT', 'eq-cylinder-50', 'loc-glassware'),
  rel('STORED_AT', 'eq-bottle-250', 'loc-glassware'),
  rel('STORED_AT', 'eq-tube-rack', 'loc-bench'),

  // 물질 자체의 위험
  rel('HAS_HAZARD', 'chem-kio3', 'hz-kio3-irritant'),
  rel('HAS_HAZARD', 'chem-nahso3', 'hz-nahso3-harmful'),
  rel('HAS_HAZARD', 'chem-cacl2', 'hz-eye-irritant'),
  rel('HAS_HAZARD', 'chem-na2co3', 'hz-eye-irritant'),
  rel('HAS_HAZARD', 'chem-naoh', 'hz-alkaline'),
  rel('HAS_HAZARD', 'chem-hcl', 'hz-acid'),
  rel('HAS_HAZARD', 'chem-phenolphthalein', 'hz-phenolphthalein'),

  // 섞이거나 조건이 맞을 때 생기는 위험. 두 시약이 만드는 위험은 양쪽에서 같은 노드로 잇는다.
  rel('CAUSES', 'chem-kio3', 'hz-oxidizer-fire', {condition: '가연물과 건조 상태로 접촉'}),
  rel('CAUSES', 'chem-starch', 'hz-oxidizer-fire', {condition: '산화제와 건조 상태로 접촉'}),
  rel('CAUSES', 'chem-nahso3', 'hz-so2-release', {condition: '산과 접촉'}),
  rel('CAUSES', 'chem-hcl', 'hz-so2-release', {condition: '아황산염과 접촉'}),
  rel('CAUSES', 'prod-iodine', 'hz-iodine-stain', {condition: '피부·기구에 닿음'}),
  rel('CAUSES', 'chem-hcl', 'hz-neutralization-heat', {condition: '염기와 혼합'}),
  rel('CAUSES', 'chem-naoh', 'hz-neutralization-heat', {condition: '산과 혼합'}),

  // reactionSteps 반응 1~3. 반응 2·3은 중간 생성물이 참여하지만, 그래프에서는 출발 시약 쌍에 단다.
  rel('REACTS_WITH', 'chem-kio3', 'chem-nahso3', {
    step: '반응 1',
    title: '요오드화 이온의 생성',
    formula: 'IO₃⁻ + 3HSO₃⁻ → I⁻ + 3SO₄²⁻ + 3H⁺',
    condition: '느린 반응 · 속도 결정',
  }),
  rel('PRODUCES', 'chem-kio3', 'prod-iodide'),
  rel('PRODUCES', 'chem-nahso3', 'prod-sulfate'),
  rel('PRODUCES', 'chem-kio3', 'prod-iodine'),
  rel('REACTS_WITH', 'chem-nahso3', 'chem-starch', {
    step: '반응 3',
    title: '아황산 수소 이온의 방해',
    formula: 'I₂ + HSO₃⁻ + H₂O → 2I⁻ + SO₄²⁻ + 3H⁺',
    condition: '아황산 수소 이온이 남아 있는 동안 청람색 전환을 막음',
  }),
  rel('PRODUCES', 'chem-starch', 'prod-starch-iodine'),
  rel('REACTS_WITH', 'chem-cacl2', 'chem-na2co3', {
    formula: 'CaCl₂ + Na₂CO₃ → 2NaCl + CaCO₃↓',
    condition: '실온 혼합',
  }),
  rel('REACTS_WITH', 'chem-hcl', 'chem-naoh', {formula: 'H⁺ + OH⁻ → H₂O', condition: '중화'}),
  rel('REACTS_WITH', 'chem-nahso3', 'chem-hcl', {formula: 'HSO₃⁻ + H⁺ → SO₂↑ + H₂O', condition: '산성'}),

  // 실험 템플릿 구성 (양은 이전 reagentPresets·reagentSheet 값)
  rel('USES', 'exp-clock', 'chem-starch', {amount: 5, unit: 'mL', role: 'indicator'}),
  rel('USES', 'exp-clock', 'chem-nahso3', {amount: 20, unit: 'mL', role: 'reactant'}),
  rel('USES', 'exp-clock', 'chem-kio3', {amount: 20, unit: 'mL', role: 'reactant'}),
  rel('REQUIRES', 'exp-clock', 'eq-beaker-100', {quantity: 1}),
  rel('REQUIRES', 'exp-clock', 'eq-cylinder-50', {quantity: 1}),
  rel('REQUIRES', 'exp-clock', 'eq-tube-rack', {quantity: 1}),
  rel('REQUIRES', 'exp-clock', 'dev-rgb', {purpose: '청람색 면적 비율 관찰'}),
  rel('REQUIRES', 'exp-clock', 'dev-thermal', {purpose: '반응 비커 온도 감시'}),
  rel('REQUIRES', 'exp-clock', 'dev-ph'),
  rel('REQUIRES', 'exp-clock', 'dev-ec'),
  rel('REQUIRES', 'exp-clock', 'dev-tds'),
  rel('REQUIRES', 'exp-clock', 'dev-temp'),
  rel('REQUIRES', 'exp-clock', 'dev-arm'),
  rel('REQUIRES', 'exp-clock', 'dev-rail'),
  rel('PRODUCES', 'exp-clock', 'prod-starch-iodine'),
  rel('PRODUCES', 'exp-clock', 'prod-sulfate'),

  rel('USES', 'exp-precipitation', 'chem-cacl2', {amount: 25, unit: 'mL', role: 'reactant'}),
  rel('USES', 'exp-precipitation', 'chem-na2co3', {amount: 25, unit: 'mL', role: 'reactant'}),
  rel('REQUIRES', 'exp-precipitation', 'eq-beaker-100', {quantity: 1}),
  rel('REQUIRES', 'exp-precipitation', 'eq-cylinder-50', {quantity: 1}),
  rel('REQUIRES', 'exp-precipitation', 'dev-rgb', {purpose: '앙금 형성 관찰'}),
  rel('REQUIRES', 'exp-precipitation', 'dev-arm'),
  rel('REQUIRES', 'exp-precipitation', 'dev-rail'),
  rel('PRODUCES', 'exp-precipitation', 'prod-caco3'),
  rel('PRODUCES', 'exp-precipitation', 'prod-nacl'),

  rel('USES', 'exp-titration', 'chem-hcl', {amount: 20, unit: 'mL', role: 'analyte'}),
  rel('USES', 'exp-titration', 'chem-naoh', {amount: 25, unit: 'mL', role: 'titrant'}),
  rel('USES', 'exp-titration', 'chem-phenolphthalein', {amount: 0.5, unit: 'mL', role: 'indicator'}),
  rel('REQUIRES', 'exp-titration', 'eq-beaker-100', {quantity: 1}),
  rel('REQUIRES', 'exp-titration', 'eq-cylinder-50', {quantity: 1}),
  rel('REQUIRES', 'exp-titration', 'dev-ph', {purpose: '중화점 pH 측정'}),
  rel('REQUIRES', 'exp-titration', 'dev-rgb', {purpose: '종말점 색 변화 관찰'}),
  rel('REQUIRES', 'exp-titration', 'dev-arm'),
  rel('REQUIRES', 'exp-titration', 'dev-rail'),
  rel('PRODUCES', 'exp-titration', 'prod-nacl'),
];

/** 매번 새 객체를 준다. 목업 메모리 그래프가 시드를 직접 고치지 않게 하기 위해서다. */
export function createSeedGraph(): GraphSnapshot {
  return structuredClone({nodes, relationships, source: 'mock' as const});
}
