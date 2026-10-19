// 장비 피드의 규칙. 이전 레포 훅(useDeviceTelemetry, useThermalCamera)에서 시행착오로 정한 동작을 순수 함수로 뗐다.

import {
  describeApiError,
  THERMAL_SENSOR_HEIGHT,
  THERMAL_SENSOR_WIDTH,
  type DeviceHealth,
  type SensorReading,
  type ThermalRoi,
  type ThermalRoiInput,
  type ThermalStats,
} from '../adapters/device/types';
import type {DataSource} from '../graph/model';

export const POLL_INTERVAL_MS = 2000;

/**
 * 폴링. setInterval이 아니라 응답을 받은 뒤 다음 요청을 예약한다(느린 응답이 겹쳐 쌓이지 않게).
 * 요청마다 이전 요청을 끊고, stop하면 타이머와 진행 중 요청을 정리한다.
 */
export function startPolling(tick: (signal: AbortSignal) => Promise<void>, intervalMs = POLL_INTERVAL_MS): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const run = async () => {
    controller?.abort();
    controller = new AbortController();
    try {
      await tick(controller.signal);
    } catch {
      // tick이 스스로 오류를 상태에 담는다. 여기서 던지면 폴링이 멈춘다.
    }
    if (!stopped) timer = setTimeout(run, intervalMs);
  };
  void run();
  return () => {
    stopped = true;
    controller?.abort();
    if (timer !== undefined) clearTimeout(timer);
  };
}

// ── 센서·health ─────────────────────────────────────────

export type TelemetryState = {
  /** 값을 준 장비 어댑터의 출처. 목업 값을 '측정값'이라 부르지 않으려고 둔다. */
  source: DataSource | null;
  health: DeviceHealth | null;
  sensors: SensorReading | null;
  loading: boolean;
  error: string | null;
  sensorError: string | null;
  lastUpdated: string | null;
};

export const initialTelemetry: TelemetryState = {
  source: null,
  health: null,
  sensors: null,
  loading: true,
  error: null,
  sensorError: null,
  lastUpdated: null,
};

/**
 * health와 sensors를 따로 반영한다. 실패해도 마지막 정상 값은 남기고 오류만 따로 둔다.
 * lastUpdated는 하나라도 성공했을 때만 바꾼다. 취소(AbortError)는 오류가 아니다.
 */
export function mergeTelemetry(
  current: TelemetryState,
  health: PromiseSettledResult<DeviceHealth>,
  sensors: PromiseSettledResult<SensorReading>,
  now: string,
): TelemetryState {
  const nextHealth = health.status === 'fulfilled' ? health.value : null;
  const nextSensors = sensors.status === 'fulfilled' ? sensors.value : null;
  return {
    source: current.source,
    health: nextHealth ?? current.health,
    sensors: nextSensors ?? current.sensors,
    loading: false,
    error: health.status === 'rejected' ? describeApiError(health.reason) || current.error : null,
    sensorError: sensors.status === 'rejected' ? describeApiError(sensors.reason) || current.sensorError : null,
    lastUpdated: nextHealth || nextSensors ? now : current.lastUpdated,
  };
}

// ── 열화상 ─────────────────────────────────────────────

export type ThermalState = {
  stats: ThermalStats | null;
  rois: ThermalRoi[];
  loading: boolean;
  error: string | null;
  roiError: string | null;
};

export const initialThermal: ThermalState = {stats: null, rois: [], loading: true, error: null, roiError: null};

/**
 * 통계는 프레임이 없으면 실패하지만 ROI 목록은 그때도 온다. 하나가 실패해도 다른 하나는 살린다.
 * 통계는 실패하면 비운다(멈춘 온도를 지금 값처럼 보이면 안 된다). ROI 목록은 마지막 값을 남긴다.
 */
export function mergeThermal(
  current: ThermalState,
  stats: PromiseSettledResult<ThermalStats>,
  rois: PromiseSettledResult<ThermalRoi[]>,
): ThermalState {
  const aborted = stats.status === 'rejected' && describeApiError(stats.reason) === '';
  if (aborted) return current;
  return {
    stats: stats.status === 'fulfilled' ? stats.value : null,
    rois: rois.status === 'fulfilled' ? rois.value : current.rois,
    loading: false,
    error: stats.status === 'rejected' ? describeApiError(stats.reason) : null,
    roiError: current.roiError,
  };
}

