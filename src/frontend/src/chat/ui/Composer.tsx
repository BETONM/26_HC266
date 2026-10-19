import {useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent} from 'react';
import {Button} from 'react-aria-components';
import {sendMessage, stopStreaming} from '../../app/chatController';
import {useAppStore} from '../../app/store';

/**
 * 채팅 입력. 첫 화면의 떠 있는 입력창도 같은 컴포넌트·같은 DOM 노드다. 그래서 IME 처리와 전송 규칙이 하나로 유지되고,
 * 첫 화면에서 작업 화면으로 넘어가도 포커스와 조합 중인 글자가 끊기지 않는다.
 */
export function Composer() {
  const id = useId();
  const value = useAppStore((s) => s.composerText);
  const screen = useAppStore((s) => s.screen);
  const streaming = useAppStore((s) => s.messages.some((m) => m.status === 'streaming'));
  const focusToken = useAppStore((s) => s.composerFocusToken);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const setValue = (composerText: string) => useAppStore.setState({composerText});

  // 첫 화면에 오면 바로 입력할 수 있게 한다.
  useEffect(() => {
    if (screen === 'landing') textarea.current?.focus();
  }, [screen]);

  // 노드 참조를 넣었을 때('대화에 넣기', 첫 화면에서 노드로 진입) 이어서 쓸 수 있게 포커스와 커서를 끝에 둔다.
  useEffect(() => {
    const el = textarea.current;
    if (!el || focusToken === 0) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [focusToken]);

  // 줄이 늘면 입력창도 늘린다. 보낸 뒤 비우거나 3단계에서 노드 참조를 넣을 때처럼 밖에서 바뀌어도 맞춘다.
  useLayoutEffect(() => fitHeight(textarea.current, value), [value]);

  const submit = () => {
    if (sendMessage(value)) setValue('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    // 한글 IME 조합 중의 Enter는 조합을 끝내는 키다. 여기서 보내면 마지막 글자가 한 번 더 전송된다.
    // Safari는 조합 확정 Enter에서 isComposing이 false라 keyCode 229로도 거른다.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  };

  const hintId = `${id}-hint`;
  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={id}>
        메시지
      </label>
      <textarea
        id={id}
        ref={textarea}
        className="composer-input"
        rows={1}
        value={value}
        placeholder={screen === 'landing' ? '무엇을 하고 싶으세요?' : '메시지를 입력하세요'}
        aria-describedby={hintId}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <span id={hintId} className="sr-only">
        Enter로 보내고 Shift+Enter로 줄을 바꿉니다.
      </span>
      {streaming ? (
        <Button className="composer-button" data-variant="stop" onPress={stopStreaming}>
          <StopIcon />
          <span>중단</span>
        </Button>
      ) : (
        <Button className="composer-button" data-variant="send" type="submit" isDisabled={value.trim().length === 0}>
          <SendIcon />
          <span>보내기</span>
        </Button>
      )}
    </form>
  );
}

// CSS field-sizing을 못 쓰는 브라우저가 있어 직접 잰다.
function fitHeight(el: HTMLTextAreaElement | null, value: string) {
  if (!el) return;
  el.style.height = 'auto';
  if (value.length > 0) el.style.height = `${el.scrollHeight}px`;
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}
