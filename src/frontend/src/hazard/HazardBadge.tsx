import {
  hasLabel,
  SEVERITIES,
  severityLabel,
  severityRank,
  type GraphSnapshot,
  type Severity,
  type TypedNode,
} from '../graph/model';
import './hazard.css';

// 심각도의 순서는 색이 아니라 모양·채움·글자로도 읽혀야 한다. 모양은 위험에만 쓴다.
// 매우 높음: 채운 팔각형, 높음: 채운 삼각형, 보통: 반 채운 원, 낮음: 빈 원.
export function SeverityGlyph({severity}: {severity: Severity}) {
  return (
    <svg className="severity-glyph" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <SeverityShapes severity={severity} />
    </svg>
  );
}

/** 16×16 좌표의 심각도 도형. 그래프 노드처럼 이미 <svg> 안에 있을 때는 이것만 쓴다. */
export function SeverityShapes({severity}: {severity: Severity}) {
  return (
    <>
      {/* 작은 크기에서 채운 원과 헷갈리지 않게 팔각형 안에 '!'을 뚫는다. */}
      {severity === 'critical' && (
        <path d="M5.2 1h5.6L15 5.2v5.6L10.8 15H5.2L1 10.8V5.2zM7 4h2v5H7zM7 10.5h2v2H7z" fill="currentColor" fillRule="evenodd" />
      )}
      {severity === 'high' && <path d="M8 1.5 15 14.5H1z" fill="currentColor" />}
      {severity === 'medium' && (
        <>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z" fill="currentColor" />
        </>
      )}
      {severity === 'low' && <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />}
    </>
  );
}

/** `[모양] 매우 높음 · 제목`. 제목이 없으면 심각도만. */
export function HazardBadge({severity, title}: {severity: Severity; title?: string}) {
  return (
    <span className="hazard-badge" data-severity={severity}>
      <SeverityGlyph severity={severity} />
      <span className="hazard-badge-label">{severityLabel[severity]}</span>
      {title && (
        <>
          <span aria-hidden="true"> · </span>
          <span>{title}</span>
        </>
      )}
    </span>
  );
}

export function countHazards(graph: GraphSnapshot | null): Record<Severity, number> {
  const counts: Record<Severity, number> = {low: 0, medium: 0, high: 0, critical: 0};
  for (const node of graph?.nodes ?? []) {
    const severity = node.properties.severity;
    if (node.labels.includes('Hazard') && typeof severity === 'string' && severity in counts) counts[severity as Severity] += 1;
  }
  return counts;
}

/** 위험 노드를 무거운 것부터. 같은 심각도면 그래프 순서를 지킨다. */
export function hazardsBySeverity(graph: GraphSnapshot | null): TypedNode<'Hazard'>[] {
  const hazards = (graph?.nodes ?? []).filter((n): n is TypedNode<'Hazard'> => hasLabel(n, 'Hazard'));
  return hazards
    .map((node, index) => ({node, index}))
    .sort(
      (a, b) =>
        severityRank(b.node.properties.severity) - severityRank(a.node.properties.severity) || a.index - b.index,
    )
    .map(({node}) => node);
}

/** 심각도가 높은 순으로 '매우 높음 1 · 높음 1'. 위험이 없으면 아무것도 그리지 않는다. */
export function HazardSummary({graph, className}: {graph: GraphSnapshot | null; className?: string}) {
  const counts = countHazards(graph);
  const present = [...SEVERITIES].reverse().filter((s) => counts[s] > 0);
  if (present.length === 0) return null;
  const spoken = present.map((s) => `${severityLabel[s]} ${counts[s]}건`).join(', ');
  return (
    <div className={['hazard-summary', className].filter(Boolean).join(' ')} role="group" aria-label={`이 실험의 위험: ${spoken}`}>
      <span className="hazard-summary-title" aria-hidden="true">
        위험
      </span>
      <ul className="hazard-summary-list" aria-hidden="true">
        {present.map((s) => (
          <li key={s} className="hazard-summary-item" data-severity={s}>
            <SeverityGlyph severity={s} />
            <span>{severityLabel[s]}</span>
            <span className="hazard-summary-count">{counts[s]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
