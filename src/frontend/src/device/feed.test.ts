import {afterEach, describe, expect, it, vi} from 'vitest';
import {DeviceApiError, describeApiError, type DeviceHealth, type ThermalRoi} from '../adapters/device/types';
import {
  deviceStatuses,
  initialTelemetry,
  initialThermal,
  mergeTelemetry,
  mergeThermal,
  primaryThermalReading,
  roiFromRect,
  startPolling,
} from './feed';

const ok = <T>(value: T): PromiseSettledResult<T> => ({status: 'fulfilled', value});
const fail = (reason: unknown): PromiseSettledResult<never> => ({status: 'rejected', reason});
const abort = () => new DOMException('취소', 'AbortError');

const health: DeviceHealth = {sensors: {connected: true, port: '/dev/tty0', error: null, age_s: 0.2}};

describe('describeApiError', () => {
  it('취소는 빈 문자열, 네트워크 실패는 연결 문구, 서버 오류는 본문 메시지', () => {
    expect(describeApiError(abort())).toBe('');
    expect(describeApiError(new TypeError('Failed to fetch'))).toBe('장비 API에 연결할 수 없습니다.');
    expect(describeApiError(new DeviceApiError('센서 보드 응답 없음', 502))).toBe('센서 보드 응답 없음');
  });
});

describe('mergeTelemetry', () => {
  it('하나가 실패해도 다른 하나는 반영하고, 마지막 정상 값은 남긴다', () => {
    const first = mergeTelemetry(initialTelemetry, ok(health), ok({ph: 6.7}), 't1');
    const second = mergeTelemetry(first, ok(health), fail(new DeviceApiError('센서 보드 응답 없음', 502)), 't2');
    expect(second.sensors).toEqual({ph: 6.7});
    expect(second.sensorError).toBe('센서 보드 응답 없음');
    expect(second.lastUpdated).toBe('t2');
  });

  it('둘 다 실패하면 lastUpdated를 바꾸지 않는다', () => {
    const first = mergeTelemetry(initialTelemetry, ok(health), ok({ph: 6.7}), 't1');
    const down = mergeTelemetry(first, fail(new TypeError('x')), fail(new TypeError('x')), 't2');
    expect(down.lastUpdated).toBe('t1');
    expect(down.error).toBe('장비 API에 연결할 수 없습니다.');
    expect(down.health).toBe(health);
  });
});

describe('mergeThermal과 대표값', () => {
  const roi = (last: ThermalRoi['last']): ThermalRoi => ({
    id: 'r1',
    name: '영역 1',
    x: 0,
    y: 0,
    w: 4,
    h: 4,
    created_at: 0,
    samples: 1,
    last,
  });

  it('통계가 503이어도 ROI 목록은 살리고, 통계는 비운다', () => {
    const stats = {t: 1, min_c: 20, max_c: 31, mean_c: 24, hotspot: {x: 3, y: 4}};
    const first = mergeThermal(initialThermal, ok(stats), ok([]));
    const next = mergeThermal(first, fail(new DeviceApiError('열화상 프레임이 아직 없습니다.', 503)), ok([roi(null)]));
    expect(next.stats).toBeNull();
    expect(next.rois).toHaveLength(1);
    expect(next.error).toBe('열화상 프레임이 아직 없습니다.');
  });

  it('취소된 폴링은 상태를 건드리지 않는다', () => {
    const first = mergeThermal(
      initialThermal,
      ok({t: 1, min_c: 20, max_c: 31, mean_c: 24, hotspot: {x: 0, y: 0}}),
      ok([]),
    );
    expect(mergeThermal(first, fail(abort()), fail(abort()))).toBe(first);
  });

  it('추적 영역 평균 > 프레임 최고 > 상태 문구', () => {
    const stats = {t: 1, min_c: 20, max_c: 31, mean_c: 24, hotspot: {x: 0, y: 0}};
    const withRoi = {...initialThermal, loading: false, stats, rois: [roi({t: 1, mean_c: 25.5, min_c: 25, max_c: 26})]};
    expect(primaryThermalReading(withRoi)).toEqual({value: 25.5, caption: '영역 1 평균'});
    expect(primaryThermalReading({...withRoi, rois: [roi(null)]})).toEqual({value: 31, caption: '프레임 최고 온도'});
    expect(primaryThermalReading({...initialThermal, loading: false, error: '503'}).caption).toBe(
      '열화상 카메라 미연결',
    );
  });
});

describe('roiFromRect', () => {
  it('화면 비율을 센서 격자(160×120) 좌표로 바꾸고 격자 안으로 자른다', () => {
    expect(roiFromRect({left: 0.5, top: 0.5, width: 0.25, height: 0.25}, 0)).toEqual({
      x: 80,
      y: 60,
      w: 40,
      h: 30,
      name: '영역 1',
    });
    expect(roiFromRect({left: 0.9, top: 0.9, width: 0.5, height: 0.5}, 2)).toEqual({
      x: 144,
      y: 108,
      w: 16,
      h: 12,
      name: '영역 3',
    });
  });

  it('2칸 미만(그냥 누름)은 등록하지 않는다', () => {
    expect(roiFromRect({left: 0.5, top: 0.5, width: 0.005, height: 0.3}, 0)).toBeNull();
  });
});

describe('deviceStatuses', () => {
  it('health가 없으면 모두 확인 중', () => {
    expect(deviceStatuses(null).map((d) => d.label)).toEqual(['확인 중', '확인 중', '확인 중', '확인 중', '확인 중']);
  });

  it('이전 판정 순서: 센서는 연결 > 오류 > 대기, 카메라는 오류 > 열림 > 있음', () => {
    const items = deviceStatuses({
      sensors: {connected: false, port: null, error: null, age_s: null},
      camera: {available: true, opened: false, index: 0, error: null},
      thermal: {
        available: true,
        opened: true,
        device: '',
        resolution: '',
        frames: 0,
        age_s: 0,
        rois: 0,
        sample_interval_s: 1,
        error: '프레임 없음',
      },
      arm: {available: true, error: null},
    });
    expect(items.map((d) => `${d.name}:${d.label}`)).toEqual([
      '센서:대기',
      '탑뷰 카메라:대기',
      '열화상:오류',
      '레일:오류',
      '로봇팔:연결됨',
    ]);
    expect(items[2]?.detail).toBe('프레임 없음');
  });
});

describe('startPolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('응답을 받은 뒤 다음 요청을 예약하고, 멈추면 진행 중 요청을 끊는다', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    let resolve: () => void = () => {};
    const tick = vi.fn<(signal: AbortSignal) => Promise<void>>((signal) => {
      signals.push(signal);
      return new Promise<void>((r) => (resolve = r));
    });
    const stop = startPolling(tick, 2000);
    expect(tick).toHaveBeenCalledTimes(1);
    // 응답이 오기 전에는 2초가 지나도 다음 요청을 보내지 않는다.
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(1);
    resolve();
    await vi.advanceTimersByTimeAsync(1999);
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
    expect(signals[1]?.aborted).toBe(true);
    resolve();
    await vi.advanceTimersByTimeAsync(5000);
    expect(tick).toHaveBeenCalledTimes(2);
  });
});
