// 라즈베리파이 장비 API. 경로·응답 모양은 이전 레포 deviceApi.ts와 같다.
// 새 서버에서 경로가 바뀔 수 있어 경로 문자열은 이 파일 안에만 둔다.

import type {DeviceSource} from './DeviceSource';
import {openRealSense} from './browserCamera';
import {
  CAMERAS,
  DeviceApiError,
  type CameraId,
  type DeviceHealth,
  type SensorReading,
  type ThermalRoi,
  type ThermalRoiInput,
  type ThermalStats,
  type VideoHandle,
} from './types';

export type RgbMode = 'browser' | 'mjpeg';

async function errorFrom(response: Response, label: string): Promise<DeviceApiError> {
  let detail = '';
  try {
    const body = (await response.json()) as {detail?: string; error?: string};
    detail = body.detail || body.error || '';
  } catch {
    // 오류 본문이 JSON이 아닐 수 있다.
  }
  return new DeviceApiError(detail || `${label} 오류 (${response.status})`, response.status);
}

export class HttpDeviceSource implements DeviceSource {
  readonly source = 'live' as const;

  constructor(
    private readonly baseUrl: string,
    /** RGB를 브라우저가 직접 열지(RealSense USB), 서버 MJPEG(/camera/stream)를 받을지. */
    private readonly rgbMode: RgbMode = 'browser',
  ) {}

  private url(path: string) {
    return `${this.baseUrl}${path}`;
  }

  private async json<T>(path: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
    const response = await fetch(this.url(path), {...init, signal});
    if (!response.ok) throw await errorFrom(response, '장비 API');
    return (await response.json()) as T;
  }

  getHealth(signal?: AbortSignal) {
    return this.json<DeviceHealth>('/health', signal);
  }

  getSensors(signal?: AbortSignal) {
    return this.json<SensorReading>('/sensors', signal);
  }

  getThermalStats(signal?: AbortSignal) {
    return this.json<ThermalStats>('/thermal/stats', signal);
  }

  async listThermalRois(signal?: AbortSignal) {
    return (await this.json<{rois: ThermalRoi[]}>('/thermal/rois', signal)).rois;
  }

  addThermalRoi(roi: ThermalRoiInput, signal?: AbortSignal) {
    return this.json<ThermalRoi>('/thermal/roi', signal, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(roi),
    });
  }

  async deleteThermalRoi(id: string, signal?: AbortSignal) {
    await this.json<{ok: boolean; id: string}>(`/thermal/roi/${encodeURIComponent(id)}`, signal, {method: 'DELETE'});
  }

  async getThermalRoiCsv(id: string, signal?: AbortSignal) {
    const response = await fetch(this.url(`/thermal/roi/${encodeURIComponent(id)}/series.csv`), {signal});
    if (!response.ok) throw await errorFrom(response, '열화상 API');
    return response.blob();
  }

  // 센서가 9fps 고정이라 그 위로 올릴 이유가 없다.
  async openThermalVideo(): Promise<VideoHandle> {
    return {
      source: {kind: 'url', url: this.url('/thermal/stream?fps=9&width=640&colormap=inferno')},
      info: {width: 640, frameRate: 9},
      close: () => {},
    };
  }

  // 이전 서버에는 카메라가 하나(RealSense)뿐이고 그것이 탑뷰다. 팔 카메라 경로는 새 서버에서 정한다.
  // 그때까지 없는 경로를 지어내 부르지 않고, 연결하지 않았다고 말한다.
  async openCamera(id: CameraId, signal?: AbortSignal): Promise<VideoHandle> {
    if (id !== 'top') {
      const name = CAMERAS.find((c) => c.id === id)?.name ?? id;
      throw new DeviceApiError(`${name}는 아직 장비 서버에 연결하지 않았습니다.`, 501);
    }
    if (this.rgbMode === 'browser') return openRealSense(signal);
    return {source: {kind: 'url', url: this.url('/camera/stream?fps=10')}, info: {frameRate: 10}, close: () => {}};
  }

  async emergencyStop(): Promise<void> {
    throw new DeviceApiError('장비 서버에 비상 정지 API가 아직 없습니다.', 501);
  }
}
