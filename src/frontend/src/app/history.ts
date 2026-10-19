// 첫 화면 ↔ 작업 화면을 브라우저 뒤로가기와 잇는다. 라우터 없이 history.state에 화면 이름만 둔다.

import {useAppStore, type Screen} from './store';

type HistoryState = {screen: Screen} | null;

export function initHistory(): () => void {
  let fromPop = false;
  const initial = useAppStore.getState().screen;
  // 저장된 대화로 바로 작업 화면을 열어도, 뒤로가기 한 번이면 첫 화면으로 간다.
  history.replaceState({screen: 'landing'} satisfies HistoryState, '');
  if (initial === 'workspace') history.pushState({screen: 'workspace'} satisfies HistoryState, '');

  const onPop = (event: PopStateEvent) => {
    const state = event.state as HistoryState;
    const {messages} = useAppStore.getState();
    fromPop = true;
    useAppStore.getState().setScreen(state?.screen === 'workspace' && messages.length > 0 ? 'workspace' : 'landing');
    fromPop = false;
  };
  window.addEventListener('popstate', onPop);

  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (state.screen === previous.screen || fromPop) return;
    const current = (history.state as HistoryState)?.screen;
    if (state.screen === 'workspace' && current !== 'workspace') {
      history.pushState({screen: 'workspace'} satisfies HistoryState, '');
    } else if (state.screen === 'landing' && current === 'workspace') {
      // '새 대화'로 나갈 때는 작업 화면 항목을 걷어 낸다. 앞으로가기로 빈 작업 화면이 열리지 않게.
      history.back();
    }
  });

  return () => {
    window.removeEventListener('popstate', onPop);
    unsubscribe();
  };
}
