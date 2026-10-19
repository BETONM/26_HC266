import {useLayoutEffect, useRef, useState} from 'react';
import {Button} from 'react-aria-components';
import {retry} from '../../app/chatController';
import {useAppStore, type ChatMessage} from '../../app/store';
import {ExampleChips} from './ExampleChips';
import {MessageText} from './MessageText';

// 이만큼 안쪽이면 '맨 아래에 있다'고 본다. 스크롤이 몇 px 남은 것 때문에 따라 내려가기를 멈추지 않게.
const BOTTOM_SLACK_PX = 48;

function AssistantMessage({message}: {message: ChatMessage}) {
  const waiting = message.status === 'streaming' && message.text.length === 0;
  return (
    <li className="message" data-role="assistant" data-status={message.status}>
      <span className="sr-only">ChemBot: </span>
      {waiting ? <p className="message-pending">{message.statusLabel ?? '답을 준비하는 중'}</p> : <MessageText text={message.text} />}
      {message.status === 'streaming' && message.text.length > 0 && message.statusLabel && (
        <p className="message-meta">{message.statusLabel}</p>
      )}
      {message.status === 'stopped' && (
        <div className="message-meta message-actions">
          <span>답을 중단했습니다.</span>
          <Button className="text-button" onPress={() => retry(message.id)}>
            다시 받기
          </Button>
        </div>
      )}
      {message.status === 'error' && (
        <div className="message-error">
          <ErrorIcon />
          <p>
            답을 받지 못했습니다. {message.error}
            {message.text.length > 0 && ' 위의 글은 끊기기 전까지 받은 부분입니다.'}
          </p>
          <Button className="text-button" onPress={() => retry(message.id)}>
            다시 시도
          </Button>
        </div>
      )}
    </li>
  );
}

/** 스크린 리더에는 글자가 흘러들어올 때마다가 아니라, 상태가 바뀔 때만 알린다. */
function announcementOf(last: ChatMessage | undefined): string {
  if (!last || last.role !== 'assistant') return '';
  if (last.status === 'streaming') return last.statusLabel ?? '답을 준비하는 중';
  if (last.status === 'done') return '답을 받았습니다.';
  if (last.status === 'stopped') return '답을 중단했습니다.';
  return `답을 받지 못했습니다. ${last.error ?? ''}`;
}

function scrollToEnd(el: HTMLElement | null, follow: boolean) {
  if (el && follow) el.scrollTop = el.scrollHeight;
}

export function ChatLog() {
  const messages = useAppStore((s) => s.messages);
  const scroller = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const last = messages.at(-1);
  const contentKey = `${messages.length}:${last?.text.length ?? 0}:${last?.status}`;
  const lastUserId = messages.findLast((m) => m.role === 'user')?.id;
  const [atBottom, setAtBottom] = useState(true);
  // 맨 아래에서 마지막으로 본 내용. 그 뒤에 내용이 늘었으면 '새 메시지 보기'를 띄운다.
  const [seenKey, setSeenKey] = useState(contentKey);

  // 내가 새로 보낸 메시지는 읽던 자리와 상관없이 보이게 한다.
  useLayoutEffect(() => {
    if (!lastUserId) return;
    follow.current = true;
    scrollToEnd(scroller.current, true);
  }, [lastUserId]);

  // 사용자가 위로 올려 읽고 있으면 끌어내리지 않는다.
  useLayoutEffect(() => scrollToEnd(scroller.current, follow.current && contentKey.length > 0), [contentKey]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK_PX;
    follow.current = bottom;
    setAtBottom(bottom);
    if (bottom) setSeenKey(contentKey);
  };

  const jumpToBottom = () => {
    follow.current = true;
    scroller.current?.scrollTo({top: scroller.current.scrollHeight});
  };

  const unseen = !atBottom && seenKey !== contentKey;

  return (
    <div className="chat-log">
      {/* 스크롤 영역은 키보드로도 올리고 내릴 수 있어야 해서 포커스를 받는다. */}
      <div className="chat-scroll" ref={scroller} onScroll={onScroll} tabIndex={0} role="region" aria-label="대화 기록">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>실험이나 보유 인벤토리에 대해 물어보세요.</p>
            <ExampleChips />
          </div>
        ) : (
          <ol className="message-list">
            {messages.map((message) =>
              message.role === 'event' ? (
                // 구성 확정·실행 시작처럼 화면에서 한 일. 대화 사이에 구분선처럼 남겨 '언제 무엇을 했나'를 읽게 한다.
                <li key={message.id} className="message" data-role="event">
                  <p>{message.text}</p>
                </li>
              ) : message.role === 'user' ? (
                <li key={message.id} className="message" data-role="user">
                  <span className="sr-only">나: </span>
                  <p>{message.text}</p>
                </li>
              ) : (
                <AssistantMessage key={message.id} message={message} />
              ),
            )}
          </ol>
        )}
      </div>
      {unseen && (
        <Button className="jump-button" onPress={jumpToBottom}>
          새 메시지 보기
        </Button>
      )}
      <div className="sr-only" role="status">
        {announcementOf(last)}
      </div>
    </div>
  );
}

function ErrorIcon() {
  return (
    <svg className="message-error-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5v4M8 10.75v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
