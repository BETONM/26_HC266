import {Button, ToggleButton} from 'react-aria-components';
import {useAppStore} from '../app/store';
import {specFromDraftGraph} from '../domain/draft';
import {currentVersion, planSteps} from '../domain/plan';
import {
  hasLabel,
  inventoryStatusLabel,
  severityLabel,
  severityRank,
  type GraphSnapshot,
  type Severity,
} from '../graph/model';
import {countHazards, HazardSummary, SeverityGlyph} from '../hazard/HazardBadge';
import {ConfirmDialog} from './ConfirmDialog';
import {showHazardList, useWide} from './GraphPanel';
import {NodeDetail} from './NodeDetail';
import {RunDialog} from './RunDialog';
import {clockTime, isRunActive, runStateLabel} from '../domain/run';
import {EStopButton} from '../monitoring/RunControls';

export type StockRow = {
  id: string;
  name: string;
  label: string;
  amount: number;
  quantity: number | null;
  unit: string;
  status: string | null;
};

/** 초안이 쓰는 시약의 양과 보유량. 미보유면 quantity가 null이다. */
export function stockRows(draft: GraphSnapshot | null, inventory: GraphSnapshot | null): StockRow[] {
  const spec = specFromDraftGraph(draft);
  if (!spec) return [];
  const nodes = new Map([...(inventory?.nodes ?? []), ...(draft?.nodes ?? [])].map((n) => [n.id, n]));
  return spec.uses.map((use) => {
    const node = nodes.get(use.chemicalId);
    const p = node && hasLabel(node, 'Chemical') ? node.properties : null;
    const short = p ? use.amount > p.quantity : true;
    return {
      id: use.chemicalId,
      name: p?.name ?? use.chemicalId,
      label: p?.formula || p?.name || use.chemicalId,
      amount: use.amount,
      quantity: p ? p.quantity : null,
      unit: use.unit,
      status: !p ? '미보유' : short ? '부족' : p.status !== 'available' ? inventoryStatusLabel[p.status] : null,
    };
  });
}

/** 가장 심각한 위험 하나. 같은 심각도면 그래프 순서. */
function heaviestHazard(graph: GraphSnapshot | null) {
  const hazards = (graph?.nodes ?? []).filter((n) => hasLabel(n, 'Hazard'));
  return hazards.reduce<(typeof hazards)[number] | null>(
    (best, n) =>
      !best ||
      severityRank(String(n.properties.severity) as Severity) >
        severityRank(String(best.properties.severity) as Severity)
        ? n
        : best,
    null,
  );
}

/**
 * 위험 요약: 이 화면에서 단 하나의 어두운 카드. 위험을 '몇 건'이라는 양이 아니라 가장 무거운 위험의 이름으로 먼저 말한다.
 */
function HazardCard({graph}: {graph: GraphSnapshot | null}) {
  const counts = countHazards(graph);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = heaviestHazard(graph);
  return (
    <section className="hz-card" aria-labelledby="hz-card-title">
      <h3 id="hz-card-title" className="hz-card-title">
        이 실험의 위험
      </h3>
      {!graph ? (
        <p className="hz-card-empty">실험을 구성하면 위험이 여기에 모입니다.</p>
      ) : top && hasLabel(top, 'Hazard') ? (
        <>
          <p className="hz-card-top">
            <SeverityGlyph severity={top.properties.severity} />
            <span>
              <span className="hz-card-top-severity">{severityLabel[top.properties.severity]}</span>{' '}
              {top.properties.title}
            </span>
          </p>
          {total > 1 && <p className="hz-card-more">외 {total - 1}건</p>}
          <HazardSummary graph={graph} className="hz-card-summary" />
          <Button className="hz-card-link" onPress={showHazardList}>
            위험 목록 보기
          </Button>
        </>
      ) : (
        <p className="hz-card-empty">등록된 위험이 없습니다. 실제 제품의 MSDS로 한 번 더 확인하세요.</p>
      )}
    </section>
  );
}

