// 조사 고르기. 목업 답이 '요오드산 칼륨 수용액은(는)'처럼 읽히지 않게 받침을 본다.

const DIGIT_HAS_FINAL = [true, true, false, true, false, false, true, true, true, false]; // 영 일 이 삼 사 오 육 칠 팔 구

function hasFinalConsonant(input: string): boolean | null {
  // 괄호 속 덧붙임은 읽지 않는다. '수용액(KIO₃, 0.04 M)은'처럼 조사는 괄호 앞 낱말을 따른다.
  let word = input;
  while (/\([^()]*\)\s*$/.test(word)) word = word.replace(/\s*\([^()]*\)\s*$/, '');
  for (let i = word.length - 1; i >= 0; i -= 1) {
    const code = word.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
    if (code >= 0x30 && code <= 0x39) return DIGIT_HAS_FINAL[code - 0x30]!;
    // 괄호·첨자·공백 같은 글자는 건너뛰고 앞 글자를 본다.
    if (/[\p{L}]/u.test(word[i]!)) return null;
  }
  return null;
}

const PAIRS = {
  '은/는': ['은', '는'],
  '이/가': ['이', '가'],
  '을/를': ['을', '를'],
  '과/와': ['과', '와'],
  '으로/로': ['으로', '로'],
} as const;

/** 단어에 맞는 조사를 붙인다. 판단할 수 없으면 '은(는)' 꼴로 둘 다 적는다. */
export function withParticle(word: string, pair: keyof typeof PAIRS): string {
  const [withFinal, withoutFinal] = PAIRS[pair];
  const final = hasFinalConsonant(word);
  if (final === null) return `${word}${withFinal}(${withoutFinal})`;
  // '으로/로'는 ㄹ 받침 뒤에서도 '로'를 쓴다.
  // 숫자는 읽는 소리로 본다: 1(일)·7(칠)·8(팔)은 ㄹ 받침이라 'v1로'.
  if (pair === '으로/로' && final) {
    const code = word.charCodeAt(word.length - 1);
    if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8) return `${word}${withoutFinal}`;
    if (/[178]$/.test(word)) return `${word}${withoutFinal}`;
  }
  return `${word}${final ? withFinal : withoutFinal}`;
}

/** 소수점 아래 0을 지운 수 표기. */
export function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
