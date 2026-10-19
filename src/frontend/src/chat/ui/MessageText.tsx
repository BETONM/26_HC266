import {HazardBadge} from '../../hazard/HazardBadge';
import type {Severity} from '../../graph/model';

// 답은 평범한 글이다. 빈 줄로 문단을 나누고, '- '로 시작하는 줄 묶음은 목록으로 그린다.
// 줄 앞의 '[매우 높음]' 같은 표시는 위험 배지로 바꾼다. 위험은 글 속에서도 같은 모양으로 읽혀야 한다.

export type Block = {kind: 'paragraph'; lines: string[]} | {kind: 'list'; items: string[]};

export function toBlocks(text: string): Block[] {
  // 스트리밍 중에는 목록 항목의 '-'만 먼저 도착한다. 그 꼬리는 다음 글자가 올 때까지 그리지 않는다.
  const settled = text.replace(/\n-$/, '');
  const blocks: Block[] = [];
  for (const chunk of settled.split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((line) => line.length > 0);
    let paragraph: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (paragraph.length > 0) blocks.push({kind: 'paragraph', lines: paragraph});
      if (list.length > 0) blocks.push({kind: 'list', items: list});
      paragraph = [];
      list = [];
    };
    for (const line of lines) {
      if (line.startsWith('- ')) list.push(line.slice(2));
      else {
        if (list.length > 0) flush();
        paragraph.push(line);
      }
    }
    flush();
  }
  return blocks;
}

const SEVERITY_BY_LABEL: Record<string, Severity> = {'매우 높음': 'critical', 높음: 'high', 보통: 'medium', 낮음: 'low'};
const MARKER = /^\[(매우 높음|높음|보통|낮음)\]\s*/;

function Line({text}: {text: string}) {
  const match = MARKER.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <HazardBadge severity={SEVERITY_BY_LABEL[match[1]!]!} /> {text.slice(match[0].length)}
    </>
  );
}

export function MessageText({text}: {text: string}) {
  return (
    <div className="message-text">
      {toBlocks(text).map((block, i) =>
        block.kind === 'list' ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>
                <Line text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            {block.lines.map((line, j) => (
              <span key={j} className="message-line">
                <Line text={line} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
