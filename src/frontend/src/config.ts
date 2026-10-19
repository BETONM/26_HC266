// mock/http 선택과 실제 서버 주소는 여기 한 곳에서만 읽는다.
// 화면 컴포넌트는 이 모듈도 모르고 어댑터 인터페이스만 안다.
//
// 비밀 키는 VITE_ 변수에 넣지 않는다. VITE_ 값은 브라우저 번들에 그대로 들어간다.

import type {MockDevice, MockDeviceFault} from './adapters/device/mock/MockDeviceSource';
import type {FaultOptions} from './adapters/faults';

export const ADAPTERS = ['graph', 'chat', 'device', 'run', 'report'] as const;
export type AdapterName = (typeof ADAPTERS)[number];
export type SourceKind = 'mock' | 'http';

export type AdapterConfig = {source: SourceKind; baseUrl: string};
export type AppConfig = Record<AdapterName, AdapterConfig> & {
  chatCharDelayMs: number;
  /** RGB 카메라를 브라우저가 직접 열지(RealSense USB), 장비 서버 MJPEG를 받을지. device가 http일 때만 쓴다. */
  deviceRgb: 'browser' | 'mjpeg';
  /** 목업 장비의 장치별 꺼짐·오류. */
  deviceMockOffline: Partial<Record<MockDevice, MockDeviceFault>>;
  /** 목업 센서를 오래된 데이터로 멈춘다. */
  deviceMockStale: boolean;
  /** 목업 로봇이 동작 하나에 쓰는 시간(ms). */
  runMockStepMs: number;
  mockFaults: Record<AdapterName, FaultOptions>;
  warnings: string[];
};

type Env = Record<string, string | boolean | undefined>;

const envKey = (name: AdapterName, suffix: string) => `VITE_${name.toUpperCase()}_${suffix}`;

function readNumber(env: Env, key: string, warnings: string[]): number | undefined {
  const raw = env[key];
  if (raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    warnings.push(`${key}=${String(raw)}는 0 이상의 숫자가 아니어서 무시했습니다.`);
    return undefined;
  }
  return value;
}

/**
 * env에서 설정을 만든다. 잘못된 값은 조용히 목업으로 돌리지 않고 경고를 남긴다.
 * 실제 장비에 붙었다고 믿었는데 목업이 돌고 있으면 실험 직전에 위험하다.
 *
 * - `VITE_<NAME>_SOURCE`: `mock`(기본) 또는 `http`
 * - `VITE_<NAME>_API_URL`: http 구현의 기본 URL
 * - `VITE_MOCK_LATENCY_MS`, `VITE_MOCK_FAIL_EVERY`, `VITE_MOCK_DISCONNECT_EVERY`: 모든 목업 공통
 * - `VITE_<NAME>_MOCK_LATENCY_MS`, `..._MOCK_FAIL_EVERY`, `..._MOCK_DISCONNECT_EVERY`: 어댑터별로 덮어쓴다
 * - `VITE_CHAT_MOCK_CHAR_DELAY_MS`: 목업 답을 흘려보내는 속도(글자 2개마다 쉬는 시간)
 * - `VITE_DEVICE_RGB_SOURCE`: `browser`(기본, RealSense를 브라우저가 직접 연다) 또는 `mjpeg`(장비 서버 /camera/stream)
 * - `VITE_DEVICE_MOCK_OFFLINE`: 목업 장치 꺼짐·오류. 예: `thermal:error,camera:off`
 * - `VITE_DEVICE_MOCK_STALE`: `1`이면 목업 센서가 마지막 값에 멈추고 오래된 데이터로 표시된다
 * - `VITE_RUN_MOCK_STEP_MS`: 목업 로봇이 동작 하나에 쓰는 시간(기본 3000)
 */
