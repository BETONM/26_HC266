import {describe, expect, it} from 'vitest';
import {readConfig} from './config';

describe('readConfig', () => {
  it('기본은 모두 mock이다', () => {
    const config = readConfig({});
    expect([config.graph, config.chat, config.device, config.run, config.report].map((a) => a.source)).toEqual(
      Array(5).fill('mock'),
    );
    expect(config.warnings).toEqual([]);
  });

  it('어댑터별로 http와 주소를 읽고 끝 슬래시를 지운다', () => {
    const config = readConfig({VITE_DEVICE_SOURCE: 'http', VITE_DEVICE_API_URL: 'http://lab:8000/'});
    expect(config.device).toEqual({source: 'http', baseUrl: 'http://lab:8000'});
    expect(config.graph.source).toBe('mock');
  });

  it('잘못된 값은 경고를 남긴다', () => {
    const config = readConfig({VITE_CHAT_SOURCE: 'live', VITE_RUN_SOURCE: 'http', VITE_MOCK_LATENCY_MS: '-1'});
    expect(config.chat.source).toBe('mock');
    expect(config.warnings).toHaveLength(3);
  });

  it('목업 지연·실패는 공통값을 어댑터별 값이 덮어쓴다', () => {
    const config = readConfig({VITE_MOCK_LATENCY_MS: '200', VITE_CHAT_MOCK_LATENCY_MS: '30', VITE_MOCK_FAIL_EVERY: '4'});
    expect(config.mockFaults.chat).toEqual({latencyMs: 30, failEvery: 4, disconnectEvery: undefined});
    expect(config.mockFaults.graph).toEqual({latencyMs: 200, failEvery: 4, disconnectEvery: undefined});
  });

  it('장비 목업 주입과 RGB 방식을 읽는다', () => {
    const config = readConfig({
      VITE_DEVICE_MOCK_OFFLINE: 'thermal:error, camera:off,lamp:off',
      VITE_DEVICE_MOCK_STALE: '1',
      VITE_DEVICE_RGB_SOURCE: 'mjpeg',
      VITE_RUN_MOCK_STEP_MS: '500',
    });
    expect(config.deviceMockOffline).toEqual({thermal: 'error', camera: 'off'});
    expect([config.deviceMockStale, config.deviceRgb, config.runMockStepMs]).toEqual([true, 'mjpeg', 500]);
    expect(config.warnings).toEqual([expect.stringContaining("'lamp:off'")]);
  });
});
