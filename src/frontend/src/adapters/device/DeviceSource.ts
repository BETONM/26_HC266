import type {DataSource} from '../../graph/model';
import type {
  CameraId,
  DeviceHealth,
  SensorReading,
  ThermalRoi,
  ThermalRoiInput,
  ThermalStats,
  VideoHandle,
} from './types';

/**
 * 장비(센서·카메라 셋·열화상·레일·로봇팔) 접근. http 구현은 이전 레포 deviceApi.ts의 경로를 그대로 쓴다.
 *
 * - 모든 조회는 signal로 끊을 수 있다. 끊기면 AbortError로 끝난다.
 * - 서버가 알려 주는 실패는 DeviceApiError(본문의 detail/error), 네트워크 실패는 TypeError다.
 * - 열화상 통계는 프레임이 없으면 실패하지만 ROI 목록은 그때도 온다. 둘을 따로 부른다.
 */
export interface DeviceSource {
  readonly source: DataSource;
  getHealth(signal?: AbortSignal): Promise<DeviceHealth>;
  getSensors(signal?: AbortSignal): Promise<SensorReading>;
  getThermalStats(signal?: AbortSignal): Promise<ThermalStats>;
  listThermalRois(signal?: AbortSignal): Promise<ThermalRoi[]>;
  addThermalRoi(roi: ThermalRoiInput, signal?: AbortSignal): Promise<ThermalRoi>;
  deleteThermalRoi(id: string, signal?: AbortSignal): Promise<void>;
  /** ROI 하나의 시계열 CSV. */
  getThermalRoiCsv(id: string, signal?: AbortSignal): Promise<Blob>;
  /** 열화상 영상. 열화상 대화상자가 열려 있을 때만 연다. */
  openThermalVideo(signal?: AbortSignal): Promise<VideoHandle>;
  /** 카메라 영상(탑뷰·왼팔·오른팔). 모니터링 타일과 확대 보기가 같은 연결을 나눠 쓴다. */
  openCamera(id: CameraId, signal?: AbortSignal): Promise<VideoHandle>;
  /**
   * 장비 쪽 비상 정지(하드웨어 인터록). 아직 서버에 없다. 화면의 E-STOP은 로봇 실행(RunSource)을 멈추고,
   * 이 자리는 장비 서버가 생기면 함께 부른다.
   */
  emergencyStop(signal?: AbortSignal): Promise<void>;
}