/**
 * 열화상 타일의 대표값. 추적 중인 영역이 있으면 그 평균(실험에서 뜻 있는 숫자), 없으면 프레임 최고 온도.
 * 둘 다 없으면 짧은 상태만 준다. 서버 원문 오류는 열화상 대화상자에서 보여 준다.
 */
export function primaryThermalReading(thermal: ThermalState): {value: number | undefined; caption: string} {
  const tracked = thermal.rois.find((roi) => roi.last && Number.isFinite(roi.last.mean_c));
  if (tracked?.last) return {value: tracked.last.mean_c, caption: `${tracked.name} 평균`};
  if (thermal.stats) return {value: thermal.stats.max_c, caption: '프레임 최고 온도'};
  if (thermal.loading) return {value: undefined, caption: '열화상 확인 중'};
  return {value: undefined, caption: thermal.error ? '열화상 카메라 미연결' : '열화상 대기'};
}

export type NormalizedRect = {left: number; top: number; width: number; height: number};

/**
 * 화면에서 그린 사각형(0~1 비율) → 센서 격자(160×120) 좌표. 화면 배율과 상관없이 격자 좌표로 보낸다.
 * 격자를 벗어나지 않게 자르고, 가로나 세로가 2칸 미만이면(그냥 누른 것) null.
 */
export function roiFromRect(rect: NormalizedRect, existing: number): ThermalRoiInput | null {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const x = clamp(Math.round(rect.left * THERMAL_SENSOR_WIDTH), 0, THERMAL_SENSOR_WIDTH - 1);
  const y = clamp(Math.round(rect.top * THERMAL_SENSOR_HEIGHT), 0, THERMAL_SENSOR_HEIGHT - 1);
  const w = clamp(Math.round(rect.width * THERMAL_SENSOR_WIDTH), 1, THERMAL_SENSOR_WIDTH - x);
  const h = clamp(Math.round(rect.height * THERMAL_SENSOR_HEIGHT), 1, THERMAL_SENSOR_HEIGHT - y);
  if (w < 2 || h < 2) return null;
  return {x, y, w, h, name: `영역 ${existing + 1}`};
}

// ── 장치 상태 ─────────────────────────────────────────

export type DeviceState = 'checking' | 'online' | 'pending' | 'offline';

export type DeviceStatusItem = {id: string; name: string; state: DeviceState; label: string; detail?: string};

const LABELS = {
  sensor: {checking: '확인 중', online: '정상', pending: '대기', offline: '오류'},
  link: {checking: '확인 중', online: '연결됨', pending: '대기', offline: '오류'},
} as const;

/**
 * health → 장치별 상태. 판정 순서는 이전 DeviceStatusPills를 따른다.
 * 센서: 연결됨이면 정상, 아니면 오류가 있으면 오류, 없으면 대기. 카메라류: 오류가 먼저, 열렸으면 연결됨, 있기만 하면 대기.
 */
export function deviceStatuses(health: DeviceHealth | null): DeviceStatusItem[] {
  const sensor: DeviceState = !health
    ? 'checking'
    : health.sensors.connected
      ? 'online'
      : health.sensors.error
        ? 'offline'
        : 'pending';
  const link = (part: {available: boolean; opened?: boolean; error: string | null} | undefined): DeviceState =>
    !health
      ? 'checking'
      : !part
        ? 'offline'
        : part.error
          ? 'offline'
          : (part.opened ?? part.available)
            ? 'online'
            : part.available
              ? 'pending'
              : 'offline';
  const items: {id: string; name: string; state: DeviceState; kind: 'sensor' | 'link'; detail?: string | null}[] = [
    {id: 'sensors', name: '센서', state: sensor, kind: 'sensor', detail: health?.sensors.error},
    {id: 'camera', name: '탑뷰 카메라', state: link(health?.camera), kind: 'link', detail: health?.camera?.error},
    {id: 'thermal', name: '열화상', state: link(health?.thermal), kind: 'link', detail: health?.thermal?.error},
    {id: 'rail', name: '레일', state: link(health?.rail), kind: 'link', detail: health?.rail?.error},
    {id: 'arm', name: '로봇팔', state: link(health?.arm), kind: 'link', detail: health?.arm?.error},
  ];
  return items.map(({kind, detail, ...item}) => ({...item, label: LABELS[kind][item.state], ...(detail && {detail})}));
}

export function formatValue(value: number | undefined | null, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}
