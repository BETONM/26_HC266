import {useRef, useState, type PointerEvent} from 'react';
import {Button, Dialog, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {
  THERMAL_ROI_COLORS,
  THERMAL_SENSOR_HEIGHT,
  THERMAL_SENSOR_WIDTH,
  type ThermalRoi,
} from '../adapters/device/types';
import {useAppStore} from '../app/store';
import {formatValue, roiFromRect, type NormalizedRect} from '../device/feed';
import {addThermalRoi, downloadThermalCsv, removeThermalRoi, useVideo} from './feed';
import {EStopButton} from './RunControls';
import {VideoView} from './VideoView';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 키보드로 쓰는 사람을 위한 영역: 영상 가운데 1/4. 끌어 그리기를 대신한다. */
const CENTER_RECT: NormalizedRect = {left: 0.375, top: 0.375, width: 0.25, height: 0.25};

/** 최고점을 가운데에 둔 20×20칸. 격자 밖으로 나가는 부분은 roiFromRect가 자른다. */
function hotspotRect(hotspot: {x: number; y: number}): NormalizedRect {
  const half = 10;
  const left = Math.max(0, hotspot.x - half) / THERMAL_SENSOR_WIDTH;
  const top = Math.max(0, hotspot.y - half) / THERMAL_SENSOR_HEIGHT;
  return {left, top, width: (half * 2) / THERMAL_SENSOR_WIDTH, height: (half * 2) / THERMAL_SENSOR_HEIGHT};
}

/** 삭제 뒤 포커스: 다음 줄의 삭제, 없으면 앞 줄, 그것도 없으면 '가운데 영역 추가'. 대화상자 처음으로 튀지 않게. */
function focusAfterDelete(rois: ThermalRoi[], index: number) {
  const next = rois[index + 1] ?? rois[index - 1];
  requestAnimationFrame(() => document.getElementById(next ? `roi-delete-${next.id}` : 'roi-add-center')?.focus());
}

function RoiRow({roi, index, rois}: {roi: ThermalRoi; index: number; rois: ThermalRoi[]}) {
  return (
    <li className="roi-row">
      <span
        className="roi-dot"
        style={{background: THERMAL_ROI_COLORS[index % THERMAL_ROI_COLORS.length]}}
        aria-hidden="true"
      />
      <span className="roi-identity">
        <strong>
          #{index + 1} {roi.name}
        </strong>
        <small>
          {roi.w}×{roi.h}칸 · 표본 {roi.samples}
        </small>
      </span>
      <span className="roi-values">
        <strong>{formatValue(roi.last?.mean_c, 2)} °C</strong>
        <small>
          {formatValue(roi.last?.min_c, 1)} ~ {formatValue(roi.last?.max_c, 1)}
        </small>
      </span>
      <span className="roi-actions">
        <Button
          className="text-button"
          aria-label={`${roi.name} 시계열 CSV 받기`}
          onPress={() => void downloadThermalCsv(roi.id, roi.name)}
        >
          CSV
        </Button>
        <Button
          id={`roi-delete-${roi.id}`}
          className="text-button"
          aria-label={`${roi.name} 삭제`}
          onPress={async () => {
            await removeThermalRoi(roi.id);
            focusAfterDelete(rois, index);
          }}
        >
          삭제
        </Button>
      </span>
    </li>
  );
}

function ThermalBody() {
  const thermal = useAppStore((s) => s.thermal);
  const video = useVideo('thermal');
  const frameRef = useRef<HTMLDivElement>(null);
  const origin = useRef<{x: number; y: number} | null>(null);
  const [draft, setDraft] = useState<NormalizedRect | null>(null);
  const draftRef = useRef<NormalizedRect | null>(null);
  const unavailable = Boolean(video.error);
  const stats = thermal.stats;

  const read = (event: PointerEvent<HTMLDivElement>) => {
    const box = frameRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    return {x: clamp01((event.clientX - box.left) / box.width), y: clamp01((event.clientY - box.top) / box.height)};
  };

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (unavailable || event.button !== 0) return;
    const point = read(event);
    if (!point) return;
    // 영상 밖까지 끌어도 놓치지 않게 포인터를 붙잡는다.
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = point;
    draftRef.current = {left: point.x, top: point.y, width: 0, height: 0};
    setDraft(draftRef.current);
  };

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    const point = start ? read(event) : null;
    if (!start || !point) return;
    draftRef.current = {
      left: Math.min(start.x, point.x),
      top: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    };
    setDraft(draftRef.current);
  };

  // pointerup과 pointercancel 모두 끝으로 본다.
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!origin.current) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const rect = draftRef.current;
    origin.current = null;
    draftRef.current = null;
    setDraft(null);
    if (event.type === 'pointercancel' || !rect) return;
    const roi = roiFromRect(rect, thermal.rois.length);
    if (roi) void addThermalRoi(roi);
  };

  return (
    <div className="thermal-body">
      <section className="thermal-feed" aria-label="열화상 실시간 영상">
        <div
          ref={frameRef}
          className="thermal-frame"
          data-unavailable={unavailable || undefined}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          {video.handle ? (
            <VideoView source={video.handle.source} label="열화상 실시간 영상" className="thermal-video" />
          ) : (
            <p className="thermal-placeholder">
              {video.error ? (
                <>
                  <strong>열화상 영상을 불러올 수 없습니다</strong>
                  <span>{video.error}</span>
                </>
              ) : (
                '열화상 영상을 여는 중'
              )}
            </p>
          )}
          {draft && (
            <span
              className="thermal-draft"
              style={{
                left: `${draft.left * 100}%`,
                top: `${draft.top * 100}%`,
                width: `${draft.width * 100}%`,
                height: `${draft.height * 100}%`,
              }}
            />
          )}
        </div>
        <div className="thermal-hint">
          <p>
            {unavailable
              ? '카메라가 연결되면 영상 위를 끌어 추적 영역을 지정할 수 있습니다.'
              : '추적할 영역을 영상 위에서 끌어 그리세요. 등록한 영역은 영상에 번호와 함께 그려집니다.'}
          </p>
          <span className="thermal-add">
            <Button
              id="roi-add-center"
              className="secondary-button"
              isDisabled={unavailable}
              onPress={() => void addThermalRoi(roiFromRect(CENTER_RECT, thermal.rois.length)!)}
            >
              가운데 영역 추가
            </Button>
            {/* 키보드로도 지켜봐야 할 곳(가장 뜨거운 점)을 지정할 수 있게. */}
            <Button
              className="secondary-button"
              isDisabled={unavailable || !stats}
              onPress={() => stats && void addThermalRoi(roiFromRect(hotspotRect(stats.hotspot), thermal.rois.length)!)}
            >
              최고점 둘레 영역 추가
            </Button>
          </span>
        </div>
      </section>

      <aside className="thermal-side">
        <dl className="thermal-stats">
          <div>
            <dt>최고</dt>
            <dd>{formatValue(stats?.max_c, 2)} °C</dd>
          </div>
          <div>
            <dt>평균</dt>
            <dd>{formatValue(stats?.mean_c, 2)} °C</dd>
          </div>
          <div>
            <dt>최저</dt>
            <dd>{formatValue(stats?.min_c, 2)} °C</dd>
          </div>
          <div>
            <dt>최고점</dt>
            <dd>{stats ? `x ${stats.hotspot.x} · y ${stats.hotspot.y}` : '—'}</dd>
          </div>
        </dl>
        {thermal.error && <p className="monitor-note">통계를 받지 못했습니다. {thermal.error}</p>}

        <section className="roi-list" aria-labelledby="roi-list-title">
          <h3 id="roi-list-title" className="monitor-section-title">
            추적 영역 <span className="monitor-count">{thermal.rois.length}개</span>
          </h3>
          {thermal.rois.length > 0 ? (
            <ol>
              {thermal.rois.map((roi, index) => (
                <RoiRow key={roi.id} roi={roi} index={index} rois={thermal.rois} />
              ))}
            </ol>
          ) : (
            <p className="monitor-note">
              아직 등록된 영역이 없습니다. 영상에서 끌어 그리거나, 아래 단추로 가운데나 최고점 둘레를 추가하세요.
            </p>
          )}
        </section>
        {thermal.roiError && (
          <p className="message-error" role="alert">
            영역을 처리하지 못했습니다. {thermal.roiError}
          </p>
        )}
      </aside>
    </div>
  );
}

function ThermalSubtitle() {
  const source = useAppStore((s) => s.telemetry.source);
  return (
    <p className="dialog-subtitle">
      {THERMAL_SENSOR_WIDTH}×{THERMAL_SENSOR_HEIGHT} · 9fps{source === 'mock' && ' · 목업 열화상'}
    </p>
  );
}

/** 열화상 대화상자. 열려 있을 때만 영상을 받는다. */
export function ThermalDialog({isOpen, onOpenChange}: {isOpen: boolean; onOpenChange(open: boolean): void}) {
  return (
    <ModalOverlay className="modal-overlay" isDismissable isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal className="modal modal-wide">
        <Dialog className="dialog">
          {({close}) => (
            <>
              <div className="dialog-head">
                <div>
                  <Heading slot="title" className="dialog-title">
                    열화상 카메라
                  </Heading>
                  <ThermalSubtitle />
                </div>
                <div className="dialog-head-actions">
                  <EStopButton compact showStopped />
                  <Button className="secondary-button" onPress={close}>
                    닫기
                  </Button>
                </div>
              </div>
              <ThermalBody />
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
