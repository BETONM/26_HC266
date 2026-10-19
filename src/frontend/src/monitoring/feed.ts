// 장비 피드를 상태 저장소에 흘려 넣는다. 화면은 저장소만 읽는다.
// 실행 중에는 모니터링 탭을 보고 있지 않아도 받는다. 실행 기록의 센서 시계열이 끊기면 안 되기 때문이다.

import {useEffect, useState} from 'react';
import {deviceSource} from '../adapters';
import {describeCameraError} from '../adapters/device/browserCamera';
import {describeApiError, type CameraId, type ThermalRoiInput, type VideoHandle} from '../adapters/device/types';
import {connectRun, disconnectRun, recordDeviceError, recordSample} from '../app/runController';
import {useAppStore} from '../app/store';
import {isRunActive} from '../domain/run';
import {mergeTelemetry, mergeThermal, startPolling} from '../device/feed';

/** 앱에 하나만 둔다. 보이는 것은 없고, 폴링과 실행 연결만 한다. */
export function LiveFeed() {
  const runId = useAppStore((s) => s.run?.id ?? null);
  const active = useAppStore((s) => (s.run ? isRunActive(s.run.state) : false));
  const monitoring = useAppStore((s) => s.stage === 'monitoring' && s.screen === 'workspace');
  const enabled = active || monitoring;

  // 새로고침 뒤에도 진행 중인 실행에 다시 붙는다.
  useEffect(() => {
    if (!runId) return;
    connectRun();
    return disconnectRun;
  }, [runId]);

  useEffect(() => {
    if (!enabled) return;
    const stopTelemetry = startPolling(async (signal) => {
      const [health, sensors] = await Promise.allSettled([
        deviceSource.getHealth(signal),
        deviceSource.getSensors(signal),
      ]);
      if (signal.aborted) return;
      const next = {
        ...mergeTelemetry(useAppStore.getState().telemetry, health, sensors, new Date().toISOString()),
        source: deviceSource.source,
      };
      useAppStore.setState({telemetry: next});
      recordSample();
      if (next.error) recordDeviceError(`장비 상태: ${next.error}`);
      if (next.sensorError) recordDeviceError(`센서: ${next.sensorError}`);
    });
    const stopThermal = startPolling(async (signal) => {
      const [stats, rois] = await Promise.allSettled([
        deviceSource.getThermalStats(signal),
        deviceSource.listThermalRois(signal),
      ]);
      if (signal.aborted) return;
      const next = mergeThermal(useAppStore.getState().thermal, stats, rois);
      useAppStore.setState({thermal: next});
      if (next.error) recordDeviceError(`열화상: ${next.error}`);
    });
    return () => {
      stopTelemetry();
      stopThermal();
    };
  }, [enabled]);

  return null;
}

// ── 열화상 영역 ──
// 등록·삭제 결과를 바로 반영해 둔다. 다음 폴링이 서버 상태로 다시 맞춘다.

export async function addThermalRoi(input: ThermalRoiInput) {
  try {
    const created = await deviceSource.addThermalRoi(input);
    useAppStore.setState((s) => ({thermal: {...s.thermal, rois: [...s.thermal.rois, created], roiError: null}}));
  } catch (error) {
    useAppStore.setState((s) => ({thermal: {...s.thermal, roiError: describeApiError(error)}}));
  }
}

export async function removeThermalRoi(id: string) {
  try {
    await deviceSource.deleteThermalRoi(id);
    useAppStore.setState((s) => ({
      thermal: {...s.thermal, rois: s.thermal.rois.filter((r) => r.id !== id), roiError: null},
    }));
  } catch (error) {
    useAppStore.setState((s) => ({thermal: {...s.thermal, roiError: describeApiError(error)}}));
  }
}

export async function downloadThermalCsv(id: string, name: string) {
  try {
    const blob = await deviceSource.getThermalRoiCsv(id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    useAppStore.setState((s) => ({thermal: {...s.thermal, roiError: null}}));
  } catch (error) {
    useAppStore.setState((s) => ({thermal: {...s.thermal, roiError: describeApiError(error)}}));
  }
}

// ── 영상 ──

export type VideoState = {handle: VideoHandle | null; loading: boolean; error: string | null};

/**
 * 마운트하면 영상을 열고, 언마운트하면 닫는다(트랙 정지). 여는 도중 언마운트돼도 연 것을 닫는다.
 * 그래서 '보일 때만 받는다'는 이 훅을 쓰는 컴포넌트를 보일 때만 그리는 것으로 지킨다(열화상은 대화상자 안).
 * 카메라는 타일과 확대 보기가 이 값 하나를 나눠 쓴다. 연결은 카메라마다 하나다.
 */
export function useVideo(kind: CameraId | 'thermal'): VideoState {
  const [state, setState] = useState<VideoState>({handle: null, loading: true, error: null});
  useEffect(() => {
    const controller = new AbortController();
    let handle: VideoHandle | null = null;
    const open =
      kind === 'thermal'
        ? deviceSource.openThermalVideo(controller.signal)
        : deviceSource.openCamera(kind, controller.signal);
    open.then(
      (opened) => {
        if (controller.signal.aborted) {
          opened.close();
          return;
        }
        handle = opened;
        setState({handle: opened, loading: false, error: null});
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const message = kind === 'thermal' ? describeApiError(error) : describeCameraError(error);
        setState({handle: null, loading: false, error: message || '영상을 열지 못했습니다.'});
      },
    );
    return () => {
      controller.abort();
      handle?.close();
    };
  }, [kind]);
  return state;
}
