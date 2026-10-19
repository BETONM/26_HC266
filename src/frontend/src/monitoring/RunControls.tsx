import {useEffect, useRef, useState} from 'react';
import {Button} from 'react-aria-components';
import {emergencyStopRun, pauseRun, resumeRun} from '../app/runController';
import {useAppStore} from '../app/store';
import {stepNumber} from '../domain/plan';
import {isRunActive, runStateLabel, type RunState} from '../domain/run';

export function RunStateBadge({state}: {state: RunState}) {
  return (
    <span className="run-state" data-state={state}>
      <span className="run-state-dot" aria-hidden="true" />
      {runStateLabel[state]}
    </span>
  );
}

/**
 * 실행이 끝나 단추가 사라지면 포커스가 갈 곳. 완료면 '보고서 보기', 비상 정지면 '지금' 줄, 없으면 요약 열 실행 카드 제목.
 * 포커스가 다른 곳(입력창 등)에 있으면 건드리지 않는다.
 */
function refocusAfterEnd(first: 'monitor-report' | 'monitor-now' = 'monitor-report') {
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target =
      document.getElementById(first) ??
      document.getElementById('monitor-now') ??
      document.getElementById('confirm-card-title');
    target?.focus({preventScroll: true});
  });
}

/** 실행이 진행 중에서 끝남(완료·비상 정지)으로 바뀌는 순간 포커스를 다시 잡는다. 모니터링 화면에 하나 둔다. */
export function useRefocusOnRunEnd(state: RunState) {
  const active = isRunActive(state);
  const was = useRef(active);
  useEffect(() => {
    // 완료면 다음 할 일(보고서 보기)로, 비상 정지면 어디서 멈췄는지(지금 줄)로.
    if (was.current && !active) refocusAfterEnd(state === 'stopped' ? 'monitor-now' : 'monitor-report');
    was.current = active;
  }, [active, state]);
}

/**
 * 비상 정지. 실행 중이면 어디서든 닿게 여러 자리에 둔다(모니터링 머리, 요약 열 실행 카드, 좁은 폭 대화 쪽, 대화상자 머리).
 * 묻지 않고 바로 보낸다. 보내는 동안에도 막지 않는다(다시 누르면 다시 보낸다). 실패하면 로봇이 아직 움직일 수 있다고 분명히 말한다.
 */
export function EStopButton({compact = false, showStopped = false}: {compact?: boolean; showStopped?: boolean}) {
  const run = useAppStore((s) => s.run);
  const active = run ? isRunActive(run.state) : false;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 대화상자처럼 상태 배지가 막 뒤에 가려지는 자리에서는, 멈춘 뒤 단추 자리에 결과를 남긴다.
  if (!active) {
    return showStopped && run?.state === 'stopped' ? (
      <span className="estop-stopped">
        <RunStateBadge state="stopped" /> {run.cursor}/{run.total}동작에서 멈춤
      </span>
    ) : null;
  }
  return (
    <span className="estop" data-compact={compact || undefined}>
      <Button
        className="danger-button"
        aria-label="비상 정지 (E-STOP)"
        onPress={async () => {
          setPending(true);
          setError(null);
          const failure = await emergencyStopRun();
          setPending(false);
          setError(failure);
          if (!failure) refocusAfterEnd('monitor-now'); // 비상 정지 뒤에는 어디서 멈췄는지(지금 줄)를 먼저 읽게 한다.
        }}
      >
        <span className="estop-main">{pending ? '정지 보내는 중' : '비상 정지'}</span>
        <span className="estop-sub">E-STOP</span>
      </Button>
      {error && (
        <span className="estop-error" role="alert">
          비상 정지 신호를 보내지 못했습니다. 로봇이 아직 움직일 수 있습니다. 장비의 비상 정지 버튼을 직접 누르세요.
          (원인: {error})
        </span>
      )}
    </span>
  );
}

/** 일시정지 ↔ 재개. 한 단추라서 눌러도 포커스가 그 자리에 남는다. */
export function PauseButton() {
  const state = useAppStore((s) => s.run?.state);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state || !isRunActive(state)) return null;
  const paused = state === 'paused';
  return (
    <>
      <Button
        className="secondary-button"
        isPending={pending}
        onPress={async () => {
          setPending(true);
          setError(await (paused ? resumeRun() : pauseRun()));
          setPending(false);
        }}
      >
        {paused ? '재개' : '일시정지'}
      </Button>
      {error && (
        <p className="message-error monitor-command-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * 실행 상태가 바뀌면 스크린 리더에 알린다. 탭을 옮겨도 사라지지 않는 자리(WorkArea)에 둔다.
 * 동작 하나하나는 알리지 않는다(2~3초마다 말하면 대화를 쓸 수 없다). 비상 정지만 alert로.
 */
export function RunAnnouncer() {
  const run = useAppStore((s) => s.run);
  // cursor는 '끝난 동작 수'다. 멈춘 자리는 그다음 동작이다.
  const at = run ? `${run.total}동작 중 ${run.cursor}개 마침, 다음은 ${stepNumber(run.cursor)}` : '';
  const status = !run
    ? ''
    : run.state === 'paused'
      ? `실행 일시정지, ${at}`
      : run.state === 'running'
        ? '실행 중'
        : run.state === 'done'
          ? '실행 완료, 보고서를 볼 수 있습니다'
          : '';
  return (
    <>
      <p className="sr-only" role="status">
        {status}
      </p>
      <p className="sr-only" role="alert">
        {run?.state === 'stopped' ? `비상 정지: ${run.cursor}/${run.total}동작에서 멈췄습니다` : ''}
      </p>
    </>
  );
}
