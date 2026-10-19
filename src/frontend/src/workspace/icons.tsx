/** 잠긴 것을 흐림만이 아니라 모양으로도 알린다. 레일의 잠긴 단계와 실행을 시작한 계획에 쓴다. */
export function LockIcon({className = 'lock-icon'}: {className?: string}) {
  return (
    <svg className={className} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <rect x="3.25" y="7" width="9.5" height="6.75" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** 펼침 표시. 펼치면 CSS(.plan-basis[data-expanded])가 90도 돌린다. */
export function Chevron() {
  return (
    <svg className="plan-basis-chevron" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
