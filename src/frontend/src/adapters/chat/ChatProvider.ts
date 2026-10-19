import type {ChatEvent, ChatRequest} from '../../chat/types';

/**
 * LLM 접근. 스트리밍 텍스트와 구조화된 이벤트(그래프, 계획)를 한 스트림으로 준다.
 *
 * - 정상 응답은 `done`으로 끝난다. `done` 없이 스트림이 끝나면 연결이 끊긴 것으로 본다.
 * - 서버가 알려 주는 실패는 `error` 이벤트로, 네트워크 실패는 예외로 온다.
 * - signal로 중단하면 AbortError로 끝난다.
 */
export interface ChatProvider {
  send(request: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
