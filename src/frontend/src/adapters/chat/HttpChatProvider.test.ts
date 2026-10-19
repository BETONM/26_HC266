import {afterEach, describe, expect, it, vi} from 'vitest';
import type {ChatEvent, ChatRequest} from '../../chat/types';
import {HttpChatProvider} from './HttpChatProvider';

const request: ChatRequest = {
  messages: [{role: 'user', content: '재고'}],
  state: {stage: 'graph', draftGraph: null, confirmedGraphId: null, plan: null, runPlanVersion: null, telemetry: null},
};

// 서버가 조각을 아무 데서나 끊어 보내는 상황을 흉내 낸다.
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function run(response: Response) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  const events: ChatEvent[] = [];
  for await (const event of new HttpChatProvider('http://llm').send(request, new AbortController().signal)) events.push(event);
  return {events, fetchMock};
}

afterEach(() => vi.unstubAllGlobals());

describe('HttpChatProvider', () => {
  it('SSE 조각을 이벤트로 바꾸고, 모양이 틀린 줄은 건너뛴다', async () => {
    const body = streamOf([
      'data: {"type":"status","label":"조회 중"}\n\ndata: {"type":"text-',
      'delta","text":"안녕"}\n\ndata: not-json\n\ndata: {"type":"wat"}\n\n',
      'data: {"type":"done"}\n\ndata: {"type":"text-delta","text":"뒤"}\n\n',
    ]);
    const {events, fetchMock} = await run(new Response(body, {status: 200}));
    expect(events).toEqual([
      {type: 'status', label: '조회 중'},
      {type: 'text-delta', text: '안녕'},
      {type: 'done'},
    ]);
    expect(fetchMock).toHaveBeenCalledWith('http://llm/chat', expect.objectContaining({method: 'POST'}));
  });

  it('HTTP 오류는 본문의 detail을 error 이벤트로 낸다', async () => {
    const {events} = await run(new Response(JSON.stringify({detail: '모델이 과부하입니다.'}), {status: 503}));
    expect(events).toEqual([{type: 'error', message: '모델이 과부하입니다.'}]);
  });

  it('JSON이 아닌 오류 본문이어도 상태 코드로 알린다', async () => {
    const {events} = await run(new Response('<html>bad gateway</html>', {status: 502}));
    expect(events).toEqual([{type: 'error', message: 'LLM 서버가 502 응답을 보냈습니다.'}]);
  });

  it('done 없이 끝나면 그대로 끝낸다(호출한 쪽이 끊김으로 처리)', async () => {
    const {events} = await run(new Response(streamOf(['data: {"type":"text-delta","text":"반"}\n\n']), {status: 200}));
    expect(events).toEqual([{type: 'text-delta', text: '반'}]);
  });
});
