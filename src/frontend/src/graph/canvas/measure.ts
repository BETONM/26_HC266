// 이름표 폭을 글자 수로 어림한다. 엔진이 이름표끼리 겹치는지 매 프레임 따지는데, DOM에서 글자를 재면
// 그 계산이 렌더에 묶이고 테스트도 어려워진다. 한글은 1em, 라틴·숫자는 0.58em 정도다.

const WIDE = /[ᄀ-ᇿ㄰-㆏가-힣一-鿿]/;

export function textWidth(text: string, fontPx: number): number {
  let em = 0;
  for (const ch of text) {
    if (WIDE.test(ch)) em += 1;
    else if (ch === ' ') em += 0.3;
    else em += 0.58;
  }
  return em * fontPx;
}

/** 너무 긴 이름은 줄여서 그린다. 전체 이름은 aria-label과 상세 패널에 있다. */
export function truncate(text: string, fontPx: number, maxWidth: number): string {
  if (textWidth(text, fontPx) <= maxWidth) return text;
  let out = '';
  for (const ch of text) {
    if (textWidth(`${out}${ch}…`, fontPx) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}

export type NodeLines = {tag: string; name: string; detail?: string};
