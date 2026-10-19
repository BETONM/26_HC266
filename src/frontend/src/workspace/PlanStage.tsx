import {useEffect, useMemo, useRef} from 'react';
import {Button, Disclosure, DisclosurePanel, Heading} from 'react-aria-components';
import {requestPlan, sendMessage} from '../app/chatController';
import {useAppStore} from '../app/store';
import {
  changedActionIds,
  currentVersion,
  planSteps,
  removedActions,
  stepNumber,
  versionOf,
  type ExecutionPlan,
  type PlanGroup,
  type PlanStep,
} from '../domain/plan';
import type {GraphSnapshot, NodeLabel} from '../graph/model';
import {Chevron, LockIcon} from './icons';

const KIND: Partial<Record<NodeLabel, string>> = {Chemical: '시약', Equipment: '기구', Device: '장비'};
/** 마지막으로 바뀐 동작을 보여 준 계획 버전. 컴포넌트가 다시 마운트돼도 남아야 해서 바깥에 둔다. */
let scrolledVersion: string | null = null;

const EXAMPLES = ['교반을 맨 뒤로', '센서 프로브 삽입을 마개 개방 뒤로', '05 삭제'];

/** 이 묶음이 어느 시약·기구·장비에서 나왔는가. 접어 두고, 펼치면 노드 이름과 쓰는 이유를 보여 준다. */
function GroupBasis({group, graph}: {group: PlanGroup; graph: GraphSnapshot}) {
  if (group.basis.length === 0) return null;
  return (
    <Disclosure className="plan-basis">
      <Heading level={4} className="plan-basis-heading">
        <Button
          slot="trigger"
          className="plan-basis-trigger"
          aria-label={`${group.title} · ${group.target} 근거 ${group.basis.length}개`}
        >
          <Chevron />
          근거 {group.basis.length}개
        </Button>
      </Heading>
      <DisclosurePanel className="plan-basis-panel">
        <ul className="plan-basis-list">
          {group.basis.map((b) => {
            const node = graph.nodes.find((n) => n.id === b.nodeId);
            const kind = node ? KIND[node.labels[0]!] : undefined;
            return (
              <li key={b.nodeId}>
                {kind && <span className="plan-basis-kind">{kind}</span>}
                <span className="plan-basis-name">{String(node?.properties.name ?? b.nodeId)}</span>
                {b.note && <span className="plan-basis-note">{b.note}</span>}
              </li>
            );
          })}
        </ul>
      </DisclosurePanel>
    </Disclosure>
  );
}

function StepRow({step, changed}: {step: PlanStep; changed: boolean}) {
  return (
    <li className="plan-step" data-changed={changed || undefined}>
      <span className="plan-step-no">{stepNumber(step.order)}</span>
      <span className="plan-step-label">{step.label}</span>
      {changed && <span className="plan-step-tag">바뀜</span>}
    </li>
  );
}