/** 작업 화면 오른쪽 열: 위험 요약, 구성 확정, 그래프 빠른 보기, 재고. 좁은 폭에서는 구성 확정 띠 하나로 줄어든다. */
export function SidePanel() {
  const screen = useAppStore((s) => s.screen);
  const stage = useAppStore((s) => s.stage);
  const draft = useAppStore((s) => s.draftGraph);
  const confirmed = useAppStore((s) => s.confirmed);
  const plan = useAppStore((s) => s.plan);
  const run = useAppStore((s) => s.run);
  const streaming = useAppStore((s) => s.messages.some((m) => m.status === 'streaming'));
  const lab = useAppStore((s) => s.lab);
  const hazardsOnly = useAppStore((s) => s.hazardsOnly);
  const labGraph = lab.status === 'ready' ? lab.graph : null;
  const query = useAppStore((s) => s.queryGraph);
  const selectedId = useAppStore((s) => s.selectedNodeId);
  const wide = useWide();
  const graph = confirmed?.graph ?? draft;
  const rows = stockRows(graph, labGraph);
  // 그래프 카드가 지금 보여 주는 것(GraphPanel과 같은 순서): 초안 > 조회 결과 > 연구실 전체.
  const shown = draft ?? query ?? labGraph;
  const inventory = labGraph ?? shown;
  const selected = selectedId
    ? (shown?.nodes.find((n) => n.id === selectedId) ?? labGraph?.nodes.find((n) => n.id === selectedId) ?? null)
    : null;
  // 넓은 폭의 노드 상세는 위험 카드 아래, 요약 열 흐름 안에 연다. 위험 요약은 상세를 보는 동안에도 남는다.
  const detail = wide && screen === 'workspace' && stage === 'graph' && selected && inventory ? selected : null;
  // 위험이 없는 그래프에서 '위험만 보기'를 켜면 빈 화면이 된다.
  const hazardCount = (shown?.nodes ?? []).filter((n) => n.labels[0] === 'Hazard').length;

  return (
    <aside className="side" aria-label="구성 요약" inert={screen === 'landing'}>
      <HazardCard graph={graph} />

      {detail && inventory ? (
        <NodeDetail
          node={detail}
          inventory={inventory}
          draft={draft}
          onClose={() => useAppStore.setState({selectedNodeId: null})}
        />
      ) : (
        <>
          {/* 다음 할 일 카드. 확정 전에는 '구성 확정', 확정 뒤에는 '실행 시작', 시작한 뒤에는 실행 기록을 보여 준다. */}
          <section className="side-card confirm-card" aria-labelledby="confirm-card-title">
            <h3 id="confirm-card-title" className="side-card-title" tabIndex={-1}>
              {confirmed ? '실행' : '구성 확정'}
            </h3>
            <HazardSummary graph={graph} className="confirm-card-hazards" />
            {run ? (
              <>
                <p className="side-card-text">
                  <strong className="side-run-state">{runStateLabel[run.state]}</strong> · v{run.planVersion} 계획 ·{' '}
                  {run.cursor}/{run.total}동작 · <span className="nowrap">{clockTime(run.startedAt, false)} 시작</span>
                </p>
                {/* 실행 중에는 어느 탭에서든 비상 정지에 닿게 이 카드에 둔다. 좁은 폭에서는 아래 띠가 된다. */}
                <EStopButton compact />
                {!isRunActive(run.state) && stage !== 'report' && (
                  <Button
                    className="primary-button side-card-action"
                    onPress={() => useAppStore.setState({stage: 'report'})}
                  >
                    보고서 보기
                  </Button>
                )}
                {stage !== 'monitoring' && (
                  <Button
                    className="secondary-button side-card-action"
                    onPress={() => useAppStore.setState({stage: 'monitoring'})}
                  >
                    모니터링 보기
                  </Button>
                )}
              </>
            ) : confirmed ? (
              <>
                <p className="side-card-text">
                  {plan
                    ? `계획 v${plan.version} · ${planSteps(currentVersion(plan).groups).length}동작으로 시작합니다. 시작한 뒤에는 계획을 고칠 수 없습니다.`
                    : '실행 계획이 생기면 시작할 수 있습니다.'}
                </p>
                {plan ? (
                  <RunDialog plan={plan} confirmed={confirmed} isDisabled={streaming} />
                ) : (
                  <Button className="primary-button side-card-action" isDisabled>
                    실행 시작
                  </Button>
                )}
                {stage !== 'plan' && (
                  <Button
                    className="secondary-button side-card-action"
                    onPress={() => useAppStore.setState({stage: 'plan'})}
                  >
                    실행 계획 보기
                  </Button>
                )}
              </>
            ) : draft ? (
              <>
                <p className="side-card-text">확정하면 이 구성으로 실행 계획을 만듭니다.</p>
                <ConfirmDialog draft={draft} inventory={labGraph} />
              </>
            ) : (
              <>
                <p className="side-card-text">대화로 실험을 구성하면 확정할 수 있습니다.</p>
                <Button className="primary-button" isDisabled>
                  구성 확정
                </Button>
              </>
            )}
          </section>

          {stage === 'graph' && (
            <div className="tiles" role="group" aria-label="그래프 보기">
              {/* 켜졌는지는 면 색만이 아니라 기호(삼각형 → 체크)와 글자로도 알린다. */}
              <ToggleButton
                className="tile"
                isDisabled={hazardCount === 0 && !hazardsOnly}
                isSelected={hazardsOnly}
                onChange={(value) => useAppStore.setState({hazardsOnly: value})}
              >
                <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
                  <path
                    d={hazardsOnly ? 'M4 10.5 8 14.5 16 6' : 'M10 3 17.5 16h-15zM10 8v3.5M10 13.6v.2'}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  {hazardsOnly ? '위험만 보는 중' : hazardCount === 0 ? '이 그래프에는 위험이 없습니다' : '위험만 보기'}
                </span>
              </ToggleButton>
            </div>
          )}

          <section className="side-card stock-card" aria-labelledby="stock-card-title">
            <h3 id="stock-card-title" className="side-card-title">
              재고
            </h3>
            <p className="side-card-text">이 실험이 쓰는 양 / 보유량</p>
            {rows.length === 0 ? (
              <p className="side-card-text">아직 쓰는 시약이 없습니다.</p>
            ) : (
              <ul className="stock-list">
                {rows.map((row) => (
                  <li key={row.id}>
                    <span className="stock-name" title={row.name}>
                      {row.label}
                    </span>
                    <span className="stock-bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(4, row.quantity ? (row.amount / row.quantity) * 100 : 100))}%`,
                        }}
                      />
                    </span>
                    <span className="stock-num">
                      <span className="sr-only">{row.name}: </span>
                      {row.amount} / {row.quantity ?? 0} {row.unit}
                      {row.status && <span className="stock-chip">{row.status}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </aside>
  );
}
