import type {SensorReading} from '../adapters/device/types';
import type {ExecutionPlan} from '../domain/plan';
import type {ReportBrief} from '../domain/report';
import type {RunState} from '../domain/run';
import type {GraphSnapshot} from '../graph/model';

/** 작업 영역의 단계. 진행에 따라 차례로 열린다. */
export const WORK_STAGES = ['graph', 'plan', 'monitoring', 'report'] as const;
export type WorkStage = (typeof WORK_STAGES)[number];
export const workStageLabel: Record<WorkStage, string> = {
  graph: '그래프',
  plan: '실행 계획',
  monitoring: '모니터링',
  report: '보고서',
};

export type ChatEvent =
  | {type: 'text-delta'; text: string}
  | {type: 'status'; label: string} // '인벤토리 조회 중' 같은 진행 표시
  | {type: 'graph'; graph: GraphSnapshot; mode: 'merge' | 'replace'; focus?: string[]}
  | ExecutionPlanEvent
  | {type: 'done'}
  | {type: 'error'; message: string};

export type ExecutionPlanEvent = {type: 'plan'; plan: ExecutionPlan};

export type TelemetrySnapshot = {
  /** 마지막으로 장비 값을 받은 시각. */
  at: string | null;
  sensors: SensorReading | null;
  sensorError: string | null;
  thermal: {value?: number; caption: string};
  devices: {name: string; label: string}[];
  run: {
    state: RunState;
    cursor: number;
    total: number;
    current: {order: number; label: string; group: string} | null;
    next: string | null;
  } | null;
};

export type ChatTurn = {role: 'user' | 'assistant'; content: string};

/** LLM이 지금 상황을 알 수 있게 대화와 함께 보내는 상태. */
export type ChatState = {
  stage: WorkStage;
  /** 구성 중인 실험 초안 서브그래프. Experiment(kind: 'draft') 노드 하나를 품는다. */
  draftGraph: GraphSnapshot | null;
  confirmedGraphId: string | null;
  plan: ExecutionPlan | null;
  /** 실행을 시작했으면 그때의 계획 버전. 시작한 뒤에는 계획을 고칠 수 없다. */
  runPlanVersion: number | null;
  /** 실행 중이면 최신 장비 값과 진행. */
  telemetry: TelemetrySnapshot | null;
  /** 화면에 띄운 결과 보고서의 결론·판단·사건. 보고서를 열기 전에는 없다. */
  report?: ReportBrief | null;
};

/**
 * 대화 말고 화면 조작이 보낸 요청. 'generate-plan'은 구성 확정 직후 실행 계획을 만들어 달라는 요청이다.
 * 마지막 사용자 메시지만으로 짐작하게 두면, 사용자가 같은 말을 직접 쳤을 때와 구분할 수 없다.
 */
export type ChatAction = 'generate-plan';

export type ChatRequest = {messages: ChatTurn[]; state: ChatState; action?: ChatAction};
