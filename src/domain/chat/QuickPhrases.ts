/**
 * 채팅창 아래에 뜨는 빠른 문구. 지금 상황에서 한 번에 보낼 만한 말이다.
 *
 * 서버가 고르는 이유는 위젯을 단계·직업으로부터 떼어놓기 위해서다.
 * 밤에 마피아에게 "이 사람 칩시다"를 내미는 판단이 위젯에 있으면
 * chat.html이 마피아가 무엇인지 알아야 한다.
 *
 * ChatService에 있었다. 그 파일은 "만들고 저장하고 배달한다"가 전부인데
 * 여기 문구 일곱 묶음이 얹혀 있어서, 문구 한 줄을 다듬는 일이 배달 코드가
 * 든 파일을 건드리는 일이 됐다. 문구는 기획이 가장 자주 손대는 것이고
 * 배달은 가장 건드리기 무서운 것이라, 수정 빈도가 정반대인 둘이 한 파일에
 * 있으면 손대는 쪽이 늘 조심해야 한다.
 *
 * domain/chat에 두는 근거는 타입이다. 이 판단의 재료는 ChatContext 하나뿐이고
 * 그 타입은 ChatPermission이 준다 — ZEP도 위젯도 방도 모른다. 채널 표와
 * 같은 층의 순수 함수라 테스트도 같은 방식으로 쓴다.
 *
 * 이모지·스티커를 붙일 자리도 여기다. 문구 배열이 { text, glyph } 배열로
 * 넓어지는 것이 전부이고, 배달 쪽은 바뀔 이유가 없다.
 */
import { GamePhase } from "../../types/Game.types.ts";
import type { ChatContext } from "./ChatPermission.ts";

const QUICK_WORLD: string[] = ["안녕하세요", "같이 하실 분?", "ㅋㅋㅋ"];
const QUICK_LOBBY: string[] = ["준비 완료", "잠깐만요", "한 명만 더!"];
const QUICK_DAY: string[] = ["투표해주세요", "저는 시민입니다", "의심됩니다", "정보 있어요"];
const QUICK_VOTE: string[] = ["투표했습니다", "기권합니다", "다시 생각해보죠"];
const QUICK_MAFIA: string[] = ["이 사람 칩시다", "오늘은 넘기죠", "제가 갈게요"];
const QUICK_GHOST: string[] = ["누가 죽였는지 봤어요", "억울합니다", "잘 싸웠습니다"];
const QUICK_NONE: string[] = [];

/**
 * 침묵전의 낮 문구.
 *
 * 번호를 넣지 않는다 — 12명 × 문구 종류만큼 칩이 늘어난다. 지목은 투표와
 * 맵 위의 위치로 한다.
 */
const QUICK_SILENCE_DAY: string[] = [
	"의심됩니다",
	"저는 시민입니다",
	"정보 있어요",
	"동의합니다",
	"반대합니다",
	"저를 믿어주세요",
	"오늘은 넘기죠",
	"잘 모르겠습니다",
];

export function quickFor(ctx: ChatContext): string[] {
	if (!ctx.seated) return QUICK_WORLD;
	if (!ctx.alive) return QUICK_GHOST;
	// 밤에 마피아가 아니면 말할 곳 자체가 없다 — 칩을 띄우면 눌러도 아무 일이 없다
	if (ctx.phase === GamePhase.NIGHT) return ctx.mafiaChat ? QUICK_MAFIA : QUICK_NONE;
	if (ctx.phase === GamePhase.LOBBY) return QUICK_LOBBY;
	if (ctx.phase === GamePhase.VOTE || ctx.phase === GamePhase.VOTE_RESULT) return QUICK_VOTE;
	if (ctx.phase === GamePhase.DAY) {
		return ctx.chatMode === "phrasesOnly" ? QUICK_SILENCE_DAY : QUICK_DAY;
	}
	return QUICK_WORLD;
}
