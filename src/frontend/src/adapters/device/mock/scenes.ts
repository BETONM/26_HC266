// 목업 영상. canvas에 그리고 captureStream()으로 MediaStream을 준다. 실제 카메라와 같은 <video> 경로로 그려지게 하려는 것이다.
// 여기 색은 '찍힌 장면'의 색이라 화면 디자인 토큰을 쓰지 않는다.

import {clockTime} from '../../../domain/run';
import type {CameraId, VideoHandle} from '../types';
import {inferno, liquidColor, type ThermalField} from './model';

type Frame = (ctx: CanvasRenderingContext2D, t: number) => void;

function animate(width: number, height: number, fps: number, draw: Frame, info: VideoHandle['info']): VideoHandle {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    throw new DOMException(
      '이 브라우저는 목업 영상을 만들 수 없습니다(canvas.captureStream 없음).',
      'NotSupportedError',
    );
  }
  const tick = () => draw(ctx, performance.now() / 1000);
  tick();
  const timer = setInterval(tick, 1000 / fps);
  const stream = canvas.captureStream(fps);
  return {
    source: {kind: 'stream', stream},
    info: {...info, width, height, frameRate: fps},
    close: () => {
      clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
    },
  };
}

/** 열화상: 센서 격자를 inferno로 칠해 640×480으로 키운다. 등록된 ROI 사각형을 서버처럼 영상 위에 그린다. */
export function thermalVideo(
  read: (t: number) => {
    field: ThermalField;
    rois: {x: number; y: number; w: number; h: number; color: string; label: string}[];
  },
): VideoHandle {
  const small = document.createElement('canvas');
  return animate(
    640,
    480,
    9,
    (ctx, t) => {
      const {field, rois} = read(t);
      small.width = field.width;
      small.height = field.height;
      const sctx = small.getContext('2d')!;
      const image = sctx.createImageData(field.width, field.height);
      // 색 범위는 프레임마다 맞춘다(서버의 자동 범위와 같게).
      let lo = Infinity;
      let hi = -Infinity;
      for (const v of field.values) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      for (let i = 0; i < field.values.length; i += 1) {
        const [r, g, b] = inferno((field.values[i]! - lo) / Math.max(0.1, hi - lo));
        image.data.set([r, g, b, 255], i * 4);
      }
      sctx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, 640, 480);
      const sx = 640 / field.width;
      const sy = 480 / field.height;
      ctx.lineWidth = 2;
      ctx.font = '600 16px sans-serif';
      ctx.fillStyle = 'rgb(255 255 255 / 0.8)';
      ctx.font = '500 14px monospace';
      ctx.fillText(`MOCK · ${clockTime(new Date().toISOString())}`, 14, 24);
      ctx.font = '600 16px sans-serif';
      for (const roi of rois) {
        ctx.strokeStyle = roi.color;
        ctx.fillStyle = roi.color;
        ctx.strokeRect(roi.x * sx, roi.y * sy, roi.w * sx, roi.h * sy);
        ctx.fillText(roi.label, roi.x * sx + 4, roi.y * sy + 18);
      }
    },
    {label: '목업 열화상'},
  );
}

type CameraScene = {coverage: number; stirring: boolean; fraction: number};

const W = 640;
const H = 360;

function stamp(ctx: CanvasRenderingContext2D, tag: string) {
  // 시각 표시(실제 카메라 화면처럼). 어느 카메라인지도 영상 안에 남긴다.
  ctx.fillStyle = 'rgb(255 255 255 / 0.8)';
  ctx.font = '500 14px monospace';
  ctx.fillText(`MOCK · ${tag} · ${clockTime(new Date().toISOString())}`, 14, 24);
}

