import {configWarnings} from '../adapters';

/** 잘못된 어댑터 설정. 목업으로 조용히 돌리지 않고 화면에 남긴다. 실제 장비라 믿었는데 목업이면 실험 직전에 위험하다. */
export function ConfigWarnings() {
  if (configWarnings.length === 0) return null;
  return (
    <ul className="config-warnings" aria-label="설정 경고">
      {configWarnings.map((warning) => (
        <li key={warning}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 7.25v4M8 4.75v.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>{' '}
          {warning}
        </li>
      ))}
    </ul>
  );
}
