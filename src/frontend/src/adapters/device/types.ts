// 장비 API의 응답 모양. 이전 레포 deviceApi.ts의 타입을 그대로 옮겼다(라즈베리파이 서버가 이 모양으로 준다).

export type ThermalStatus = {
  available: boolean;
  opened: boolean;
  device: string;
  resolution: string;
  frames: number;
  age_s: number | null;
  rois: number;
  sample_interval_s: number;
  error: string | null;
};

export type DeviceHealth = {
  sensors: {
    connected: boolean;
    port: string | null;
    error: string | null;
    age_s: number | null;
  };
  thermal?: ThermalStatus;
  camera?: {
    available: boolean;
    opened: boolean;
    index: number;
    error: string | null;
  };
  rail?: {
    available: boolean;
    moving: boolean;
    error: string | null;
    position_mm: number | null;
  };
  arm?: {
    available: boolean;
    error: string | null;
  };
};

export type ThermalStats = {
  t: number;
  min_c: number;
  max_c: number;
  mean_c: number;
  hotspot: {x: number; y: number};
};

export type ThermalSample = {
  t: number;
  mean_c: number;
  min_c: number;
  max_c: number;
};

export type ThermalRoi = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  created_at: number;
  samples: number;
  last: ThermalSample | null;
  series?: ThermalSample[];
};

export type ThermalRoiInput = {x: number; y: number; w: number; h: number; name?: string};

export type SensorReading = {
  ph?: number;
  ec?: number;
  tds?: number;
  temp?: number;
  ph_v?: number;
  tds_v?: number;
  ts?: string;
  age_s?: number;
  stale?: boolean;
};

// ROI 좌표는 화면에 몇 배로 확대해 보여주든 항상 이 센서 격자 기준으로 보낸다.
export const THERMAL_SENSOR_WIDTH = 160;
export const THERMAL_SENSOR_HEIGHT = 120;

// 서버가 ROI 사각형에 쓰는 색. 목록의 색점을 영상 위 사각형과 맞추려고 그대로 옮겼다.
// 장비가 정한 값이라 디자인 토큰이 아니다.
export const THERMAL_ROI_COLORS = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff'];

export class DeviceApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DeviceApiError';
    this.status = status;
  }
}

/** 화면에 보일 오류 문구. 취소는 오류가 아니라 빈 문자열이다. */
export function describeApiError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '';
  if (error instanceof DeviceApiError) return error.message;
  if (error instanceof TypeError) return '장비 API에 연결할 수 없습니다.';
  if (error instanceof Error) return error.message;
  return '장비 API 요청에 실패했습니다.';
}

/**
 * 작업대 카메라 셋. 탑뷰는 작업대 전체를 위에서, 팔 카메라는 각 로봇팔 손목에서 집는 곳을 본다.
 * 이전 서버의 카메라(RealSense 하나, /health의 camera)는 탑뷰다.
 */
export type CameraId = 'top' | 'left-arm' | 'right-arm';

export const CAMERAS: readonly {id: CameraId; name: string}[] = [
  {id: 'top', name: '탑뷰 카메라'},
  {id: 'left-arm', name: '왼팔 카메라'},
  {id: 'right-arm', name: '오른팔 카메라'},
];

/**
 * 영상은 두 형태 중 하나다. 서버 MJPEG는 URL을 <img>에, 브라우저가 연 카메라나 canvas 목업은
 * MediaStream을 <video>에 붙인다. 화면은 이 값만 받아 둘 다 그린다.
 */
export type VideoSource = {kind: 'url'; url: string} | {kind: 'stream'; stream: MediaStream};

export type VideoInfo = {label?: string; width?: number; height?: number; frameRate?: number};

/** 연 영상. 다 보면 close로 정리한다(트랙 정지, 타이머 해제). */
export type VideoHandle = {source: VideoSource; info: VideoInfo; close(): void};