function swirl(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, t: number) {
  ctx.strokeStyle = 'rgb(255 255 255 / 0.25)';
  ctx.lineWidth = 3;
  for (let k = 0; k < 3; k += 1) {
    const a = t * 3 + (k * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.ellipse(x, y, rx + k * rx * 0.3, ry + k * ry * 0.3, 0, a, a + 1.6);
    ctx.stroke();
  }
}

// 시약대의 바이알 색. 녹말 지시약·아황산수소나트륨·아이오딘산칼륨처럼 보이게만 고른 장면 색이다.
const VIALS = ['#e9e4d4', '#d8e6ef', '#f1ecd2', '#e4e8ee', '#d9d2c4', '#e8e1ef'];

/** 탑뷰: 작업대를 위에서. 가운데 비커(용액 색), 왼쪽 시약대, 아래 레일, 진행에 따라 오가는 두 팔. */
function drawTop(ctx: CanvasRenderingContext2D, t: number, {coverage, stirring, fraction}: CameraScene) {
  ctx.fillStyle = '#5d6166';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgb(255 255 255 / 0.06)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  // 레일
  ctx.fillStyle = '#3b3f45';
  ctx.fillRect(40, 300, 560, 22);
  ctx.fillStyle = '#9aa0a6';
  const carriage = 60 + fraction * 480;
  ctx.fillRect(carriage, 296, 40, 30);
  // 시약대
  ctx.fillStyle = '#44484e';
  ctx.fillRect(48, 70, 150, 190);
  VIALS.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(88 + (i % 2) * 70, 110 + Math.floor(i / 2) * 55, 20, 0, Math.PI * 2);
    ctx.fill();
  });
  // 비커(위에서 본 원)
  const [r, g, b] = liquidColor(coverage);
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.beginPath();
  ctx.arc(400, 165, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgb(230 236 240 / 0.85)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(400, 165, 76, 0, Math.PI * 2);
  ctx.stroke();
  if (stirring) swirl(ctx, 400, 165, 34, 34, t);
  // 두 팔의 끝. 왼팔은 비커 옆을 지키고, 오른팔은 시약대와 비커 사이를 오간다.
  const reach = (Math.sin(fraction * Math.PI * 6) + 1) / 2;
  const arms: [number, number][] = [
    [300, 90],
    [200 + reach * 300, 250],
  ];
  for (const [x, y] of arms) {
    ctx.fillStyle = '#d6dadf';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2f36';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  stamp(ctx, 'TOP');
}

/** 왼팔: 손목에서 본 반응 용기 옆모습. 용액 색은 청람색 면적 비율을 따르고, 교반 중이면 소용돌이가 돈다. */
function drawLeftArm(ctx: CanvasRenderingContext2D, t: number, {coverage, stirring}: CameraScene) {
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, '#2b2f36');
  wall.addColorStop(0.62, '#3a3f47');
  wall.addColorStop(0.63, '#8c8f93');
  wall.addColorStop(1, '#6f7276');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  const [r, g, b] = liquidColor(coverage);
  const left = 250;
  const right = 390;
  const top = 120;
  const bottom = 268;
  const level = 168;
  ctx.fillStyle = `rgb(${r} ${g} ${b})`;
  ctx.beginPath();
  ctx.moveTo(left + 4, level);
  ctx.lineTo(right - 4, level);
  ctx.lineTo(right - 6, bottom - 6);
  ctx.quadraticCurveTo(320, bottom + 4, left + 6, bottom - 6);
  ctx.closePath();
  ctx.fill();
  if (stirring) swirl(ctx, 320, 222, 40, 10, t);
  ctx.strokeStyle = 'rgb(230 236 240 / 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left - 6, top);
  ctx.lineTo(left, top + 6);
  ctx.lineTo(left + 6, bottom - 6);
  ctx.quadraticCurveTo(320, bottom + 4, right - 6, bottom - 6);
  ctx.lineTo(right, top + 6);
  ctx.lineTo(right + 6, top);
  ctx.stroke();
  ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
  ctx.beginPath();
  ctx.moveTo(left + 18, top + 20);
  ctx.lineTo(left + 22, bottom - 24);
  ctx.stroke();
  // 그리퍼 손가락(화면 왼쪽 끝)
  ctx.fillStyle = '#c9cdd2';
  ctx.fillRect(0, 150, 120, 26);
  ctx.fillRect(0, 214, 120, 26);
  stamp(ctx, 'L-ARM');
}

/** 오른팔: 손목에서 본 시약대. 피펫 끝이 진행에 따라 바이알 위를 옮겨 간다. */
function drawRightArm(ctx: CanvasRenderingContext2D, _t: number, {fraction}: CameraScene) {
  ctx.fillStyle = '#4a4e54';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6a6e74';
  ctx.fillRect(0, 250, W, 110);
  VIALS.forEach((c, i) => {
    const x = 70 + i * 95;
    ctx.fillStyle = c;
    ctx.fillRect(x, 170, 50, 110);
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(x - 3, 160, 56, 14);
  });
  const slot = Math.min(VIALS.length - 1, Math.floor(fraction * VIALS.length));
  const x = 95 + slot * 95;
  ctx.fillStyle = '#e6e9ec';
  ctx.fillRect(x - 10, 0, 20, 110);
  ctx.beginPath();
  ctx.moveTo(x - 10, 110);
  ctx.lineTo(x + 10, 110);
  ctx.lineTo(x, 145);
  ctx.closePath();
  ctx.fill();
  stamp(ctx, 'R-ARM');
}

const SCENES: Record<
  CameraId,
  {draw: (ctx: CanvasRenderingContext2D, t: number, s: CameraScene) => void; label: string}
> = {
  top: {draw: drawTop, label: '목업 탑뷰 카메라'},
  'left-arm': {draw: drawLeftArm, label: '목업 왼팔 카메라'},
  'right-arm': {draw: drawRightArm, label: '목업 오른팔 카메라'},
};

/** 카메라 하나의 목업 영상. 장면은 카메라마다 다르고, 셋 다 같은 실행 진행을 본다. */
export function cameraVideo(id: CameraId, read: () => CameraScene): VideoHandle {
  const scene = SCENES[id];
  return animate(W, H, 15, (ctx, t) => scene.draw(ctx, t, read()), {label: scene.label});
}
