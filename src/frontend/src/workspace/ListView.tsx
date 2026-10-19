import {Button} from 'react-aria-components';
import {draftHazards, specFromDraftGraph} from '../domain/draft';
import {labelName, nodeLines} from '../graph/canvas/labels';
import {hasLabel, inventoryStatusLabel, nodeName, usageRoleLabel, type GraphNode, type GraphSnapshot} from '../graph/model';
import {HazardBadge} from '../hazard/HazardBadge';
import {groupForList} from './listOrder';

// 그래프의 글 대안. 그래프를 보기 어려운 사람과 인쇄를 위해, 같은 내용을 표와 목록으로 보여 준다.
// 위험이 언제나 가장 먼저 나온다.

const locationOf = (inventory: GraphSnapshot, id: string) => {
  const rel = inventory.relationships.find((r) => r.type === 'STORED_AT' && r.startNode === id);
  const loc = rel && inventory.nodes.find((n) => n.id === rel.endNode);
  return loc ? nodeName(loc) : '—';
};

function DetailButton({node, onSelect}: {node: GraphNode; onSelect(id: string): void}) {
  return (
    <Button className="link-button" onPress={() => onSelect(node.id)}>
      {nodeName(node)}
    </Button>
  );
}

function DraftTables({draft, inventory, onSelect}: {draft: GraphSnapshot; inventory: GraphSnapshot; onSelect(id: string): void}) {
  const spec = specFromDraftGraph(draft);
  if (!spec) return null;
  const nodes = new Map([...inventory.nodes, ...draft.nodes].map((n) => [n.id, n]));
  const hazards = draftHazards(inventory, spec);
  const required = spec.requires.map((r) => ({req: r, node: nodes.get(r.targetId)})).filter((x): x is {req: typeof x.req; node: GraphNode} => Boolean(x.node));
  const equipment = required.filter((x) => hasLabel(x.node, 'Equipment'));
  const devices = required.filter((x) => hasLabel(x.node, 'Device'));

  return (
    <>
      <section className="list-section" id="hazard-list" aria-labelledby="hazard-list-title" tabIndex={-1}>
        <h3 id="hazard-list-title" className="list-title">
          위험 <span className="list-count">{hazards.length}</span>
        </h3>
        {hazards.length === 0 ? (
          <p>등록된 위험이 없습니다.</p>
        ) : (
          <ol className="hazard-list">
            {hazards.map((h) => (
              <li key={h.hazard.id}>
                <HazardBadge severity={h.hazard.properties.severity} title={h.hazard.properties.title} />
                <p>
                  {h.sources.join(', ')}
                  {h.conditions.length > 0 && ` · 조건: ${[...new Set(h.conditions)].join(' / ')}`}
                  {h.combination && ' · 이 실험에서 섞여 생기는 위험'}
                </p>
                {h.hazard.properties.mitigation && <p className="hazard-list-mitigation">대응: {h.hazard.properties.mitigation}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="list-section" aria-labelledby="reagent-table-title">
        <h3 id="reagent-table-title" className="list-title">
          시약 <span className="list-count">{spec.uses.length}</span>
        </h3>
        <div className="table-scroll" role="region" aria-labelledby="reagent-table-title" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">시약</th>
                <th scope="col">역할</th>
                <th scope="col" className="num">
                  사용량
                </th>
                <th scope="col" className="num">
                  보유량
                </th>
                <th scope="col">위치</th>
              </tr>
            </thead>
            <tbody>
              {spec.uses.map((use) => {
                const node = nodes.get(use.chemicalId);
                const p = node && hasLabel(node, 'Chemical') ? node.properties : null;
                const short = p ? use.amount > p.quantity : true;
                return (
                  <tr key={use.chemicalId}>
                    <th scope="row">
                      {node ? <DetailButton node={node} onSelect={onSelect} /> : use.chemicalId}
                      {p && <span className="table-sub">{p.formula}</span>}
                    </th>
                    <td>{usageRoleLabel[use.role]}</td>
                    <td className="num">
                      {use.amount} {use.unit}
                    </td>
                    <td className="num">
                      {p ? `${p.quantity} ${p.unit}` : '미보유'}
                      {p && p.status !== 'available' && <span className="stock-chip">{inventoryStatusLabel[p.status]}</span>}
                      {p && short && <span className="stock-chip">부족</span>}
                    </td>
                    <td>{locationOf(inventory, use.chemicalId)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {equipment.length > 0 && (
        <section className="list-section" aria-labelledby="equipment-table-title">
          <h3 id="equipment-table-title" className="list-title">
            기구 <span className="list-count">{equipment.length}</span>
          </h3>
          <ul className="plain-list">
            {equipment.map(({req, node}) => (
              <li key={node.id}>
                <DetailButton node={node} onSelect={onSelect} /> {nodeLines(node).detail}
                {req.quantity ? ` · 필요 ${req.quantity}개` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}

      {devices.length > 0 && (
        <section className="list-section" aria-labelledby="device-list-title">
          <h3 id="device-list-title" className="list-title">
            장비 <span className="list-count">{devices.length}</span>
          </h3>
          <ul className="plain-list">
            {devices.map(({req, node}) => (
              <li key={node.id}>
                <DetailButton node={node} onSelect={onSelect} />
                {req.purpose ? ` · ${req.purpose}` : ''}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function GroupedList({graph, onSelect}: {graph: GraphSnapshot; onSelect(id: string): void}) {
  return (
    <>
      {groupForList(graph).map(({label, nodes}) => (
        <section key={label} className="list-section" id={label === 'Hazard' ? 'hazard-list' : undefined} aria-labelledby={`list-${label}`} tabIndex={label === 'Hazard' ? -1 : undefined}>
          <h3 id={`list-${label}`} className="list-title">
            {labelName[label]} <span className="list-count">{nodes.length}</span>
          </h3>
          <ul className="plain-list">
            {nodes.map((node) => {
              const lines = nodeLines(node);
              return (
                <li key={node.id} className="list-row">
                  {hasLabel(node, 'Hazard') ? <HazardBadge severity={node.properties.severity} /> : null}
                  <DetailButton node={node} onSelect={onSelect} />
                  {lines.detail && <span className="table-sub">{lines.detail.replace(/ · (부족|만료)$/, '')}</span>}
                  {(hasLabel(node, 'Chemical') || hasLabel(node, 'Equipment')) && node.properties.status !== 'available' && (
                    <span className="stock-chip">{inventoryStatusLabel[node.properties.status]}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}

export function ListView({
  graph,
  draft,
  inventory,
  onSelect,
}: {
  graph: GraphSnapshot;
  draft: GraphSnapshot | null;
  inventory: GraphSnapshot;
  onSelect(id: string): void;
}) {
  return (
    <div className="list-view">{draft ? <DraftTables draft={draft} inventory={inventory} onSelect={onSelect} /> : <GroupedList graph={graph} onSelect={onSelect} />}</div>
  );
}
