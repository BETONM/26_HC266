// 목업 장비. 센서 값과 영상은 목업 실행의 진행에 맞춰 변한다(진행은 MockRunSource.progress()로 받는다).
// 꺼짐·오류·오래된 데이터·연결 끊김을 주입할 수 있어 오류 화면을 개발 중에 볼 수 있다.

import {abortError, createFaultInjector, MockFaultError, sleep, type FaultOptions} from '../../faults';
import type {DeviceSource} from '../DeviceSource';
import {
  DeviceApiError,
  THERMAL_ROI_COLORS,
  type DeviceHealth,
  type SensorReading,
  type ThermalRoi,
  type ThermalRoiInput,
  type CameraId,
  type ThermalSample,
  type VideoHandle,
} from '../types';
import {chemistryAt, fieldStats, jitter, REACTION_SECONDS, regionSample, seriesCsv, thermalField} from './model';
import {cameraVideo, thermalVideo} from './scenes';

// camera는 탑뷰(이전 서버의 카메라), left-camera·right-camera는 팔 카메라다.
export const MOCK_DEVICES = ['sensors', 'thermal', 'camera', 'left-camera', 'right-camera', 'rail', 'arm'] as const;
export type MockDevice = (typeof MOCK_DEVICES)[number];
/** 하위 장치 상태 주입. off: 꺼짐(연결 안 됨), error: 오류를 냄. */
export type MockDeviceFault = 'off' | 'error';

export type MockDeviceOptions = {
  faults?: FaultOptions;
  /** 장치별 꺼짐·오류. */
  offline?: Partial<Record<MockDevice, MockDeviceFault>>;
  /** 켜면 센서가 마지막 값에 멈추고 stale로 표시된다(센서 보드가 갱신을 멈춘 상황). */
  stale?: boolean;
  /** 실행 진행(0~1)과 상태. 실행이 없으면 null. */
  progress?: () => {fraction: number; state: string} | null;
  now?: () => number;
};

// 반응이 시작되기 전(시약을 넣는 동안)은 바탕값을 유지한다. 진행의 앞 1/4을 준비 시간으로 본다.
const PREP_FRACTION = 0.25;

/** 진행(0~1) → 실측 곡선의 반응 시각(초). */
export function reactionSecond(fraction: number): number {
  return (Math.max(0, fraction - PREP_FRACTION) / (1 - PREP_FRACTION)) * REACTION_SECONDS;
}

const ROI_SAMPLE_INTERVAL_S = 1;

const CAMERA_FAULT: Record<CameraId, MockDevice> = {
  top: 'camera',
  'left-arm': 'left-camera',
  'right-arm': 'right-camera',
};
const MAX_SERIES = 3600;

type StoredRoi = ThermalRoi & {series: ThermalSample[]};

export class MockDeviceSource implements DeviceSource {
  readonly source = 'mock' as const;
  private faults;
  private rois: StoredRoi[] = [];
  private seq = 0;
  private frozen: SensorReading | null = null;
  private lastSampleAt = 0;

  constructor(private readonly options: MockDeviceOptions = {}) {
    this.faults = createFaultInjector(options.faults);
  }

  private nowMs() {
    return this.options.now?.() ?? Date.now();
  }

  private second() {
    return reactionSecond(this.options.progress?.()?.fraction ?? 0);
  }

  /** 지연·실패·끊김 주입. 끊김은 실제 네트워크 실패처럼 TypeError로 낸다. */
  private async call(signal?: AbortSignal) {
    try {
      await this.faults.run(signal);
    } catch (error) {
      if (error instanceof MockFaultError) throw new DeviceApiError(error.message, 500);
      throw error;
    }
    if (this.faults.shouldDisconnect()) throw new TypeError('Failed to fetch');
    if (signal?.aborted) throw abortError();
  }

  async getHealth(signal?: AbortSignal): Promise<DeviceHealth> {
    await this.call(signal);
    const off = this.options.offline ?? {};
    const err = (d: MockDevice, message: string) => (off[d] === 'error' ? message : null);
    return {
      sensors: {
        connected: !off.sensors,
        port: off.sensors ? null : '/dev/ttyMOCK0',
        error: err('sensors', '센서 보드 응답 없음'),
        age_s: this.options.stale ? 42 : 0.4,
      },
      thermal: {
        available: off.thermal !== 'off',
        opened: !off.thermal,
        device: 'mock-thermal',
        resolution: '160x120',
        frames: Math.floor(this.nowMs() / 111),
        age_s: off.thermal ? null : 0.1,
        rois: this.rois.length,
        sample_interval_s: ROI_SAMPLE_INTERVAL_S,
        error: err('thermal', '열화상 프레임을 받지 못했습니다'),
      },
      camera: {
        available: off.camera !== 'off',
        opened: !off.camera,
        index: 0,
        error: err('camera', '카메라를 열 수 없습니다'),
      },
      rail: {
        available: off.rail !== 'off',
        moving: this.options.progress?.()?.state === 'running',
        error: err('rail', '레일 원점 복귀 실패'),
        position_mm: off.rail ? null : 120,
      },
      arm: {available: off.arm !== 'off', error: err('arm', '로봇팔 통신 오류')},
    };
  }

