// Neo4j HTTP API의 graph 결과(nodes/relationships)와 같은 모양이다.
// 나중에 실제 그래프 DB 응답을 변환 없이 거의 그대로 받기 위해서다.

export type DataSource = 'mock' | 'live';

export const NODE_LABELS = ['Experiment', 'Chemical', 'Equipment', 'Device', 'Location', 'Hazard', 'Product'] as const;
export type NodeLabel = (typeof NODE_LABELS)[number];

export const RELATIONSHIP_TYPES = [
  'USES',
  'REQUIRES',
  'STORED_AT',
  'HAS_HAZARD',
  'REACTS_WITH',
  'PRODUCES',
  'CAUSES',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export type GraphNode = {id: string; labels: NodeLabel[]; properties: Record<string, unknown>};
export type GraphRelationship = {
  id: string;
  type: RelationshipType;
  startNode: string;
  endNode: string;
  properties: Record<string, unknown>;
};
// source는 Neo4j 응답에는 없는 필드다. 목업과 실측을 한 화면에 섞지 않기 위해 붙인다.
export type GraphSnapshot = {nodes: GraphNode[]; relationships: GraphRelationship[]; source?: DataSource};

export const emptySnapshot = (source?: DataSource): GraphSnapshot =>
  source ? {nodes: [], relationships: [], source} : {nodes: [], relationships: []};

// ── 라벨별 properties ──────────────────────────────────────────────

export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof SEVERITIES)[number];

// 심각도는 색과 함께 반드시 글자로도 보여 준다.
export const severityLabel: Record<Severity, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '매우 높음',
};

export const severityRank = (severity: Severity) => SEVERITIES.indexOf(severity);

export type InventoryStatus = 'available' | 'low' | 'expired';
export const inventoryStatusLabel: Record<InventoryStatus, string> = {
  available: '사용 가능',
  low: '부족',
  expired: '만료',
};

export type ExperimentProps = {
  name: string;
  /** 그래프 이름표에 쓰는 짧은 이름. 없으면 name을 줄여 쓴다. */
  shortName?: string;
  description: string;
  // template은 연구실이 제공하는 실험, draft는 사용자가 대화로 구성 중인 실험이다.
  kind: 'template' | 'draft';
  duration?: string;
  temperature?: string;
  formula?: string;
  observation?: string;
  /** 초안이 본뜬 템플릿의 id. */
  templateId?: string;
};

export type ChemicalProps = {
  name: string;
  english: string;
  formula: string;
  cas: string;
  phase: string;
  concentration: string;
  quantity: number;
  unit: string;
  lot: string;
  expiresAt: string; // YYYY-MM-DD
  status: InventoryStatus;
};

export type EquipmentProps = {
  name: string;
  spec: string;
  quantity: number;
  status: InventoryStatus;
};

export type DeviceKind = 'rgb-camera' | 'thermal-camera' | 'sensor' | 'robot-arm' | 'rail';
export type DeviceProps = {
  name: string;
  kind: DeviceKind;
  model: string;
  // 실제 연결 상태는 5단계 장비 API가 준다. 그래프에는 자리만 둔다.
  connection: 'unknown' | 'online' | 'offline' | 'error';
};

export type LocationProps = {name: string; description?: string};

export type HazardProps = {
  title: string;
  /** 그래프 이름표에 쓰는 짧은 이름. 없으면 title을 줄여 쓴다. */
  shortName?: string;
  description: string;
  severity: Severity;
  mitigation?: string;
};

export type ProductProps = {name: string; formula?: string; kind: 'product' | 'byproduct' | 'intermediate'};

export type LabelProps = {
  Experiment: ExperimentProps;
  Chemical: ChemicalProps;
  Equipment: EquipmentProps;
  Device: DeviceProps;
  Location: LocationProps;
  Hazard: HazardProps;
  Product: ProductProps;
};

export type TypedNode<L extends NodeLabel> = GraphNode & {properties: LabelProps[L]};

// ── 관계별 properties ──────────────────────────────────────────────