function VersionHistory({plan, locked, streaming}: {plan: ExecutionPlan; locked: boolean; streaming: boolean}) {
  return (
    <section className="plan-history" aria-labelledby="plan-history-title">
      <h3 id="plan-history-title" className="plan-section-title">
        버전 기록
      </h3>
      <ol className="plan-history-list">
        {[...plan.versions].reverse().map((v) => (
          <li key={v.version} aria-current={v.version === plan.version || undefined}>
            <span className="plan-history-version">v{v.version}</span>
            <span className="plan-history-summary">{v.summary}</span>
            {v.version === plan.version ? (
              <span className="plan-history-now">지금</span>
            ) : (
              !locked && (
                // 되돌리기도 채팅으로 보낸다. 계획을 바꾸는 길은 하나로 두고, 대화에 기록이 남게 한다.
                <Button
                  className="text-button plan-history-revert"
                  isDisabled={streaming}
                  aria-label={`v${v.version} 버전으로 되돌리기`}
                  onPress={() => sendMessage(`v${v.version} 버전으로 되돌려 줘`)}
                >
                  되돌리기
                </Button>
              )
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** 확정 뒤 실행 계획. 읽기 전용이고, 수정은 채팅으로 요청한다. */
export function PlanStage() {
  const confirmed = useAppStore((s) => s.confirmed);
  const plan = useAppStore((s) => s.plan);
  const run = useAppStore((s) => s.run);
  const streaming = useAppStore((s) => s.messages.some((m) => m.status === 'streaming'));
  const generating = useAppStore((s) =>
    s.messages.some((m) => m.status === 'streaming' && m.action === 'generate-plan'),
  );
  const statusLabel = useAppStore((s) => s.messages.findLast((m) => m.status === 'streaming')?.statusLabel);

  const view = useMemo(() => {
    if (!plan) return null;
    const now = currentVersion(plan);
    const previous = versionOf(plan, plan.version - 1)?.groups;
    return {
      now,
      steps: planSteps(now.groups),
      changed: new Set(changedActionIds(previous, now.groups)),
      removed: removedActions(previous, now.groups),
    };
  }, [plan]);

  // 채팅으로 고친 동작이 카드 밖에 있으면 보이는 곳으로 데려온다. 같은 버전은 한 번만(탭을 오갈 때마다 끌어내리지 않게).
  // '되돌리기'는 답이 오는 동안 비활성이 되면서 포커스를 놓친다. 포커스가 갈 곳을 잃었으면 계획 제목으로 받는다.
  // 입력창처럼 다른 곳에 있던 포커스는 건드리지 않는다.
  const articleRef = useRef<HTMLElement>(null);
  const versionKey = plan ? `${plan.id}:${plan.version}` : null;
  useEffect(() => {
    if (!versionKey || scrolledVersion === versionKey) return;
    scrolledVersion = versionKey;
    const article = articleRef.current;
    const active = document.activeElement;
    if (!active || active === document.body || article?.contains(active)) {
      // 바뀐 행으로 스크롤하면 제목은 밀려난다. 위에 붙어 늘 보이는 요약 줄이 있으면 그쪽이 받는다.
      (document.getElementById('plan-change') ?? document.getElementById('stage-title-plan'))?.focus({
        preventScroll: true,
      });
    }
    const first = article?.querySelector('.plan-step[data-changed]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first?.scrollIntoView({block: 'nearest', behavior: reduced ? 'auto' : 'smooth'});
  }, [versionKey]);

  if (!confirmed) return <p className="stage-placeholder">구성을 확정하면 실행 계획이 여기에 열립니다.</p>;

  if (!plan || !view) {
    return (
      <div className="stage-placeholder" aria-busy={generating}>
        <h2 id="stage-title-plan" className="stage-title" tabIndex={-1}>
          실행 계획
        </h2>
        <p>
          <strong>{confirmed.name}</strong>
        </p>
        {generating ? (
          <p className="plan-pending" role="status">
            {statusLabel ?? '실행 계획을 만드는 중'}
          </p>
        ) : (
          <>
            <p>아직 실행 계획이 없습니다. 답이 끊겼거나 만들지 못했을 수 있습니다.</p>
            <Button className="primary-button" isDisabled={streaming} onPress={() => requestPlan()}>
              실행 계획 만들기
            </Button>
          </>
        )}
      </div>
    );
  }

  const locked = run !== null;
  const stepsOf = (g: PlanGroup) => view.steps.filter((s) => s.group.id === g.id);
  // 시작한 뒤에는 '무엇이 바뀌었나'보다 '더 고칠 수 없다'가 먼저 읽혀야 한다. 바뀜 표시를 내린다.
  const changed = locked ? new Set<string>() : view.changed;
  // 요약이 이미 뺀 동작을 말하면('05 반응 비커에 분주 삭제') 다시 적지 않는다.
  const removed = view.removed.filter((s) => !view.now.summary.includes(s.label));

  return (
    <article ref={articleRef} className="plan" aria-labelledby="stage-title-plan">
      <header className="plan-head">
        <p className="plan-eyebrow">{confirmed.name}</p>
        <h2 id="stage-title-plan" className="stage-title" tabIndex={-1}>
          실행 계획 <span className="plan-version">v{plan.version}</span>
        </h2>
        <p className="plan-meta">
          {view.now.groups.length}묶음 · {view.steps.length}동작
          {plan.source === 'mock' && ' · 목업'}
        </p>
        {locked ? (
          <p className="plan-hint" data-locked>
            <LockIcon />
            <span>v{run.planVersion} 계획으로 실행을 시작했습니다. 시작한 뒤에는 계획을 고칠 수 없습니다.</span>
          </p>
        ) : (
          <p className="plan-hint">
            계획은 여기서 고치지 않습니다. 바꿀 점을 채팅으로 요청하세요. 예: {EXAMPLES.map((e) => `'${e}'`).join(', ')}
          </p>
        )}
      </header>

      {/* 바뀐 버전의 요약은 카드 위에 붙여 둔다. 바뀐 동작으로 스크롤해도 무엇을 바꿨는지 함께 보인다. */}
      {plan.version > 1 && !locked && (
        <p id="plan-change" className="plan-change" tabIndex={-1}>
          <span className="plan-change-version">v{plan.version}</span> {view.now.summary}
          {changed.size > 0 && <span className="plan-change-count"> · 바뀐 동작 {changed.size}개 표시</span>}
          {removed.length > 0 && (
            <span className="plan-change-removed">
              {' '}
              · 뺀 동작: {removed.map((s) => `${stepNumber(s.order)} ${s.label}`).join(', ')}
            </span>
          )}
        </p>
      )}

      <ol className="plan-groups">
        {view.now.groups.map((group) => {
          const own = stepsOf(group);
          return (
            <li key={group.id} className="plan-group" aria-labelledby={`plan-group-${group.id}`}>
              <h3 id={`plan-group-${group.id}`} className="plan-group-title">
                <span className="plan-group-range">
                  {stepNumber(own[0]!.order)}–{stepNumber(own.at(-1)!.order)}
                </span>
                <span>
                  {group.title}
                  {group.target && <span className="plan-group-target"> · {group.target}</span>}
                </span>
              </h3>
              <ol className="plan-steps">
                {own.map((step) => (
                  <StepRow key={step.id} step={step} changed={changed.has(step.id)} />
                ))}
              </ol>
              <GroupBasis group={group} graph={confirmed.graph} />
            </li>
          );
        })}
      </ol>

      <VersionHistory plan={plan} locked={locked} streaming={streaming} />

      {!locked && (
        <footer className="plan-foot">
          <p>구성을 바꾸려면 새 초안을 만들어야 합니다. 확정 기록은 그대로 남습니다.</p>
          <Button className="secondary-button" isDisabled={streaming} onPress={() => sendMessage('새 초안 만들어 줘')}>
            새 초안 만들기
          </Button>
        </footer>
      )}
    </article>
  );
}
