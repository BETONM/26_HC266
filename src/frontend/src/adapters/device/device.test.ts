import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanCameraLabel, CameraNotFoundError, describeCameraError} from './browserCamera';
import {HttpDeviceSource} from './HttpDeviceSource';
import {MockDeviceSource, reactionSecond} from './mock/MockDeviceSource';
import {chemistryAt, fieldStats, inferno, liquidColor, regionSample, seriesCsv, thermalField} from './mock/model';
import {DeviceApiError} from './types';

describe('목업 장비 모델', () => {
  it('센서 곡선은 이전 실측(anchors)을 잇는다', () => {
    expect(chemistryAt(0)).toMatchObject({ec: 842, ph: 6.72});
    expect(chemistryAt(30).ec).toBeCloseTo(874);
    expect(chemistryAt(9999).ph).toBe(6.38);
    expect(chemistryAt(0).tds).toBe(421);
  });

  it('진행의 앞 1/4(시약을 넣는 동안)은 바탕값이다', () => {
    expect(reactionSecond(0.2)).toBe(0);
    expect(reactionSecond(1)).toBe(512);
  });

  it('열화상 통계와 영역 표본은 같은 격자에서 계산한다', () => {
    const field = thermalField(10, 24);
    const stats = fieldStats(field, 10);
    expect(stats.max_c).toBeGreaterThan(stats.mean_c);
    expect(stats.min_c).toBeLessThan(stats.mean_c);
    const whole = regionSample(field, {x: 0, y: 0, w: 160, h: 120}, 10);
    expect(whole.mean_c).toBeCloseTo(stats.mean_c, 1);
    expect(Number.isNaN(regionSample(field, {x: 200, y: 0, w: 4, h: 4}, 10).mean_c)).toBe(true);
  });

  it('CSV는 서버 series.csv와 같은 열', () => {
    expect(seriesCsv([{t: 1.25, mean_c: 24, min_c: 23, max_c: 25}])).toBe('t,mean_c,min_c,max_c\n1.3,24,23,25\n');
  });

  it('색표 끝값', () => {
    expect(inferno(0)).toEqual([0, 0, 4]);
    expect(inferno(1)).toEqual([252, 255, 164]);
    expect(liquidColor(0)).toEqual([229, 233, 227]);
  });
});

describe('MockDeviceSource', () => {
  it('stale을 주입하면 마지막 값에 멈추고 표시한다', async () => {
    let t = 0;
    const device = new MockDeviceSource({stale: true, now: () => t});
    const first = await device.getSensors();
    t = 60_000;
    const second = await device.getSensors();
    expect(second).toMatchObject({stale: true, ph: first.ph});
  });

  it('열화상 꺼짐: 통계는 503, ROI 목록은 온다', async () => {
    const device = new MockDeviceSource({offline: {thermal: 'off'}});
    await expect(device.getThermalStats()).rejects.toMatchObject({status: 503});
    await expect(device.listThermalRois()).resolves.toEqual([]);
    const health = await device.getHealth();
    expect(health.thermal).toMatchObject({available: false, opened: false});
  });

  it('ROI를 등록하면 표본을 쌓고, CSV로 내보내고, 지울 수 있다', async () => {
    let t = 0;
    const device = new MockDeviceSource({now: () => t});
    const roi = await device.addThermalRoi({x: 60, y: 50, w: 40, h: 30, name: '영역 1'});
    for (let i = 1; i <= 3; i += 1) {
      t = i * 1500;
      await device.getThermalStats();
    }
    const [listed] = await device.listThermalRois();
    expect(listed?.samples).toBe(3);
    expect(listed?.last?.mean_c).toBeGreaterThan(20);
    const csv = await (await device.getThermalRoiCsv(roi.id)).text();
    expect(csv.split('\n').filter(Boolean)).toHaveLength(4);
    await device.deleteThermalRoi(roi.id);
    await expect(device.listThermalRois()).resolves.toEqual([]);
    await expect(device.deleteThermalRoi(roi.id)).rejects.toBeInstanceOf(DeviceApiError);
  });

  it('연결 끊김은 네트워크 실패(TypeError)로 낸다', async () => {
    const device = new MockDeviceSource({faults: {disconnectEvery: 1}});
    await expect(device.getSensors()).rejects.toBeInstanceOf(TypeError);
  });

  it('센서 값은 실행 진행을 따른다', async () => {
    const before = new MockDeviceSource({progress: () => ({fraction: 0, state: 'running'})});
    const after = new MockDeviceSource({progress: () => ({fraction: 1, state: 'done'})});
    expect((await after.getSensors()).ec! - (await before.getSensors()).ec!).toBeGreaterThan(250);
  });
});

describe('HttpDeviceSource', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('이전 deviceApi.ts의 경로를 쓰고, 오류 본문의 detail을 우선한다', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.endsWith('/thermal/stats')) return new Response(JSON.stringify({detail: '프레임 없음'}), {status: 503});
      if (url.endsWith('/thermal/rois')) return new Response(JSON.stringify({rois: []}));
      if (url.endsWith('/sensors')) return new Response('not json', {status: 500});
      return new Response(JSON.stringify({ok: true, id: 'r1'}));
    });
    const device = new HttpDeviceSource('http://pi:8000', 'mjpeg');
    await expect(device.getThermalStats()).rejects.toMatchObject({message: '프레임 없음', status: 503});
    await expect(device.getSensors()).rejects.toMatchObject({message: '장비 API 오류 (500)'});
    await expect(device.listThermalRois()).resolves.toEqual([]);
    await device.deleteThermalRoi('a/b');
    expect(calls).toEqual([
      'GET http://pi:8000/thermal/stats',
      'GET http://pi:8000/sensors',
      'GET http://pi:8000/thermal/rois',
      'DELETE http://pi:8000/thermal/roi/a%2Fb',
    ]);
    expect((await device.openCamera('top')).source).toEqual({kind: 'url', url: 'http://pi:8000/camera/stream?fps=10'});
    await expect(device.openCamera('left-arm')).rejects.toMatchObject({status: 501});
    expect((await device.openThermalVideo()).source).toEqual({
      kind: 'url',
      url: 'http://pi:8000/thermal/stream?fps=9&width=640&colormap=inferno',
    });
  });
});

describe('브라우저 카메라', () => {
  it('오류 문구와 장치 라벨 정리', () => {
    expect(describeCameraError(new DOMException('', 'NotAllowedError'))).toBe(
      '브라우저에서 카메라 권한을 허용해야 합니다.',
    );
    expect(describeCameraError(new DOMException('', 'NotReadableError'))).toBe(
      '카메라를 다른 프로그램이 사용 중입니다.',
    );
    expect(describeCameraError(new CameraNotFoundError(['FaceTime HD Camera']))).toBe(
      'RealSense 카메라를 찾지 못했습니다. 인식된 카메라: FaceTime HD Camera',
    );
    expect(cleanCameraLabel('Intel(R) RealSense(TM) Depth Camera 415  RGB (8086:0ad3)')).toBe(
      'Intel(R) RealSense(TM) Depth Camera 415  RGB',
    );
  });
});
