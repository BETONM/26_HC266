import {useEffect, useLayoutEffect, useRef} from 'react';
import {Button, ToggleButton, ToggleButtonGroup, type Key} from 'react-aria-components';
import {ChatLog} from '../chat/ui/ChatLog';
import {Composer} from '../chat/ui/Composer';
import {ExampleChips} from '../chat/ui/ExampleChips';
import {HazardSummary} from '../hazard/HazardBadge';
import {WorkArea} from '../workspace/WorkArea';
import './app.css';
import '../chat/ui/chat.css';
import '../workspace/workspace.css';
import {undoNewConversation} from './chatController';
import {ConfigWarnings} from './ConfigWarnings';
import {EStopButton} from '../monitoring/RunControls';
import {isRunActive} from '../domain/run';
import {initHistory} from './history';
import {useAppStore, type NarrowPane} from './store';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 화면은 카드 몇 장이다: 레일 | 채팅 | 그래프 | 요약 열(app.css). 첫 화면과 작업 화면은 같은 요소들의 자리만 바꾼다.
 * 그래서 그래프와 입력창이 다시 마운트되지 않고, 진입 전환이 '같은 것이 줄어드는' 움직임이 된다.
 * 자식의 순서와 개수를 화면에 따라 바꾸지 않는다. 바꾸면 React가 다른 요소로 보고 새로 만든다.
 */
export function App() {
  const screen = useAppStore((s) => s.screen);
  const pane = useAppStore((s) => s.pane);
  const stage = useAppStore((s) => s.stage);
  const setPane = useAppStore((s) => s.setPane);
  const hasMessages = useAppStore((s) => s.messages.length > 0);
  const undo = useAppStore((s) => s.undo);
  const draft = useAppStore((s) => s.draftGraph);
  const runActive = useAppStore((s) => (s.run ? isRunActive(s.run.state) : false));
  const landing = screen === 'landing';
  const dock = useRef<HTMLDivElement>(null);
  const lastDockRect = useRef<DOMRect | null>(null);

  useEffect(() => initHistory(), []);

  // 입력창은 첫 화면의 그래프 카드 아래쪽 가운데에서 채팅 카드 아래로 내려앉는다. 같은 DOM 노드라 포커스와
  // 한글 조합이 끊기지 않는다. 자리만 바뀌면 순간이동처럼 보여서, 이전 자리에서 새 자리로 미끄러지게 한다(FLIP).
  // 매 렌더 끝의 자리를 기억해 두고, 화면이 바뀐 렌더에서만 움직인다.
  const lastScreen = useRef(screen);
  useLayoutEffect(() => {
    const el = dock.current;
    if (!el) return;
    const after = el.getBoundingClientRect();
    const before = lastDockRect.current;
    const changed = lastScreen.current !== screen;
    lastScreen.current = screen;
    lastDockRect.current = after;
    if (!changed || !before || prefersReducedMotion()) return;
    if (Math.abs(before.left - after.left) < 1 && Math.abs(before.top - after.top) < 1) return;
    // 시간과 곡선은 진입 전환 토큰(--motion-enter, --ease-enter)을 그대로 읽어 그래프 카드와 함께 움직인다.
    const style = getComputedStyle(el);
    el.animate(
      [{transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)`}, {transform: 'none'}],
      {
        duration: parseFloat(style.getPropertyValue('--motion-enter')) || 600,
        easing: style.getPropertyValue('--ease-enter').trim() || 'ease-out',
      },
    );
  });

  return (
    <div className="app" data-screen={screen} data-pane={pane} data-stage={stage} data-run={runActive ? 'active' : undefined}>
      <WorkArea
        beforePanels={
          <>
            {/* 좁은 폭에서만: 대화와 작업 영역을 오간다. 위험 요약은 대화 쪽에서도 보인다. */}
            <div className="pane-bar" inert={landing}>
              <ToggleButtonGroup
                className="pane-switch"
                aria-label="보기"
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[pane]}
                onSelectionChange={(keys: Set<Key>) => {
                  const [next] = keys;
                  if (next) setPane(next as NarrowPane);
                }}
              >
                <ToggleButton id="chat" className="pane-switch-button">
                  대화
                </ToggleButton>
                <ToggleButton id="work" className="pane-switch-button">
                  작업 영역
                </ToggleButton>
              </ToggleButtonGroup>
              <HazardSummary graph={draft} className="pane-hazards" />
              {/* 좁은 폭의 대화 쪽에서도 비상 정지에 닿게. 작업 영역 쪽은 아래 실행 띠가 맡는다. */}
              <span className="pane-estop">
                <EStopButton compact />
              </span>
            </div>

            <section className="chat-card" aria-label="대화" inert={landing}>
              <header className="chat-header">
                <h2 className="chat-title">대화</h2>
                <ConfigWarnings />
              </header>
              <div className="chat-log-slot">
                <ChatLog />
              </div>
            </section>

            <div className="composer-dock" ref={dock}>
              {landing && undo && (
                <p className="undo-notice" role="status">
                  새 대화를 시작했습니다.
                  <Button className="text-button" onPress={undoNewConversation}>
                    이전 대화로 되돌리기
                  </Button>
                </p>
              )}
              {landing && !hasMessages && <ExampleChips />}
              <Composer />
            </div>
          </>
        }
      />
    </div>
  );
}
