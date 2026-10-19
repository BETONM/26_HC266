// 목업 LLM의 의도 분류. 실제 LLM이 붙기 전까지 키워드 규칙으로 나눈다.
// 규칙끼리 겹치면 위에 있는 것이 이긴다. 상태를 바꾸는 의도일수록 조건을 좁게 잡았다.
// 애매하면 'unknown'으로 떨어뜨린다. 아는 척 초안을 바꾸는 쪽이 실험 직전에는 더 위험하다.

export type Intent =
  | {kind: 'new-draft'}
  | {kind: 'plan-edit'}
  | {kind: 'run-status'}
  | {kind: 'telemetry'}
  | {kind: 'report-summary'}
  | {kind: 'report-why'}
  | {kind: 'modify'; op: 'add' | 'remove' | 'set'; amount?: number; unit?: string; nameText: string}
  | {kind: 'compose'}
  | {kind: 'hazard'}
  | {kind: 'explore'}
  | {kind: 'inventory'}
  | {kind: 'unknown'};

const AMOUNT = /(\d+(?:\.\d+)?)\s*(mL|ml|ML|L|ℓ|밀리리터|리터)(?![a-zA-Z])/;

function readAmount(text: string): {amount: number; unit: string} | null {
  const match = AMOUNT.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2]!;
  // 내부 단위는 mL로 맞춘다.
  if (unit === 'L' || unit === 'ℓ' || unit === '리터') return {amount: value * 1000, unit: 'mL'};
  return {amount: value, unit: 'mL'};
}

export type IntentContext = {
  /** 글에 인벤토리 항목(시약·기구·장비) 이름이 나왔는가. */
  mentionsInventory: boolean;
  /** 실행 계획이 있는가. 있으면 '빼 줘', '뒤로' 같은 말은 구성보다 계획을 고치는 말로 읽는다. */
  hasPlan?: boolean;
  /** 실행을 시작했는가. 있으면 '지금 뭐 하는 중이야?'를 진행 질문으로 읽는다. */
  hasRun?: boolean;
  /** 결과 보고서를 띄웠는가. 있으면 '요약해 줘', '왜 ~했어?'를 보고서 질문으로 읽는다. */
  hasReport?: boolean;
};

export function classifyIntent(text: string, context: IntentContext): Intent {
  const t = text.trim();
  if (t.length === 0) return {kind: 'unknown'};

  if (/새\s*초안/.test(t)) return {kind: 'new-draft'};

  if (/(실행\s*계획|계획을|계획\s*수정|순서를|맨\s*(뒤|앞)|되돌려)/.test(t)) return {kind: 'plan-edit'};
  // 계획이 생긴 뒤의 옮기기·빼기는 계획 수정이다. '반응 비커 교반 삭제'처럼 기구 이름이 들어 있어도 그렇다.
  // 구성은 이미 확정되어 바꿀 수 없으니, 시약 이름을 빼 달라는 말도 계획 쪽에서 '찾지 못함'으로 답하는 편이 낫다.
  if (context.hasPlan && /(뒤로|앞으로|뒤에|앞에|다음으로|처음으로|끝으로|마지막으로|되돌리|원래대로|순서|삭제|빼|없애|지워|제거)/.test(t)) {
    return {kind: 'plan-edit'};
  }

  // 보고서 질문. 구성 변경('추가')이나 진행 질문보다 먼저 본다. '왜 요오드를 추가했어?'는 바꿔 달라는 말이 아니다.
  if (context.hasReport && /(왜|이유|원인|어째서|무슨\s*근거)/.test(t)) return {kind: 'report-why'};
  if (context.hasReport && /(요약|정리|결론|결과\s*(는|가|를)?\s*(어때|어땠|알려|말해|뭐)|어땠어|어떻게\s*됐)/.test(t)) {
    return {kind: 'report-summary'};
  }

  // 실행 중의 질문. 인벤토리('얼마나')나 위험보다 먼저 본다. 지금 값과 진행을 묻는 말이기 때문이다.
  if (context.hasRun && /(뭐\s*(하는|하고)|어디까지|진행\s*(상황|률|도)|몇\s*번째|얼마나\s*(남|했|됐|진행)|지금\s*(단계|동작))/.test(t)) {
    return {kind: 'run-status'};
  }
  if (context.hasRun && /(ph|피에이치|전도도|\bec\b|tds|온도|열화상|센서\s*값|측정값|수치)/i.test(t) && !/(빼|삭제|추가)/.test(t)) {
    return {kind: 'telemetry'};
  }

  const amount = readAmount(t);
  // 양을 숫자로 말한 부분 앞까지를 이름으로 본다. '증류수 10 mL 추가' → '증류수'.
  const nameText = amount ? t.slice(0, AMOUNT.exec(t)!.index).trim() : t;
  if (/(빼|제외|없애|삭제)/.test(t) && context.mentionsInventory) return {kind: 'modify', op: 'remove', nameText: t};
  if (/(추가|넣어|더\s*넣|더해)/.test(t) && (context.mentionsInventory || amount)) {
    return {kind: 'modify', op: 'add', nameText, ...amount};
  }
  if (/(바꿔|변경|늘려|줄여|맞춰|로\s*해)/.test(t) && (context.mentionsInventory || amount)) {
    return {kind: 'modify', op: 'set', nameText, ...amount};
  }

  if (/(하고\s*싶|해\s*보고\s*싶|할래|진행해|구성해|준비해|시작하)/.test(t) && /(실험|반응|적정|앙금|침전)/.test(t)) {
    return {kind: 'compose'};
  }

  if (/(위험|주의|섞어도|섞으면|안전|조심|유해)/.test(t)) return {kind: 'hazard'};

  if (/(어떤\s*실험|무슨\s*실험|실험\s*(목록|종류|뭐)|할\s*수\s*있는\s*실험)/.test(t) || (/실험/.test(t) && /할\s*수\s*있/.test(t))) {
    return {kind: 'explore'};
  }

  if (/(뭐\s*있|재고|남은|남았|얼마나|어디|보유|위치|몇\s*개|있어\?|있나)/.test(t) || context.mentionsInventory) {
    return {kind: 'inventory'};
  }

  return {kind: 'unknown'};
}
