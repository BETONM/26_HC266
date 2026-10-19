// RealSense를 브라우저가 직접 연다(이전 레포 useCameraStream). RealSense는 UI를 띄운 컴퓨터에 USB로 붙어 있고
// OS가 일반 UVC 카메라로 내보내서 별도 프레임 서버가 필요 없다. 서버 MJPEG로 바뀌면 HttpDeviceSource가 URL을 준다.

import {abortError} from '../faults';
import type {VideoHandle} from './types';

const DEVICE_PATTERN = /realsense/i;

export class CameraNotFoundError extends Error {
  constructor(readonly cameras: string[]) {
    super('');
    this.name = 'CameraNotFoundError';
  }
}

/** 카메라 오류를 화면 문구로. RealSense를 못 찾았으면 인식된 카메라 이름을 함께 준다. */
export function describeCameraError(error: unknown): string {
  if (error instanceof CameraNotFoundError) {
    return error.cameras.length > 0
      ? `RealSense 카메라를 찾지 못했습니다. 인식된 카메라: ${error.cameras.join(', ')}`
      : 'RealSense 카메라를 찾지 못했습니다.';
  }
  if (error instanceof DOMException) {
    if (error.name === 'AbortError') return '';
    if (error.name === 'NotAllowedError') return '브라우저에서 카메라 권한을 허용해야 합니다.';
    if (error.name === 'NotFoundError') return '연결된 카메라를 찾지 못했습니다.';
    if (error.name === 'NotReadableError') return '카메라를 다른 프로그램이 사용 중입니다.';
    return `${error.name}: ${error.message}`;
  }
  if (error instanceof Error) return error.message;
  return '카메라를 열지 못했습니다.';
}

/** 장치 라벨 끝의 USB id '(8086:0b07)'는 사람에게 뜻이 없어 지운다. */
export function cleanCameraLabel(label: string): string {
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '');
}

const stopAll = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

export async function openRealSense(signal?: AbortSignal): Promise<VideoHandle> {
  let probe: MediaStream | null = null;
  let opened: MediaStream | null = null;
  try {
    // 권한을 받기 전에는 장치 이름이 빈 문자열이라 어느 것이 RealSense인지 알 수 없다. 먼저 아무 카메라나 열어 권한을 받는다.
    probe = await navigator.mediaDevices.getUserMedia({video: true});
    if (signal?.aborted) throw abortError();
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const target = devices.find((d) => DEVICE_PATTERN.test(d.label));
    if (!target) throw new CameraNotFoundError(devices.map((d) => d.label).filter(Boolean));

    // 권한 확인용 스트림이 이미 그 장치면 그대로 쓰고, 아니면 닫고 그 장치를 1280×720으로 다시 연다.
    if (probe.getVideoTracks()[0]?.getSettings().deviceId === target.deviceId) {
      opened = probe;
      probe = null;
    } else {
      stopAll(probe);
      probe = null;
      opened = await navigator.mediaDevices.getUserMedia({
        video: {deviceId: {exact: target.deviceId}, width: {ideal: 1280}, height: {ideal: 720}},
      });
    }
    // 여는 도중 취소됐으면 연 것을 닫는다. 그냥 두면 카메라 불이 켜진 채 남는다.
    if (signal?.aborted) throw abortError();

    const stream = opened;
    const settings = stream.getVideoTracks()[0]?.getSettings();
    return {
      source: {kind: 'stream', stream},
      info: {
        label: cleanCameraLabel(target.label),
        width: settings?.width,
        height: settings?.height,
        frameRate: settings?.frameRate,
      },
      close: () => stopAll(stream),
    };
  } catch (error) {
    stopAll(probe);
    stopAll(opened);
    throw error;
  }
}
