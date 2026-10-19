// Server-Sent Events 파서. 네트워크 조각은 줄 중간에서 끊겨 오므로, 줄이 완성될 때까지 쌓아 두었다가
// 빈 줄을 만나면 이벤트 하나를 낸다. 규칙은 WHATWG HTML 'Interpreting an event stream'을 따른다.

export type SseMessage = {event: string; data: string; id?: string};

export function createSseParser() {
  let buffer = '';
  let data: string[] = [];
  let event = '';
  let id: string | undefined;
  let firstChunk = true;

  const dispatch = (out: SseMessage[]) => {
    if (data.length > 0) out.push({event: event || 'message', data: data.join('\n'), ...(id !== undefined && {id})});
    data = [];
    event = '';
  };

  const processLine = (line: string, out: SseMessage[]) => {
    if (line === '') return dispatch(out);
    if (line.startsWith(':')) return; // 주석·keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id' && !value.includes('\0')) id = value;
  };

  return {
    /** 조각을 넣고, 완성된 이벤트를 돌려받는다. */
    push(chunk: string): SseMessage[] {
      if (firstChunk) {
        firstChunk = false;
        if (chunk.startsWith('﻿')) chunk = chunk.slice(1);
      }
      buffer += chunk;
      const out: SseMessage[] = [];
      // CRLF, LF, CR 모두 줄 끝이다. 조각 끝의 CR은 다음 조각의 LF와 짝일 수 있어 남겨 둔다.
      const pattern = /\r\n|\n|\r(?!$)/g;
      let start = 0;
      for (let match = pattern.exec(buffer); match; match = pattern.exec(buffer)) {
        processLine(buffer.slice(start, match.index), out);
        start = match.index + match[0].length;
      }
      buffer = buffer.slice(start);
      return out;
    },
    /** 스트림이 끝났을 때. 빈 줄로 끝나지 않은 마지막 이벤트는 규격대로 버린다. */
    end(): SseMessage[] {
      buffer = '';
      data = [];
      event = '';
      return [];
    },
  };
}
