import {Button} from 'react-aria-components';
import {sendMessage} from '../../app/chatController';

export const EXAMPLE_PROMPTS = [
  '어떤 실험 할 수 있어?',
  '색 변화 실험 하고 싶어',
  '요오드산 칼륨 얼마나 남았어? 어디 있어?',
  '재고 보여 줘',
];

/** 빈 대화에서 무엇을 물을 수 있는지 보여 준다. 누르면 바로 보낸다. */
export function ExampleChips() {
  return (
    <div className="example-chips" role="group" aria-label="예시 질문">
      {EXAMPLE_PROMPTS.map((prompt) => (
        <Button key={prompt} className="chip" onPress={() => sendMessage(prompt)}>
          {prompt}
        </Button>
      ))}
    </div>
  );
}
