/**
 * 동시 접속자 수(CCU) 외부 보고.
 *
 * 기존 문제:
 *  1. 보고 함수가 두 개 있었다. sendPlayerCountDataToServer는
 *     `Authorization: "zep-omok"` 헤더를 그대로 들고 있는 — 이 프로젝트가
 *     오목 게임에서 복사돼 왔음을 보여주는 — 죽은 코드였고 호출부가 없었다.
 *     실제로 쓰이는 것은 AWS로 보내는 두 번째 함수뿐이다.
 *  2. 타이머가 App.onUpdate 콜백 본문 안에 인라인돼 있었다.
 *     게임 상태 머신과 네트워크 보고가 같은 함수에 섞여 있어서
 *     한쪽을 고칠 때 다른 쪽을 함께 읽어야 했다.
 *
 * 보고는 주기적이 아니라 디바운스다. 접속·이탈이 몰릴 때 매번 쏘지 않고
 * 마지막 변화로부터 일정 시간이 지난 뒤 한 번만 보낸다.
 */
import { CCU_REPORT_DEBOUNCE, CCU_REPORT_INTERVAL } from "../constants/GameConfig.ts";
import { sendLiveMetric } from "../infrastructure/LiveMetrics.ts";

const CATEGORY = "mafia";

/** 남은 대기 시간(초). 0 이하면 예약된 보고가 없다 */
let pending = CCU_REPORT_INTERVAL;

/** 인원이 바뀌었다. 잠시 뒤 한 번 보고한다 (연달아 불러도 한 번으로 합쳐진다) */
export function schedule(): void {
	pending = CCU_REPORT_DEBOUNCE;
}

/** 마지막 한 명이 나갔을 때처럼 미룰 수 없는 경우 */
export function reportNow(): void {
	pending = 0;
	send();
}

export function tick(dt: number): void {
	if (pending <= 0) return;
	pending -= dt;
	if (pending <= 0) send();
}

function send(): void {
	const key = `CCU_${CATEGORY}_${ScriptApp.spaceHashID}_${ScriptApp.mapHashID}`;
	sendLiveMetric("CCU", key, { onlineUsers: ScriptApp.playerCount });
}
