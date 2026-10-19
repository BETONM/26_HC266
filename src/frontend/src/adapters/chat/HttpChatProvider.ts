import {toChatEvent} from '../../chat/events';
import {createSseParser} from '../../chat/sse';
import type {ChatEvent, ChatRequest} from '../../chat/types';
import type {ChatProvider} from './ChatProvider';

// 서버는 `POST {baseUrl}/chat`에 ChatRequest(JSON)를 받고, ChatEvent를 한 이벤트당 `data:` 한 줄(JSON)로
// SSE 스트림에 흘려보낸다고 가정한다. 경로 문자열은 이 파일 안에만 둔다.
const CHAT_PATH = '/chat';

async function describeHttpError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(body) as {detail?: unknown; error?: unknown};
    const detail = parsed.detail ?? parsed.error;
    if (typeof detail === 'string' && detail) return detail;
  } catch {
    // JSON이 아니어도 상태 코드로 알린다.
  }
  return `LLM 서버가 ${response.status} 응답을 보냈습니다.`;
}

export class HttpChatProvider implements ChatProvider {
  constructor(private readonly baseUrl: string) {}

  async *send(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    const response = await fetch(`${this.baseUrl}${CHAT_PATH}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Accept: 'text/event-stream'},
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok || !response.body) {
      yield {type: 'error', message: await describeHttpError(response)};
      return;
    }

    const parser = createSseParser();
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        for (const message of parser.push(value)) {
          let raw: unknown;
          try {
            raw = JSON.parse(message.data);
          } catch {
            continue; // JSON이 아닌 한 줄 때문에 응답 전체를 버리지 않는다.
          }
          const event = toChatEvent(raw);
          if (!event) continue;
          yield event;
          if (event.type === 'done' || event.type === 'error') return;
        }
      }
    } finally {
      reader.releaseLock();
    }
    // done 없이 끝났다. 호출한 쪽이 '연결이 끊겼다'로 처리한다.
  }
}
