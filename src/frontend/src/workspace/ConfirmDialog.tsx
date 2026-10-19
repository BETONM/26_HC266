import {useState} from 'react';
import {Button, Checkbox, Dialog, DialogTrigger, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {confirmConfiguration} from '../app/chatController';
import {canConfirm, checkConfirmation} from '../domain/confirm';
import type {GraphSnapshot} from '../graph/model';
import {HazardBadge} from '../hazard/HazardBadge';

function stockText(issue: {kind: string; name: string; need: number; have: number; unit: string; expiresAt?: string}) {
  if (issue.kind === 'expired') return `${issue.name}: 유효기간(${issue.expiresAt})이 지났습니다. 새 시약으로 바꾸거나 채팅으로 빼 주세요.`;
  if (issue.kind === 'missing') return `${issue.name}: 인벤토리에 없습니다. 채팅으로 빼 주세요.`;
  return `${issue.name}: ${issue.need} ${issue.unit}가 필요한데 ${issue.have} ${issue.unit}만 있습니다. 채팅으로 양을 줄이거나 재고를 채워 주세요.`;
}

function ConfirmBody({draft, inventory, close}: {draft: GraphSnapshot; inventory: GraphSnapshot; close(): void}) {
  const check = checkConfirmation(inventory, draft);
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  if (!check) return <p>구성 중인 실험이 없습니다.</p>;
  const ready = canConfirm(check, acknowledged);
  const remaining = check.mustAcknowledge.filter((h) => !acknowledged.has(h.hazard.id)).length;

  return (
    <>
      {check.blockers.length > 0 && (
        <section className="confirm-section" aria-labelledby="confirm-blockers">
          <h3 id="confirm-blockers" className="confirm-section-title">
            확정할 수 없습니다
          </h3>
          <ul className="confirm-blockers">
            {check.blockers.map((issue) => (
              <li key={`${issue.chemicalId}-${issue.kind}`}>{stockText(issue)}</li>
            ))}
          </ul>
        </section>
      )}

      {check.mustAcknowledge.length > 0 && (
        <section className="confirm-section" aria-labelledby="confirm-acks">
          <h3 id="confirm-acks" className="confirm-section-title">
            위험을 하나씩 확인해 주세요
          </h3>
          <ul className="confirm-acks">
            {check.mustAcknowledge.map((h) => (
              <li key={h.hazard.id}>
                <HazardBadge severity={h.hazard.properties.severity} title={h.hazard.properties.title} />
                <p>
                  {h.sources.join(', ')}
                  {h.conditions.length > 0 && ` · 조건: ${[...new Set(h.conditions)].join(' / ')}`}
                </p>
                {h.hazard.properties.mitigation && <p className="confirm-mitigation">대응: {h.hazard.properties.mitigation}</p>}
                <Checkbox
                  className="checkbox"
                  isSelected={acknowledged.has(h.hazard.id)}
                  onChange={(selected) =>
                    setAcknowledged((prev) => {
                      const next = new Set(prev);
                      if (selected) next.add(h.hazard.id);
                      else next.delete(h.hazard.id);
                      return next;
                    })
                  }
                >
                  <span className="checkbox-box" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="14" height="14">
                      <path d="M3.5 8.5 6.5 11.5 12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  확인함
                </Checkbox>
              </li>
            ))}
          </ul>
        </section>
      )}

      {check.others.length > 0 && (
        <section className="confirm-section" aria-labelledby="confirm-others">
          <h3 id="confirm-others" className="confirm-section-title">
            {check.mustAcknowledge.length > 0 ? '그 밖의 위험' : '이 실험의 위험'}
          </h3>
          <ul className="confirm-others">
            {check.others.map((h) => (
              <li key={h.hazard.id}>
                <HazardBadge severity={h.hazard.properties.severity} title={h.hazard.properties.title} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="confirm-status" role="status">
        {check.blockers.length > 0
          ? '재고 문제를 먼저 해결해야 합니다.'
          : remaining > 0
            ? `확인할 위험이 ${remaining}개 남았습니다.`
            : '확정하면 지금 구성을 고정하고 실행 계획으로 넘어갑니다. 이후 구성을 바꾸려면 새 초안을 만들어야 합니다.'}
      </p>

      <div className="dialog-actions">
        <Button className="secondary-button" onPress={close}>
          취소
        </Button>
        <Button
          className="primary-button"
          isDisabled={!ready}
          onPress={() => {
            confirmConfiguration([...acknowledged]);
            close();
          }}
        >
          구성 확정
        </Button>
      </div>
    </>
  );
}

/** '구성 확정' 단추와 대화상자. 재고 문제가 있으면 막고, high·critical 위험은 하나씩 확인해야 연다. */
export function ConfirmDialog({draft, inventory}: {draft: GraphSnapshot; inventory: GraphSnapshot | null}) {
  return (
    <DialogTrigger>
      <Button className="primary-button" isDisabled={!inventory}>
        구성 확정
      </Button>
      <ModalOverlay className="modal-overlay" isDismissable>
        <Modal className="modal">
          <Dialog className="dialog">
            {({close}) => (
              <>
                <Heading slot="title" className="dialog-title">
                  구성 확정
                </Heading>
                {inventory && <ConfirmBody draft={draft} inventory={inventory} close={close} />}
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
