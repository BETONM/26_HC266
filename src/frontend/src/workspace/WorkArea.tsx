import {lazy, Suspense, useEffect, useRef, useState, type ReactNode} from 'react';
import {Button, Tab, TabList, TabPanel, Tabs, Tooltip, TooltipTrigger, type Key} from 'react-aria-components';
import {newConversation} from '../app/chatController';
import {useAppStore} from '../app/store';
import {WORK_STAGES, workStageLabel, type WorkStage} from '../chat/types';
import {currentVersion} from '../domain/plan';
import {isRunActive} from '../domain/run';
import {GraphPanel} from './GraphPanel';
import {LockIcon} from './icons';
import {PlanStage} from './PlanStage';
import {LiveFeed} from '../monitoring/feed';
import {MonitoringStage} from '../monitoring/MonitoringStage';
import {RunAnnouncer} from '../monitoring/RunControls';
import {SidePanel} from './SidePanel';

// 레일 아이콘. 단계마다 하나씩, 글자 이름을 아래에 함께 단다(아이콘만으로는 무엇인지 알기 어렵다).
const ICONS: Record<WorkStage, string> = {
  graph:
    'M5 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M15 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 15m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M6.9 5.8 13 5.2M6 7.8l3 5.3M14.2 6.8l-3.3 6.4',
  plan: 'M8 5h8.5M8 10h8.5M8 15h8.5M3 5l1 1 1.8-2M3 10l1 1 1.8-2M3.5 15h1.5',
  monitoring: 'M2 10.5h3.5l2.2-5.5 3.2 10 2.3-5.5H18',
  report: 'M5 2.5h7l3 3v12H5zM12 2.5V6h3M8 10h5M8 13.5h5',
};

function Icon({d, size = 20}: {d: string; size?: number}) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 보고서(차트 라이브러리 포함)는 보고서 탭을 열 때 불러온다. 실험을 구성하는 동안의 첫 로딩을 가볍게 하려고.
const ReportStage = lazy(() => import('../report/ReportStage').then((m) => ({default: m.ReportStage})));

function useWide() {
  const query = '(min-width: 48rem)';
  const [wide, setWide] = useState(() => typeof window === 'undefined' || window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setWide(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return wide;
}

/**
 * 레일(작업 단계) + 가운데 카드(단계별 내용) + 요약 열. 첫 화면에서도 같은 요소로 남는다.
 * 그래프 패널은 다른 단계를 볼 때도 마운트를 유지한다. 다시 마운트하면 레이아웃이 처음부터 돈다.
 */
export function WorkArea({beforePanels}: {beforePanels?: ReactNode}) {
  const screen = useAppStore((s) => s.screen);
  const stage = useAppStore((s) => s.stage);
  const setStage = useAppStore((s) => s.setStage);
  const confirmed = useAppStore((s) => s.confirmed);
  const run = useAppStore((s) => s.run);
  const wide = useWide();
  // 실행 계획은 구성을 확정하면, 모니터링은 실행을 시작하면, 보고서는 실행이 끝나면 열린다.
  const ended = run !== null && !isRunActive(run.state);
  const locked: WorkStage[] = ended
    ? []
    : run
      ? ['report']
      : confirmed
        ? ['monitoring', 'report']
        : ['plan', 'monitoring', 'report'];
  const note = ended
    ? ''
    : run
      ? '보고서는 실행이 끝나면(완료 또는 비상 정지) 열립니다.'
      : confirmed
        ? '모니터링 · 보고서는 실행을 시작하면 열립니다.'
        : '실행 계획 · 모니터링 · 보고서는 구성을 확정하면 차례로 열립니다.';
  const landing = screen === 'landing';
  const plan = useAppStore((s) => s.plan);

  // 구성 확정·실행 시작처럼 단계가 바뀌는 조작은 그 단추를 지운다(카드가 바뀐다). 포커스가 문서 처음으로 빠지지 않게
  // 새 단계의 제목으로 옮긴다. 대화상자가 닫히며 포커스를 되돌리는 것보다 늦게 하려고 두 프레임 뒤에 한다.
  const firstStage = useRef(true);
  useEffect(() => {
    if (firstStage.current) {
      firstStage.current = false;
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        const title = document.getElementById(`stage-title-${stage}`);
        (title ?? document.querySelector<HTMLElement>('.rail-tab[aria-selected="true"]'))?.focus({preventScroll: true});
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [stage]);

  return (
    <Tabs
      className="work-area"
      orientation={wide ? 'vertical' : 'horizontal'}
      selectedKey={stage}
      onSelectionChange={(key: Key) => setStage(key as WorkStage)}
      disabledKeys={locked}
    >
      <nav className="rail" aria-label="ChemBot Lab">
        <span className="rail-logo" role="img" aria-label="ChemBot Lab">
          <Icon
            d="M8 2.5h4M9 2.5v5L4.5 15a1.6 1.6 0 0 0 1.4 2.5h8.2a1.6 1.6 0 0 0 1.4-2.5L11 7.5v-5M6.5 12.5h7"
            size={22}
          />
        </span>
        <TabList className="rail-tabs" aria-label="작업 단계" aria-describedby="stage-tabs-note">
          {WORK_STAGES.map((key) => (
            <Tab key={key} id={key} className="rail-tab">
              <span className="rail-tab-icon">
                <Icon d={ICONS[key]} />
                {locked.includes(key) && <LockIcon className="rail-lock" />}
              </span>
              <span className="rail-tab-label">{workStageLabel[key]}</span>
              {/* 열린 단계와 잠긴 단계가 흐림만으로 갈리지 않게 자물쇠와 글로도 알린다. */}
              {locked.includes(key) && <span className="sr-only"> (잠김)</span>}
            </Tab>
          ))}
        </TabList>
        <p id="stage-tabs-note" className="sr-only">
          {note}
        </p>
        {/* 채팅으로 고친 계획을 어느 탭에 있든 알린다. 계획 카드 안에 두면 탭이 바뀌며 새로 마운트돼 읽히지 않는다. */}
        <p className="sr-only" role="status">
          {plan && plan.version > 1 ? `실행 계획 v${plan.version}: ${currentVersion(plan).summary}` : ''}
        </p>
        {!landing && (
          <TooltipTrigger delay={400}>
            <Button className="rail-new-chat" aria-label="새 대화" onPress={newConversation}>
              <Icon d="M10 4v12M4 10h12" />
            </Button>
            <Tooltip className="tooltip" placement={wide ? 'right' : 'bottom'}>
              새 대화
            </Tooltip>
          </TooltipTrigger>
        )}
      </nav>
      {/* 키보드 순서를 화면 순서(레일 | 대화 | 그래프 | 요약)와 맞춘다. 카드는 모두 절대 위치라 DOM 순서만 바뀐다. */}
      {beforePanels}
      <TabPanel id="graph" className="stage-panel stage-panel-graph" shouldForceMount>
        <GraphPanel />
      </TabPanel>
      <TabPanel id="plan" className="stage-panel stage-card">
        <PlanStage />
      </TabPanel>
      <TabPanel id="monitoring" className="stage-panel stage-card">
        <MonitoringStage />
      </TabPanel>
      <TabPanel id="report" className="stage-panel stage-card">
        <Suspense fallback={<p className="stage-placeholder">보고서를 불러오는 중</p>}>
          <ReportStage />
        </Suspense>
      </TabPanel>
      <LiveFeed />
      <RunAnnouncer />
      <SidePanel />
    </Tabs>
  );
}
