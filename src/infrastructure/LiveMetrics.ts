/** 라이브 운영 지표를 전송하는 단일 HTTP 경계. */
const AWS_API = "https://jstvymmti6.execute-api.ap-northeast-2.amazonaws.com/liveAppDBRequest";
const CATEGORY = "mafia";

export function sendLiveMetric(
	collection: string,
	key: string,
	payload: { [name: string]: string | number | boolean }
): boolean {
	return ScriptApp.httpPostJson(
		AWS_API,
		{},
		{
			...payload,
			category: CATEGORY,
			channelId: ScriptApp.mapHashID,
			collection,
			spaceHashID: ScriptApp.spaceHashID,
			key,
		},
		() => {
			// 운영 계측 실패는 게임 진행을 막지 않는다.
		}
	);
}