  async getSensors(signal?: AbortSignal): Promise<SensorReading> {
    await this.call(signal);
    const off = this.options.offline?.sensors;
    if (off === 'off') throw new DeviceApiError('센서 보드가 연결되어 있지 않습니다.', 503);
    if (off === 'error') throw new DeviceApiError('센서 보드 응답 없음', 502);
    if (this.options.stale && this.frozen) return {...this.frozen, stale: true, age_s: 42};
    const t = this.nowMs() / 1000;
    const c = chemistryAt(this.second());
    const reading: SensorReading = {
      ph: Number((c.ph + jitter(t, 0.01, 1)).toFixed(3)),
      ec: Number((c.ec + jitter(t, 2.5, 2)).toFixed(1)),
      tds: Number((c.tds + jitter(t, 1.2, 3)).toFixed(1)),
      temp: Number((c.temperature + jitter(t, 0.03, 4)).toFixed(2)),
      ts: new Date(this.nowMs()).toISOString(),
      age_s: 0.4,
      stale: false,
    };
    this.frozen = reading;
    return reading;
  }

  private field() {
    const t = this.nowMs() / 1000;
    return {t, field: thermalField(t, chemistryAt(this.second()).temperature)};
  }

  /** 1초에 한 번 등록된 영역마다 표본을 쌓는다. 서버가 프레임마다 영역 값을 기록하는 것을 흉내 낸다. */
  private sampleRois() {
    const {t, field} = this.field();
    if (t - this.lastSampleAt < ROI_SAMPLE_INTERVAL_S) return;
    this.lastSampleAt = t;
    for (const roi of this.rois) {
      const sample = regionSample(field, roi, t);
      roi.series = [...roi.series, sample].slice(-MAX_SERIES);
      roi.samples = roi.series.length;
      roi.last = sample;
    }
  }

  async getThermalStats(signal?: AbortSignal) {
    await this.call(signal);
    // 서버와 같게: 프레임이 없으면 통계는 실패한다(ROI 목록은 따로 온다).
    if (this.options.offline?.thermal) throw new DeviceApiError('열화상 프레임이 아직 없습니다.', 503);
    this.sampleRois();
    const {t, field} = this.field();
    return fieldStats(field, t);
  }

  async listThermalRois(signal?: AbortSignal) {
    await this.call(signal);
    if (!this.options.offline?.thermal) this.sampleRois();
    return this.rois.map(({series: _series, ...roi}) => ({...roi}));
  }

  async addThermalRoi(input: ThermalRoiInput, signal?: AbortSignal) {
    await this.call(signal);
    this.seq += 1;
    const roi: StoredRoi = {
      id: `roi-${this.seq}`,
      name: input.name ?? `영역 ${this.seq}`,
      x: input.x,
      y: input.y,
      w: input.w,
      h: input.h,
      created_at: this.nowMs() / 1000,
      samples: 0,
      last: null,
      series: [],
    };
    this.rois.push(roi);
    const {series: _series, ...out} = roi;
    return out;
  }

  async deleteThermalRoi(id: string, signal?: AbortSignal) {
    await this.call(signal);
    if (!this.rois.some((r) => r.id === id)) throw new DeviceApiError('없는 영역입니다.', 404);
    this.rois = this.rois.filter((r) => r.id !== id);
  }

  async getThermalRoiCsv(id: string, signal?: AbortSignal) {
    await this.call(signal);
    const roi = this.rois.find((r) => r.id === id);
    if (!roi) throw new DeviceApiError('없는 영역입니다.', 404);
    return new Blob([seriesCsv(roi.series)], {type: 'text/csv'});
  }

  async openThermalVideo(signal?: AbortSignal): Promise<VideoHandle> {
    await sleep(0, signal);
    if (this.options.offline?.thermal) throw new DeviceApiError('열화상 카메라가 연결되어 있지 않습니다.', 503);
    return thermalVideo((t) => ({
      field: thermalField(t, chemistryAt(this.second()).temperature),
      rois: this.rois.map((r, i) => ({
        ...r,
        color: THERMAL_ROI_COLORS[i % THERMAL_ROI_COLORS.length]!,
        label: `#${i + 1}`,
      })),
    }));
  }

  async openCamera(id: CameraId, signal?: AbortSignal): Promise<VideoHandle> {
    await sleep(0, signal);
    const off = this.options.offline?.[CAMERA_FAULT[id]];
    if (off === 'off') throw new DOMException('연결된 카메라가 없습니다.', 'NotFoundError');
    if (off === 'error') throw new DOMException('카메라를 다른 프로그램이 사용 중입니다.', 'NotReadableError');
    return cameraVideo(id, () => {
      const progress = this.options.progress?.();
      const fraction = progress?.fraction ?? 0;
      // 마지막 묶음(교반)에 들어서면 소용돌이를 그린다.
      return {
        coverage: chemistryAt(this.second()).color,
        stirring: progress?.state === 'running' && fraction > 0.75,
        fraction,
      };
    });
  }

  async emergencyStop(): Promise<void> {
    // 목업에는 멈출 하드웨어가 없다. 화면은 RunSource의 E-STOP 로그로 이것을 알린다.
  }
}