export function readConfig(env: Env): AppConfig {
  const warnings: string[] = [];
  const sharedLatency = readNumber(env, 'VITE_MOCK_LATENCY_MS', warnings);
  const sharedFailEvery = readNumber(env, 'VITE_MOCK_FAIL_EVERY', warnings);
  const sharedDisconnectEvery = readNumber(env, 'VITE_MOCK_DISCONNECT_EVERY', warnings);

  const entries = ADAPTERS.map((name) => {
    const rawSource = env[envKey(name, 'SOURCE')];
    let source: SourceKind = 'mock';
    if (rawSource === 'http' || rawSource === 'mock') source = rawSource;
    else if (rawSource !== undefined && rawSource !== '') {
      warnings.push(`${envKey(name, 'SOURCE')}=${String(rawSource)}는 mock 또는 http가 아니어서 mock을 씁니다.`);
    }
    const baseUrl = String(env[envKey(name, 'API_URL')] ?? '').replace(/\/+$/, '');
    if (source === 'http' && baseUrl === '') {
      warnings.push(`${envKey(name, 'SOURCE')}=http인데 ${envKey(name, 'API_URL')}가 비어 있습니다.`);
    }
    const faults: FaultOptions = {
      latencyMs: readNumber(env, envKey(name, 'MOCK_LATENCY_MS'), warnings) ?? sharedLatency,
      failEvery: readNumber(env, envKey(name, 'MOCK_FAIL_EVERY'), warnings) ?? sharedFailEvery,
      disconnectEvery: readNumber(env, envKey(name, 'MOCK_DISCONNECT_EVERY'), warnings) ?? sharedDisconnectEvery,
    };
    return {name, adapter: {source, baseUrl}, faults};
  });

  const rawRgb = env.VITE_DEVICE_RGB_SOURCE;
  let deviceRgb: AppConfig['deviceRgb'] = 'browser';
  if (rawRgb === 'browser' || rawRgb === 'mjpeg') deviceRgb = rawRgb;
  else if (rawRgb !== undefined && rawRgb !== '') {
    warnings.push(`VITE_DEVICE_RGB_SOURCE=${String(rawRgb)}는 browser 또는 mjpeg가 아니어서 browser를 씁니다.`);
  }

  const config = {
    chatCharDelayMs: readNumber(env, 'VITE_CHAT_MOCK_CHAR_DELAY_MS', warnings) ?? 12,
    deviceRgb,
    deviceMockOffline: readDeviceFaults(env, warnings),
    deviceMockStale: env.VITE_DEVICE_MOCK_STALE === '1' || env.VITE_DEVICE_MOCK_STALE === 'true',
    runMockStepMs: readNumber(env, 'VITE_RUN_MOCK_STEP_MS', warnings) ?? 3000,
    mockFaults: Object.fromEntries(entries.map((e) => [e.name, e.faults])),
    warnings,
  } as AppConfig;
  for (const entry of entries) config[entry.name] = entry.adapter;
  return config;
}

// MockDeviceSource의 MOCK_DEVICES와 같은 목록. 설정 모듈이 목업 구현을 불러오지 않게 따로 적는다.
const MOCK_DEVICE_NAMES = ['sensors', 'thermal', 'camera', 'left-camera', 'right-camera', 'rail', 'arm'];

/** `thermal:error,camera:off` → {thermal: 'error', camera: 'off'}. 모르는 장치·상태는 경고하고 건너뛴다. */
function readDeviceFaults(env: Env, warnings: string[]): AppConfig['deviceMockOffline'] {
  const raw = env.VITE_DEVICE_MOCK_OFFLINE;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  const out: AppConfig['deviceMockOffline'] = {};
  for (const part of raw.split(',')) {
    const [name, state] = part.split(':').map((s) => s.trim());
    if (name && MOCK_DEVICE_NAMES.includes(name) && (state === 'off' || state === 'error')) {
      out[name as MockDevice] = state;
    } else {
      warnings.push(`VITE_DEVICE_MOCK_OFFLINE의 '${part}'를 알아듣지 못해 무시했습니다. 예: thermal:error,camera:off`);
    }
  }
  return out;
}

export const config = readConfig(import.meta.env as Env);