export type UsageRole = 'reactant' | 'indicator' | 'solvent' | 'titrant' | 'analyte';
export const usageRoleLabel: Record<UsageRole, string> = {
  reactant: '반응물',
  indicator: '지시약',
  solvent: '용매',
  titrant: '적정액',
  analyte: '분석 시료',
};

export type UsesProps = {amount: number; unit: string; role: UsageRole};
export type RequiresProps = {quantity?: number; purpose?: string};
export type ReactsWithProps = {condition: string; formula?: string; step?: string; title?: string};
export type CausesProps = {condition: string};

// ── 타입 가드 ──────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isOptional = (value: unknown, check: (v: unknown) => boolean) => value === undefined || check(value);
const isOneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    isString(value) && (values as readonly string[]).includes(value);

export const isNodeLabel = isOneOf(NODE_LABELS);
export const isRelationshipType = isOneOf(RELATIONSHIP_TYPES);
export const isSeverity = isOneOf(SEVERITIES);
const isInventoryStatus = isOneOf(['available', 'low', 'expired'] as const);

const propsChecks: {[L in NodeLabel]: (p: Record<string, unknown>) => boolean} = {
  Experiment: (p) =>
    isString(p.name) &&
    isString(p.description) &&
    isOneOf(['template', 'draft'] as const)(p.kind) &&
    isOptional(p.duration, isString) &&
    isOptional(p.temperature, isString) &&
    isOptional(p.formula, isString) &&
    isOptional(p.observation, isString) &&
    isOptional(p.templateId, isString) &&
    isOptional(p.shortName, isString),
  Chemical: (p) =>
    isString(p.name) &&
    isString(p.english) &&
    isString(p.formula) &&
    isString(p.cas) &&
    isString(p.phase) &&
    isString(p.concentration) &&
    isNumber(p.quantity) &&
    isString(p.unit) &&
    isString(p.lot) &&
    isString(p.expiresAt) &&
    isInventoryStatus(p.status),
  Equipment: (p) => isString(p.name) && isString(p.spec) && isNumber(p.quantity) && isInventoryStatus(p.status),
  Device: (p) =>
    isString(p.name) &&
    isOneOf(['rgb-camera', 'thermal-camera', 'sensor', 'robot-arm', 'rail'] as const)(p.kind) &&
    isString(p.model) &&
    isOneOf(['unknown', 'online', 'offline', 'error'] as const)(p.connection),
  Location: (p) => isString(p.name) && isOptional(p.description, isString),
  Hazard: (p) =>
    isString(p.title) &&
    isString(p.description) &&
    isSeverity(p.severity) &&
    isOptional(p.mitigation, isString) &&
    isOptional(p.shortName, isString),
  Product: (p) =>
    isString(p.name) &&
    isOptional(p.formula, isString) &&
    isOneOf(['product', 'byproduct', 'intermediate'] as const)(p.kind),
};

/** 라벨이 붙어 있고 그 라벨의 properties 모양까지 맞을 때만 참이다. */
export function hasLabel<L extends NodeLabel>(node: GraphNode, label: L): node is TypedNode<L> {
  return node.labels.includes(label) && propsChecks[label](node.properties);
}

export const isExperiment = (n: GraphNode) => hasLabel(n, 'Experiment');
export const isChemical = (n: GraphNode) => hasLabel(n, 'Chemical');
export const isEquipment = (n: GraphNode) => hasLabel(n, 'Equipment');
export const isDevice = (n: GraphNode) => hasLabel(n, 'Device');
export const isLocation = (n: GraphNode) => hasLabel(n, 'Location');
export const isHazard = (n: GraphNode) => hasLabel(n, 'Hazard');
export const isProduct = (n: GraphNode) => hasLabel(n, 'Product');

/** 노드의 대표 이름. Hazard는 name 대신 title을 쓴다. */
export function nodeName(node: GraphNode): string {
  const {name, title} = node.properties;
  if (isString(name)) return name;
  if (isString(title)) return title;
  return node.id;
}

export {isRecord};
