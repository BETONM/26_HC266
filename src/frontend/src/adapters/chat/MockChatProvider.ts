import type {ChatEvent, ChatRequest} from '../../chat/types';
import {createFaultInjector, MockFaultError, sleep, type FaultOptions} from '../faults';
import type {GraphSource} from '../graph/GraphSource';
import type {ChatProvider} from './ChatProvider';
import {respondMock} from './mock/respond';

export type MockChatOptions = {
  /** 글자 묶음 사이의 지연(ms). 0이면 한 번에 낸다. */
  charDelayMs?: number;
  /** 한 번에 내보내는 글자 수. */
  charsPerTick?: number;
  faults?: FaultOptions;
};

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

/** 키워드 의도 분류 + GraphSource 조회로 답하는 목업. 답을 글자 단위로 흘려보낸다. */
export class MockChatProvider implements ChatProvider {
  private faults;
  private charDelayMs: number;
  private charsPerTick: number;

  constructor(
    private readonly graph: GraphSource,
    options: MockChatOptions = {},
  ) {
    this.faults = createFaultInjector(options.faults);
    this.charDelayMs = options.charDelayMs ?? 12;
    this.charsPerTick = Math.max(1, options.charsPerTick ?? 2);
  }

  async *send(request: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    try {
      await this.faults.run(signal);
    } catch (error) {
      if (error instanceof MockFaultError) {
        yield {type: 'error', message: error.message};
        return;
      }
      throw error;
    }
    const disconnect = this.faults.shouldDisconnect();
    let sent = 0;

    try {
      for await (const event of respondMock(request, this.graph, signal)) {
        if (event.type !== 'text-delta') {
          yield event;
          continue;
        }
        // 한글 음절이 반으로 갈리지 않게 코드 포인트 단위로 자른다.
        const chars = Array.from(event.text);
        for (let i = 0; i < chars.length; i += this.charsPerTick) {
          // 연결 끊김 주입: 첫 답의 절반쯤에서 done 없이 멈춘다.
          if (disconnect && sent >= chars.length / 2) return;
          yield {type: 'text-delta', text: chars.slice(i, i + this.charsPerTick).join('')};
          sent += this.charsPerTick;
          await sleep(this.charDelayMs, signal);
        }
      }
    } catch (error) {
      if (isAbort(error)) throw error;
      yield {type: 'error', message: `답을 만들지 못했습니다. ${error instanceof Error ? error.message : String(error)}`};
      return;
    }
    yield {type: 'done'};
  }
}
