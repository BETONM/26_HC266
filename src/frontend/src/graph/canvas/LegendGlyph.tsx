import {SeverityShapes} from '../../hazard/HazardBadge';
import type {NodeLabel} from '../model';

/**
 * 범례의 작은 그림. 그래프 노드와 같은 모양이라 범례를 보고 그래프를 읽을 수 있다.
 * 색은 currentColor·토큰을 따른다. 위험은 '높음' 기호로 대표한다(심각도별 모양은 위험 요약에 있다).
 */
export function LegendGlyph({label}: {label: NodeLabel}) {
  return (
    <svg
      className="legend-glyph"
      data-label={label}
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      {label === 'Experiment' && (
        <>
          <circle className="legend-fill" cx="8" cy="8" r="6.5" />
          <circle className="legend-core" cx="8" cy="8" r="2.6" />
        </>
      )}
      {label === 'Chemical' && <circle className="legend-fill" cx="8" cy="8" r="5" />}
      {label === 'Product' && <circle className="legend-ring" cx="8" cy="8" r="4.5" />}
      {label === 'Equipment' && <rect className="legend-muted" x="3.5" y="3.5" width="9" height="9" rx="2" />}
      {label === 'Device' && (
        <rect className="legend-muted" x="4.5" y="4.5" width="7" height="7" rx="1" transform="rotate(45 8 8)" />
      )}
      {label === 'Location' && <circle className="legend-pool" cx="8" cy="8" r="7" />}
      {label === 'Hazard' && <SeverityShapes severity="high" />}
    </svg>
  );
}
