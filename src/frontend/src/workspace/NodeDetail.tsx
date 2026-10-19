import {Button} from 'react-aria-components';
import {insertReference} from '../app/chatController';
import {labelName} from '../graph/canvas/labels';
import {
  hasLabel,
  inventoryStatusLabel,
  nodeName,
  severityRank,
  usageRoleLabel,
  type GraphNode,
  type GraphSnapshot,
  type TypedNode,
  type UsageRole,
} from '../graph/model';
import {HazardBadge} from '../hazard/HazardBadge';

// 노드 상세는 시약병 라벨처럼 정해진 칸에 값을 적는다. 이름·화학식·농도는 본문 글꼴, CAS·로트는 고정폭(대조하는 값).

type Row = {label: string; value: string; mono?: boolean; chip?: string};

function Grid({rows}: {rows: Row[]}) {
  return (
    <dl className="label-grid">
      {rows.map((row) => (
        <div key={row.label} className="label-grid-row">
          <dt>{row.label}</dt>
          <dd className={row.mono ? 'mono' : undefined}>
            {row.value}
            {row.chip && <span className="stock-chip">{row.chip}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const byId = (graph: GraphSnapshot) => new Map(graph.nodes.map((n) => [n.id, n]));

function locationName(inventory: GraphSnapshot, id: string): string | null {
  const rel = inventory.relationships.find((r) => r.type === 'STORED_AT' && r.startNode === id);
  const loc = rel && inventory.nodes.find((n) => n.id === rel.endNode);
  return loc ? nodeName(loc) : null;
}

/** 이 노드에서 생길 수 있는 위험(물질 자체 + 조건부), 심각도순. */
function hazardsOf(inventory: GraphSnapshot, id: string): Array<{hazard: TypedNode<'Hazard'>; condition?: string}> {
  const nodes = byId(inventory);
  return inventory.relationships
    .filter((r) => (r.type === 'HAS_HAZARD' || r.type === 'CAUSES') && r.startNode === id)
    .flatMap((r) => {
      const h = nodes.get(r.endNode);
      return h && hasLabel(h, 'Hazard')
        ? [{hazard: h, ...(typeof r.properties.condition === 'string' && {condition: r.properties.condition})}]
        : [];
    })
    .sort((a, b) => severityRank(b.hazard.properties.severity) - severityRank(a.hazard.properties.severity));
}

function rowsFor(node: GraphNode, inventory: GraphSnapshot, draft: GraphSnapshot | null): Row[] {
  const location = locationName(inventory, node.id);
  if (hasLabel(node, 'Chemical')) {
    const p = node.properties;
    const use = draft?.relationships.find((r) => r.type === 'USES' && r.endNode === node.id);
    const amount = use && typeof use.properties.amount === 'number' ? use.properties.amount : null;
    const rows: Row[] = [
      {label: '화학식', value: p.formula},
      {label: '농도', value: p.concentration},
      {label: '상', value: p.phase},
      {
        label: '보유량',
        value: `${p.quantity} ${p.unit}`,
        ...(p.status !== 'available' && {chip: inventoryStatusLabel[p.status]}),
      },
      {label: '위치', value: location ?? '등록되지 않음'},
      {label: 'CAS', value: p.cas, mono: true},
      {label: '로트', value: p.lot, mono: true},
      {label: '유효기간', value: p.expiresAt, mono: true},
    ];
    if (amount !== null) {
      const role = typeof use?.properties.role === 'string' ? usageRoleLabel[use.properties.role as UsageRole] : '';
      rows.splice(0, 0, {
        label: '이 실험에서',
        value: `${amount} ${String(use?.properties.unit ?? '')}${role ? ` · ${role}` : ''}`,
        ...(amount > p.quantity && {chip: `${amount - p.quantity} ${p.unit} 부족`}),
      });
    }
    return rows;
  }
  if (hasLabel(node, 'Equipment')) {
    const p = node.properties;
    return [
      {label: '규격', value: p.spec},
      {
        label: '수량',
        value: `${p.quantity}개`,
        ...(p.status !== 'available' && {chip: inventoryStatusLabel[p.status]}),
      },
      {label: '위치', value: location ?? '등록되지 않음'},
    ];
  }
  if (hasLabel(node, 'Device')) {
    return [
      {label: '모델', value: node.properties.model},
      {
        label: '연결',
        value:
          node.properties.connection === 'unknown'
            ? '장비 API에 연결되면 확인할 수 있습니다'
            : node.properties.connection,
      },
    ];
  }
  if (hasLabel(node, 'Experiment')) {
    const p = node.properties;
    return [
      ...(p.duration ? [{label: '소요', value: p.duration}] : []),
      ...(p.temperature ? [{label: '온도', value: p.temperature}] : []),
      ...(p.formula ? [{label: '반응식', value: p.formula}] : []),
      ...(p.observation ? [{label: '관찰', value: p.observation}] : []),
    ];
  }
  if (hasLabel(node, 'Product')) {
    return [
      ...(node.properties.formula ? [{label: '화학식', value: node.properties.formula}] : []),
      {
        label: '종류',
        value: {product: '생성물', byproduct: '부산물', intermediate: '중간 생성물'}[node.properties.kind],
      },
    ];
  }
  if (hasLabel(node, 'Location')) {
    const items = inventory.relationships
      .filter((r) => r.type === 'STORED_AT' && r.endNode === node.id)
      .map((r) => inventory.nodes.find((n) => n.id === r.startNode));
    return [{label: '보관 중', value: items.flatMap((n) => (n ? [nodeName(n)] : [])).join(', ') || '없음'}];
  }
  return [];
}

export function NodeDetail({
  node,
  inventory,
  draft,
  onClose,
}: {
  node: GraphNode;
  inventory: GraphSnapshot;
  draft: GraphSnapshot | null;
  onClose(): void;
}) {
  const name = nodeName(node);
  const titleId = `detail-${node.id}`;
  const hazard = hasLabel(node, 'Hazard') ? node : null;
  const causes = hazard
    ? inventory.relationships
        .filter((r) => (r.type === 'HAS_HAZARD' || r.type === 'CAUSES') && r.endNode === node.id)
        .map((r) => {
          const source = inventory.nodes.find((n) => n.id === r.startNode);
          return `${source ? nodeName(source) : r.startNode}${typeof r.properties.condition === 'string' ? ` — ${r.properties.condition}` : ''}`;
        })
    : [];
  const hazards = hazard ? [] : hazardsOf(inventory, node.id);

  return (
    <section className="node-detail-panel" aria-labelledby={titleId}>
      <header className="node-detail-header">
        <div>
          <p className="node-detail-kind">{hazard ? '위험' : labelName[node.labels[0]!]}</p>
          <h3 id={titleId} className="node-detail-title">
            {name}
          </h3>
        </div>
        <Button className="icon-button" aria-label="상세 닫기" onPress={onClose}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </Button>
      </header>

      {hazard && (
        <div className="node-detail-body">
          <HazardBadge severity={hazard.properties.severity} />
          <p>{hazard.properties.description}</p>
          {hazard.properties.mitigation && (
            <p>
              <strong>대응</strong> {hazard.properties.mitigation}
            </p>
          )}
          {causes.length > 0 && (
            <>
              <h4 className="node-detail-subtitle">일으키는 것</h4>
              <ul className="plain-list">
                {causes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!hazard && hazards.length > 0 && (
        <ul className="node-detail-hazards" aria-label="연결된 위험">
          {hazards.map(({hazard: h, condition}) => (
            <li key={h.id}>
              <HazardBadge severity={h.properties.severity} title={h.properties.title} />
              {condition && <span className="node-detail-condition">조건: {condition}</span>}
            </li>
          ))}
        </ul>
      )}
      {!hazard && hazards.length === 0 && (node.labels[0] === 'Chemical' || node.labels[0] === 'Equipment') && (
        <p className="node-detail-note">등록된 위험이 없습니다. 실제 제품의 MSDS로 한 번 더 확인하세요.</p>
      )}
      {!hazard && hasLabel(node, 'Experiment') && <p className="node-detail-note">{node.properties.description}</p>}

      <Grid rows={rowsFor(node, inventory, draft)} />

      <div className="node-detail-actions">
        <Button className="secondary-button" onPress={() => insertReference(name)}>
          대화에 넣기
        </Button>
      </div>
    </section>
  );
}
