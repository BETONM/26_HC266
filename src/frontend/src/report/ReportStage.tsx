import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {Button, Tab, TabList, TabPanel, Tabs, ToggleButton, ToggleButtonGroup, type Key} from 'react-aria-components';
import {reportSource} from '../adapters';
import {useAppStore} from '../app/store';
import {agentStageLabel, formatMetric, mmss, reportCsv, reportCsvName, type RunReport} from '../domain/report';
import {isRunActive} from '../domain/run';
import {HazardBadge} from '../hazard/HazardBadge';
import {EventLegend, MetricChart, MetricLegend, OverlayChart} from './ReportChart';
import './report.css';

type Load = {key: string; status: 'ready'; report: RunReport} | {key: string; status: 'error'; message: string};

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 목차 이동. 해시를 바꾸지 않는다(뒤로 가기가 화면 전환에 쓰인다). 이동한 절의 제목으로 포커스를 옮긴다. */
function jumpTo(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start'});
  target.focus({preventScroll: true});
}

function Icon({name}: {name: 'check' | 'stop' | 'download' | 'print' | 'agent'}) {
  const d = {
    check: 'm5 12 4 4L19 6',
    stop: 'M7 7h10v10H7z',
    download: 'M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4',
    print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
    agent: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
  }[name];
  return (
    <svg className="report-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

function Section({
  id,
  title,
  aside,
  className,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={['report-section', className].filter(Boolean).join(' ')} aria-labelledby={`${id}-title`}>
      <header className="report-section-head">
        <h3 id={`${id}-title`} className="report-section-title" tabIndex={-1}>
          {title}
        </h3>
        {aside && <span className="report-pill">{aside}</span>}
      </header>
      {children}
    </section>
  );
}

/** 용액 대표색으로 칠한 비커. 색은 '찍힌 용액'의 재구성이라 데이터에서 온다. */
function Vessel({color}: {color: string}) {
  const id = useId();
  return (
    <svg viewBox="0 0 140 112" className="report-vessel" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.7" />
          <stop offset="55%" stopColor={color} />
          <stop offset="100%" stopColor={color} stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <path className="report-vessel-glass" d="M31 19v71q0 8 8 8h62q8 0 8-8V19" />
      <path d="M33 52q37 6 74 0v37q0 7-7 7H40q-7 0-7-7Z" fill={`url(#${id})`} />
      <ellipse cx="70" cy="52" rx="37" ry="4" fill={color} />
      <path className="report-vessel-marks" d="M29 18h82M98 33h9m-9 13h9m-9 13h9m-9 13h9m-9 13h9" />
    </svg>
  );
}

function sourceLabel(report: RunReport) {
  if (report.meta.basis === 'fixture') return '예시 데이터 · 이전 레포의 발표용 기록(실측 아님)';
  return report.meta.source === 'mock' ? '목업 실행 기록' : '실제 실행 기록';
}

function ReportDocument({report, onBack}: {report: RunReport; onBack?: () => void}) {
  const [metricKey, setMetricKey] = useState<Key>(report.metrics[0]?.key ?? '');
  const [downloaded, setDownloaded] = useState('');
  const logRef = useRef<HTMLDetailsElement>(null);
  const metric = report.metrics.find((m) => m.key === metricKey) ?? report.metrics[0];

  useEffect(() => {
    if (!downloaded) return;
    const timer = window.setTimeout(() => setDownloaded(''), 4500);
    return () => window.clearTimeout(timer);
  }, [downloaded]);

  // 인쇄하는 동안만 실행 로그를 펼친다. 끝나면 사용자가 둔 대로 되돌린다.
  useEffect(() => {
    let wasOpen = false;
    const before = () => {
      if (!logRef.current) return;
      wasOpen = logRef.current.open;
      logRef.current.open = true;
    };
    const after = () => {
      if (logRef.current) logRef.current.open = wasOpen;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([reportCsv(report)], {type: 'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = reportCsvName(report);
    document.body.appendChild(link);
    link.click();
    link.remove();
    // 바로 지우면 일부 브라우저에서 다운로드가 시작되기 전에 주소가 사라진다.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setDownloaded(`센서 데이터 CSV(${reportCsvName(report)})를 내려받았습니다.`);
  };

  const toc = [
    {id: 'report-summary', label: '요약'},
    report.materials.length > 0 && {id: 'report-materials', label: '재료'},
    report.reactions && {id: 'report-reaction', label: '반응식'},
    report.procedure && {id: 'report-procedure', label: '절차'},
    report.metrics.length > 0 && {id: 'report-sensors', label: '센서'},
    report.colorFrames && {id: 'report-color', label: '색 변화'},
    report.agent && {id: 'report-agent', label: '에이전트 판단'},
    {id: 'report-conclusion', label: '결론'},
    {id: 'report-history', label: '타임라인'},
  ].filter((x): x is {id: string; label: string} => Boolean(x));

  const totalCorrections = report.outcome.corrections;
  return (
    <>
      <header className="report-head">
        <div className="report-head-text">
          <p className="plan-eyebrow">
            {report.meta.id} · <span className="report-source">{sourceLabel(report)}</span>
          </p>
          <h2 id="stage-title-report" className="stage-title" tabIndex={-1}>
            결과 보고서
          </h2>
        </div>
        <div className="report-actions">
          <Button className="secondary-button" onPress={downloadCsv} isDisabled={report.readings.length === 0}>
            <Icon name="download" />
            센서 데이터 CSV
          </Button>
          <Button className="primary-button" onPress={() => window.print()}>
            <Icon name="print" />
            PDF 저장 / 인쇄
          </Button>
        </div>
      </header>

      <nav className="report-toc" aria-label="보고서 목차">
        <ul>
          {toc.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}-title`}
                onClick={(event) => {
                  event.preventDefault();
                  jumpTo(`${item.id}-title`);
                }}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section className="report-summary" aria-labelledby="report-summary-title">
        <div className="report-summary-main">
          <p className="report-outcome" data-achieved={report.outcome.achieved || undefined}>
            <Icon name={report.outcome.achieved ? 'check' : 'stop'} />
            {report.outcome.label}
            <span aria-hidden="true">·</span>
            자율 보정 {totalCorrections}회
          </p>
          <h3 id="report-summary-title" className="report-title" tabIndex={-1}>
            {report.meta.title}
          </h3>
          <p className="report-headline">
            <strong>{report.summary.headline}</strong> {report.summary.body}
          </p>
          <dl className="report-facts">
            {report.summary.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="report-outcome-detail">{report.outcome.detail}</p>
      </section>

      <ul className="report-kpis" aria-label="핵심 지표">
        {report.kpis.map((k) => (
          <li key={k.label}>
            <span className="report-kpi-label">{k.label}</span>
            <span className="report-kpi-value">
              <strong>{k.value}</strong>
              {k.unit && <span>{k.unit}</span>}
              {k.badge && (
                <span className="report-badge" data-tone={k.badge.tone}>
                  {k.badge.text}
                </span>
              )}
            </span>
            {k.change && <small>{k.change}</small>}
          </li>
        ))}
      </ul>

      {report.materials.length > 0 && (
        <Section
          id="report-materials"
          title="사용한 재료"
          aside={`시약 ${report.materials.length}종`}
          className="report-materials"
        >
          <div className="report-table-scroll">
            <table className="report-table">
              <caption className="sr-only">
                사용한 시약의 화학식, CAS 번호, 상, 농도, 투입량과 위험(심각도와 문구)
              </caption>
              <thead>
                <tr>
                  <th scope="col">구분</th>
                  <th scope="col">시약</th>
                  <th scope="col">화학식</th>
                  <th scope="col">CAS</th>
                  <th scope="col">상</th>
                  <th scope="col">농도</th>
                  <th scope="col">투입량</th>
                  <th scope="col">위험</th>
                </tr>
              </thead>
              <tbody>
                {report.materials.map((m) => (
                  <tr key={`${m.order}-${m.cas}`}>
                    <td className="report-order">
                      <span className="mono">{m.order}</span>
                      <small>{m.role}</small>
                    </td>
                    <td>
                      <strong>{m.name}</strong>
                      {m.english && <small>{m.english}</small>}
                    </td>
                    <td className="report-formula">{m.formula}</td>
                    <td className="mono">{m.cas}</td>
                    <td>{m.phase}</td>
                    <td className="report-figure">{m.concentration}</td>
                    <td className="report-figure">
                      {m.amount}
                      {m.amountNote && <small>{m.amountNote}</small>}
                    </td>
                    <td>
                      {m.hazards.length === 0 ? (
                        <span className="report-muted">분류된 위험 없음</span>
                      ) : (
                        <ul className="report-hazards">
                          {m.hazards.map((h) => (
                            <li key={h.text}>
                              <HazardBadge severity={h.severity} />
                              <span>{h.text}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.materialNotes.length > 0 && (
            <ul className="report-notes">
              {report.materialNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {(report.reactions || report.procedure) && (
        <div className="report-method">
          {report.reactions && (
            <Section id="report-reaction" title="반응식" aside={`${report.reactions.steps.length}단계`}>
              <ol className="report-reactions">
                {report.reactions.steps.map((r) => (
                  <li key={r.index}>
                    <p className="report-reaction-meta">
                      <b>{r.index}</b> {r.title} <span>{r.tempo}</span>
                    </p>
                    <p className="report-reaction-formula">{r.formula}</p>
                    <p>{r.text}</p>
                  </li>
                ))}
              </ol>
              <p className="report-callout">{report.reactions.conclusion}</p>
            </Section>
          )}
          {report.procedure && (
            <Section id="report-procedure" title="절차" aside={`${report.procedure.steps.length}단계`}>
              <ol className="report-procedure">
                {report.procedure.steps.map((p) => (
                  <li key={p.no}>
                    <span className="mono report-procedure-no">{p.no}</span>
                    <div>
                      <p className="report-procedure-title">
                        <b>{p.title}</b>
                        {p.meta && <span>{p.meta}</span>}
                      </p>
                      <p>{p.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              {report.procedure.note && <p className="report-muted">{report.procedure.note}</p>}
            </Section>
          )}
        </div>
      )}

      {report.metrics.length > 0 && metric && (
        <Section
          id="report-sensors"
          title="센서가 기록한 반응"
          aside={`${report.meta.interval}초 간격 · ${report.readings.length}개`}
        >
          <Tabs className="report-tabs" selectedKey={metric.key} onSelectionChange={setMetricKey}>
            <div className="report-tabs-bar">
              <TabList className="report-tab-list" aria-label="센서 지표">
                {report.metrics.map((m) => (
                  <Tab key={m.key} id={m.key} className="report-tab">
                    {m.label}
                  </Tab>
                ))}
              </TabList>
              <p className="report-chart-value">
                마지막 값{' '}
                <strong>
                  {formatMetric(
                    report.readings.findLast((r) => typeof r.values[metric.key] === 'number')?.values[metric.key],
                    metric,
                  )}
                </strong>{' '}
                {metric.unit === metric.label ? '' : metric.unit}
              </p>
            </div>
            {report.metrics.map((m) => (
              <TabPanel key={m.key} id={m.key} className="report-tab-panel">
                <MetricChart report={report} metric={m} />
              </TabPanel>
            ))}
          </Tabs>
          <div className="print-only">
            <OverlayChart report={report} />
          </div>
          <MetricLegend report={report} />
          <EventLegend report={report} />
          <div className="report-interpretation screen-only">
            <span>관찰 해석 · {metric.label}</span>
            <p aria-live="polite">{metric.description}</p>
          </div>
          <div className="report-interpretation-all print-only">
            {report.metrics.map((m) => (
              <p key={m.key}>
                <b>{m.label}</b> {m.description}
              </p>
            ))}
          </div>
          {report.secondary.length > 0 && (
            <dl className="report-secondary">
              {report.secondary.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>
                    {s.value}
                    {s.note && <small>{s.note}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </Section>
      )}

      {report.colorFrames && (
        <Section id="report-color" title={report.colorFrames.title} aside="색 변화">
          <ol className="report-color-sequence">
            {report.colorFrames.frames.map((f) => (
              <li key={f.at}>
                <figure>
                  <div className="report-color-frame">
                    <span className="mono">{mmss(f.at)}</span>
                    <Vessel color={f.color} />
                    <b>{f.coverage}%</b>
                  </div>
                  <figcaption>
                    <strong>{f.label}</strong>
                    <span>{f.detail}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ol>
          <p className="report-muted">{report.colorFrames.caption}</p>
          <p className="report-callout">
            <strong>{report.colorFrames.conclusion.title}</strong> {report.colorFrames.conclusion.text}
          </p>
        </Section>
      )}

      {report.agent && (
        <Section id="report-agent" title={report.agent.title} aside="에이전트 판단" className="report-agent">
          <p className="report-agent-outcome">
            <Icon name="agent" />
            <span>{report.agent.outcome.label}</span>
            <span className="report-muted">
              복구 <span className="mono">{report.agent.outcome.duration}</span>
            </span>
          </p>
          <p>{report.agent.intro}</p>
          <ol className="report-agent-steps">
            {report.agent.steps.map((step, i) => (
              <li key={`${step.stage}-${step.at}`} data-stage={step.stage}>
                <span className="report-agent-no mono" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="report-agent-meta">
                    <b>{agentStageLabel[step.stage]}</b> <time className="mono">{mmss(step.at)}</time>
                  </p>
                  <p className="report-agent-title">{step.title}</p>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="report-boundary" data-within={report.agent.boundary.within || undefined}>
            <Icon name={report.agent.boundary.within ? 'check' : 'stop'} />
            {report.agent.boundary.within ? '허용 범위 안에서 실행' : '허용 범위를 벗어남'} ·{' '}
            {report.agent.boundary.text}
          </p>
        </Section>
      )}

      <Section
        id="report-conclusion"
        title={`해석과 후속 제안 · ${report.conclusion.title}`}
        className="report-conclusion"
      >
        {report.conclusion.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </Section>

      <Section
        id="report-history"
        title="실험은 이렇게 진행되었습니다"
        aside={`${report.meta.startedAt} → ${report.meta.endedAt}`}
      >
        <ol className="report-timeline">
          {report.timeline.map((t, i) => (
            <li key={`${t.at}-${i}`} data-status={t.status}>
              <time className="mono">{mmss(t.at)}</time>
              <div>
                <p className="report-timeline-title">
                  {t.title}
                  {t.status === 'agent' && <span className="report-badge">에이전트</span>}
                  {t.status === 'stopped' && (
                    <span className="report-badge" data-tone="warn">
                      비상 정지
                    </span>
                  )}
                </p>
                <p>{t.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <details className="report-log" id="report-log" ref={logRef}>
          <summary>
            <svg className="report-disclosure" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </svg>
            실행 로그 <span className="report-muted">{report.agentLog.length}건 · 판단 근거와 실행 결과</span>
          </summary>
          <div className="report-table-scroll">
            <table className="report-table report-log-table">
              <caption className="sr-only">경과 시간별 실행 기록</caption>
              <thead>
                <tr>
                  <th scope="col">경과 시간</th>
                  <th scope="col">작업</th>
                  <th scope="col">기록</th>
                </tr>
              </thead>
              <tbody>
                {report.agentLog.map((row, i) => (
                  <tr key={`${row.at}-${i}`}>
                    <td className="mono">{mmss(row.at)}</td>
                    <td className="mono">{row.op}</td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Section>

      <footer className="report-foot">
        {onBack && (
          <Button className="text-button screen-only" onPress={onBack}>
            모니터링으로 돌아가기
          </Button>
        )}
        <p>
          ChemBot Lab · {report.meta.id} · {sourceLabel(report)}
        </p>
        <p className="report-download-status" role="status">
          {downloaded}
        </p>
      </footer>
    </>
  );
}

/** 실행이 끝난 뒤의 보고서. 이번 실행의 기록에서 만든 것과 예시(fixture)를 오간다. 둘은 한 화면에 섞지 않는다. */
export function ReportStage() {
  const run = useAppStore((s) => s.run);
  const view = useAppStore((s) => s.reportView);
  const [retry, setRetry] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const ended = run !== null && !isRunActive(run.state);
  const canExample = typeof reportSource.getExample === 'function';
  const shown = view === 'example' && canExample ? 'example' : 'run';
  const key = shown === 'example' ? `example-${retry}` : `${run?.id}-${run?.endedAt}-${retry}`;

  // key가 바뀔 때만 다시 만든다(보기 전환, 다른 실행, 다시 시도). 끝난 실행의 기록은 더 바뀌지 않으므로
  // 입력은 그때의 저장소에서 읽는다.
  useEffect(() => {
    const saved = useAppStore.getState();
    const record = saved.run;
    const example = key.startsWith('example-');
    if (!example && (!record || isRunActive(record.state))) return;
    const controller = new AbortController();
    const confirmed = saved.confirmed && {name: saved.confirmed.name, graph: saved.confirmed.graph};
    const request = example
      ? reportSource.getExample!(controller.signal)
      : reportSource.getReport(
          {runId: record!.id, local: {run: record!, confirmed, plan: saved.plan}},
          controller.signal,
        );
    request.then(
      (report) => {
        if (controller.signal.aborted) return;
        setLoad({key, status: 'ready', report});
        useAppStore.setState({reportShown: report});
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          key,
          status: 'error',
          message: error instanceof Error ? error.message : '보고서를 만들지 못했습니다.',
        });
      },
    );
    return () => controller.abort();
  }, [key]);

  if (shown === 'run' && (!run || !ended)) {
    return <p className="stage-placeholder">보고서는 실행이 끝나면(완료 또는 비상 정지) 열립니다.</p>;
  }
  const current = load?.key === key ? load : null;
  return (
    <article className="report" aria-labelledby="stage-title-report">
      {canExample && (
        <ToggleButtonGroup
          className="report-view"
          aria-label="보고서"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[shown]}
          onSelectionChange={(keys: Set<Key>) => {
            const [next] = keys;
            if (next) useAppStore.setState({reportView: next as 'run' | 'example'});
          }}
        >
          <ToggleButton id="run" className="pane-switch-button" isDisabled={!run || !ended}>
            이번 실행
          </ToggleButton>
          <ToggleButton id="example" className="pane-switch-button">
            예시 보고서
          </ToggleButton>
        </ToggleButtonGroup>
      )}
      {!current ? (
        <p className="report-loading" role="status">
          보고서를 만드는 중
        </p>
      ) : current.status === 'error' ? (
        <div className="report-error" role="alert">
          <p>보고서를 만들지 못했습니다. {current.message}</p>
          <Button className="secondary-button" onPress={() => setRetry((n) => n + 1)}>
            다시 시도
          </Button>
        </div>
      ) : (
        <ReportDocument
          key={key}
          report={current.report}
          onBack={run ? () => useAppStore.setState({stage: 'monitoring'}) : undefined}
        />
      )}
    </article>
  );
}
