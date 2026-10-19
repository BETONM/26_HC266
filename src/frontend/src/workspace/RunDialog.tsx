import {useState} from 'react';
import {Button, Dialog, DialogTrigger, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {startRun} from '../app/runController';
import type {ConfirmedConfig} from '../app/store';
import {currentVersion, planSteps, type ExecutionPlan} from '../domain/plan';
import {hasLabel, severityRank} from '../graph/model';
import {HazardBadge, HazardSummary} from '../hazard/HazardBadge';

/**
 * '실행 시작' 단추와 확인 대화상자. 시작하면 로봇이 움직이고 계획을 더 고칠 수 없어서 한 번 더 묻는다.
 * 뒤의 위험 카드는 막에 가려지므로, 높음 이상의 위험은 대화상자 안에 다시 적는다. Esc나 바깥을 누르면 시작하지 않는다.
 */
export function RunDialog({
  plan,
  confirmed,
  isDisabled,
}: {
  plan: ExecutionPlan;
  confirmed: ConfirmedConfig;
  isDisabled: boolean;
}) {
  const count = planSteps(currentVersion(plan).groups).length;
  const severe = confirmed.graph.nodes
    .filter((n) => hasLabel(n, 'Hazard'))
    .filter((n) => n.properties.severity === 'high' || n.properties.severity === 'critical')
    .sort((a, b) => severityRank(b.properties.severity) - severityRank(a.properties.severity));
  const acknowledged = confirmed.acknowledgedHazards.length;

  return (
    <DialogTrigger>
      <Button className="primary-button side-card-action" isDisabled={isDisabled}>
        실행 시작
      </Button>
      <ModalOverlay className="modal-overlay" isDismissable>
        <Modal className="modal">
          <Dialog
            className="dialog"
            role="alertdialog"
            aria-describedby={
              severe.length > 0 ? 'run-dialog-hazards run-dialog-consequence' : 'run-dialog-consequence'
            }
          >
            {({close}) => (
              <>
                <Heading slot="title" className="dialog-title">
                  실행을 시작할까요?
                </Heading>
                <HazardSummary graph={confirmed.graph} />
                {severe.length > 0 && (
                  <ul id="run-dialog-hazards" className="confirm-others" aria-label="높음 이상의 위험">
                    {severe.map((h) => (
                      <li key={h.id}>
                        <HazardBadge severity={h.properties.severity} title={h.properties.title} />
                      </li>
                    ))}
                  </ul>
                )}
                {acknowledged > 0 && (
                  <p className="confirm-status">구성을 확정할 때 이 위험 {acknowledged}건을 하나씩 확인했습니다.</p>
                )}
                <p>
                  <strong>{confirmed.name}</strong> · 계획 v{plan.version} · {count}동작
                </p>
                <p id="run-dialog-consequence" className="confirm-status">
                  시작하면 로봇이 이 계획대로 움직이고, 계획을 더 고칠 수 없습니다. 시작한 계획 버전은 실행 기록에
                  남습니다.
                </p>
                <StartActions close={close} />
              </>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

/** 로봇 서버가 시작을 받을 때까지 기다린다. 받지 못하면 대화상자에 이유를 남기고 계획은 그대로 둔다. */
function StartActions({close}: {close(): void}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error && (
        <p className="message-error" role="alert">
          실행을 시작하지 못했습니다. {error}
        </p>
      )}
      <div className="dialog-actions">
        <Button className="secondary-button" onPress={close}>
          취소
        </Button>
        <Button
          className="primary-button"
          isPending={pending}
          onPress={async () => {
            setPending(true);
            setError(null);
            const result = await startRun();
            setPending(false);
            if (result.ok) close();
            else setError(result.error);
          }}
        >
          {pending ? '시작하는 중' : '실행 시작'}
        </Button>
      </div>
    </>
  );
}
