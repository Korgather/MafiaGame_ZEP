const STATE_INIT = 3000;
const STATE_READY = 3001;
const STATE_PLAYING_NIGHT = 3002;
const STATE_PLAYING_DAY = 3003;
const STATE_VOTE = 3004;
const STATE_VOTE_RESULT = 3005;
const STATE_END = 3006;

const START_WAIT_TIME = 10;
// 18,31 - 31,40

let monster = App.loadSpritesheet(
	"monster.png",
	96,
	96,
	{
		left: [8, 9, 10, 11],
		up: [12, 13, 14, 15],
		down: [4, 5, 6, 7],
		right: [16, 17, 18, 19],
	},
	8
);

let ghost = App.loadSpritesheet(
	"ghost.png",
	48,
	48,
	{
		left: [3, 4, 5],
		up: [9, 10, 11],
		down: [0, 1, 2],
		right: [6, 7, 8],
	},
	8
);

let policeSprite = App.loadSpritesheet(
	"policeSprite.png",
	48,
	48,
	{
		left: [3, 4, 5],
		up: [9, 10, 11],
		down: [0, 1, 2],
		right: [6, 7, 8],
	},
	8
);

let mafiaSprite = App.loadSpritesheet(
	"mafiaSprite.png",
	48,
	48,
	{
		left: [3, 4, 5],
		up: [9, 10, 11],
		down: [0, 1, 2],
		right: [6, 7, 8],
	},
	8
);

let doctorSprite = App.loadSpritesheet(
	"doctorSprite.png",
	48,
	48,
	{
		left: [3, 4, 5],
		up: [9, 10, 11],
		down: [0, 1, 2],
		right: [6, 7, 8],
	},
	8
);

let doctorAttackSprite = App.loadSpritesheet("doctorAttackSprite.png", 24, 24, {
	left: [0],
	right: [0],
	up: [0],
	down: [0],
});

let policeAttackSprite = App.loadSpritesheet("policeAttackSprite.png", 24, 29, {
	left: [0],
	right: [0],
	up: [0],
	down: [0],
});

let mafiaAttackSprite = App.loadSpritesheet(
	"bulletSprite2.png",
	24,
	24,
	{
		left: [2],
		right: [0],
		up: [3],
		down: [1],
	},
	8
);

let tomb = App.loadSpritesheet("tomb.png", 46, 59, {
	left: [0],
	right: [0],
	up: [0],
	down: [0],
});

let silhouette = App.loadSpritesheet("silhouette2.png", 48, 48, {
	left: [0],
	right: [0],
	up: [0],
	down: [0],
});

let blankObject = App.loadSpritesheet("blank.png", 32, 32, {
	left: [0],
	right: [0],
	up: [0],
	down: [0],
});

const ZONE_MAFIA = [26, 38];
const ZONE_DOCTOR = [28, 38];
const ZONE_POLICE = [30, 38];

const coordinates = {
	1: { x: 7, y: 3 },
	2: { x: 11, y: 3 },
	3: { x: 15, y: 3 },
	4: { x: 6, y: 7 },
	5: { x: 16, y: 7 },
	6: { x: 7, y: 11 },
	7: { x: 11, y: 11 },
	8: { x: 15, y: 11 },
};

const GAMEROOM_START_POINT = {
	1: [19, 18],
	2: [53, 18],
	3: [87, 18],
	4: [19, 39],
	5: [87, 39],
	6: [19, 60],
	7: [53, 60],
	8: [87, 60],
};

const GAMEROOM = {
	1: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[1],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	2: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[2],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	3: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[3],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	4: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[4],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	5: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[5],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	6: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[6],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	7: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[7],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
	8: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: GAMEROOM_START_POINT[8],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
		startWaitTime: START_WAIT_TIME,
		SilhouetteTracker: [],
	},
};

let _players;
let _widget = null;

App.addOnLocationTouched("m", function (player) {
	player.sprite = mafiaSprite;
	player.attackSprite = mafiaAttackSprite;
	player.sendUpdated();
});

App.addOnLocationTouched("d", function (player) {
	player.sprite = doctorSprite;
	player.attackSprite = doctorAttackSprite;
	player.sendUpdated();
});

App.addOnLocationTouched("p", function (player) {
	player.sprite = policeSprite;
	player.attackSprite = policeAttackSprite;
	player.sendUpdated();
});

// joined: false,
// role: "",
// voted: false,
// title: 0,
// votecount: 0,
// healed: false,
// mafiaTarget: false,
// widget: null,

App.onJoinPlayer.Add(function (p) {
	_players = App.players;
	InitSpawnPlayer(p);
	if (!p.storage) {
		p.storage = JSON.stringify({
			exp: 0,
		});
		p.save();
	}
	p.tag = {
		data: {
			id: p.id,
			name: p.name,
			level: levelCalc(p),
		},
	};

	if (p.isMobile) {
		p.tag.widget = p.showWidget("WatingRoom.html", "top", 400, 350);
	} else {
		p.tag.widget = p.showWidget("WatingRoom.html", "topright", 400, 350);
	}

	p.tag.widget.sendMessage({ type: "setID", id: p.id });
	p.tag.widget.sendMessage({
		type: "updatePlayerCount",
		data: GAMEROOM,
	});
	p.tag.widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));

	p.attackType = 2;
	p.attackSprite = null;
	p.attackParam1 = 2;
	p.attackParam2 = 3;

	p.moveSpeed = 80;
	p.sprite = null;
	p.title = levelCalc(p);
	p.hidden = false;

	p.sendUpdated();
});

App.onLeavePlayer.Add(function (p) {
	_players = App.players;
	if (App.playerCount == 0) {
		App.httpGet("https://api.metabusstation.shop/api/v1/posts/zep/playercount?hashId=" + App.mapHashID + "&playerCount=" + 0, {}, (a) => {});
	}

	if (p.tag.data.joined == true) {
		let room = GAMEROOM[p.tag.data.roomNum];
		switch (room.state) {
			case STATE_INIT:
				quitPlayer(p);
				break;
			case STATE_READY:
				playerLeft(p);
				break;
			case STATE_PLAYING_NIGHT:
				playerLeft(p);
				break;
			case STATE_PLAYING_DAY:
				playerLeft(p);

				break;
			case STATE_VOTE:
				playerLeft(p);

				break;
			case STATE_END:
				break;
		}
	}
});

App.onDestroy.Add(function () {
	for (let i in _players) {
		let p = _players[i];
		p.sprite = null;
		p.hidden = false;
		p.tag = {};
		p.sendUpdated();
	}
});

App.onSay.add(function (player, text) {
	if (player.role >= 3000) {
		if (text == "/경험치") {
			giveExp(player, 10);
		}

		player.sendUpdated();
	}
});

let apiRequestDelay = 15;

App.onUpdate.Add(function (dt) {
	// modumeta서버로 플레이어 카운트 보내기
	if (apiRequestDelay > 0) {
		apiRequestDelay -= dt;
		if (apiRequestDelay < 1) {
			apiRequestDelay = 15;

			App.httpGet("https://api.metabusstation.shop/api/v1/posts/zep/playercount?hashId=" + App.mapHashID + "&playerCount=" + App.playerCount, {}, (a) => {});
		}
	}

	for (let roomNum in GAMEROOM) {
		let gameRoom = GAMEROOM[roomNum];
		if (!gameRoom.start) {
			if (gameRoom.readyCount >= 4 && gameRoom.readyCount == gameRoom.players.length) {
				gameRoom.startWaitTime -= dt;
				showLabelToRoom(roomNum, `${Math.round(gameRoom.startWaitTime)}초 후 게임이 시작됩니다.`);
				if (gameRoom.startWaitTime < 0) {
					startState(roomNum, STATE_READY);
				}
			} else {
				gameRoom.startWaitTime = START_WAIT_TIME;
			}
		} else {
			if (gameRoom.stateTimer > 0) {
				gameRoom.stateTimer -= dt;
				if (gameRoom.state != STATE_READY && gameRoom.tickTockSoundOn == false) {
					if (gameRoom.stateTimer < 9) {
						gameRoom.tickTockSoundOn = true;
						playSoundToRoom(roomNum, "tickTockSound.mp3");
					}
				}
				if (gameRoom.stateTimer < 0) {
					gameRoom.stateTimer = 0;
					switch (gameRoom.state) {
						case STATE_READY:
							startState(roomNum, STATE_PLAYING_DAY);
							break;
						case STATE_PLAYING_DAY:
							startState(roomNum, STATE_VOTE);
							break;
						case STATE_VOTE:
							startState(roomNum, STATE_VOTE_RESULT);
							break;
						case STATE_VOTE_RESULT:
							startState(roomNum, STATE_PLAYING_NIGHT);
							break;
						case STATE_PLAYING_NIGHT:
							startState(roomNum, STATE_PLAYING_DAY);
							break;
					}
				}
			}
		}
	}
});

App.onObjectAttacked.Add(function (p, x, y) {
	let target = null;
	let targetNum = 0;
	if (p.tag.role == "마피아" || p.tag.role == "의사" || p.tag.role == "경찰") {
		let room = GAMEROOM[p.tag.data.roomNum];
		let startPoint = room.startPoint;
		targetNum = Object.keys(coordinates).find((key) => JSON.stringify(coordinates[key]) === JSON.stringify({ x: x - startPoint[0], y: y - startPoint[1] }));
		p.moveSpeed = 0;
		p.attackType = 2;
		p.attackSprite = null;
		p.attackParam1 = 2;
		p.attackParam2 = 3;
		p.sendUpdated();
		p.spawnAt(startPoint[0] + coordinates[p.tag.data.title].x, startPoint[1] + coordinates[p.tag.data.title].y);
	} else return;

	if (!targetNum) return;

	for (let i in _players) {
		let player = _players[i];
		if (player.tag.data.title == targetNum) {
			target = player;
		}
	}

	if (target !== null) {
		switch (p.tag.role) {
			case "경찰":
				p.playSound("policeAttackSound.mp3");
				let targetRole = target.tag.role;
				if (targetRole == "마피아") {
					p.showCustomLabel(`${target.title}의 직업은 ${targetRole}입니다.`, 0xffffff, 0x000000, 300, 6000);
				} else {
					p.showCustomLabel(`${target.title}은 마피아가 아닙니다.`, 0xffffff, 0x000000, 300, 6000);
				}

				break;
			case "마피아":
				playSoundToRoom(p.tag.data.roomNum, "gunSound.WAV");
				p.showCustomLabel(`${target.title}를 죽이기로 결졍했습니다.`, 0xffffff, 0x000000, 300);
				target.tag.mafiaTarget = true;
				break;
			case "의사":
				p.playSound("healSound.wav");
				p.showCustomLabel(`${target.title}를 살리기로 결졍했습니다.`, 0xffffff, 0x000000, 300);
				// p.tag.healed = false;
				target.tag.healed = true;
				break;
		}
	}
});

function dead(player) {
	let roomNum = player.tag.data.roomNum;
	// let room = GAMEROOM[roomNum];

	if (player.tag.role != "마피아") {
		showLabelToRoom(roomNum, `${player.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`);
		giveExp(player, 2);
	} else {
		showLabelToRoom(roomNum, `${player.name} 님이 처형당했습니다. 그는 마피아였습니다!`);
	}

	player.moveSpeed = 80;
	player.attackParam2 = -1;
	player.attackSprite = blankObject;
	player.tag.role = "";
	player.title = "유령";
	player.tag.healed = false;
	player.tag.mafiaTarget = false;
	player.tag.data.votecount = 0;
	player.tag.data.joined = false;
	player.sprite = ghost;
	player.sendUpdated();

	// gameEndCheck(roomNum);
}

function startState(roomNum, state) {
	let room = GAMEROOM[roomNum];
	let widgetHtml;
	room.state = state;
	room.stateTimer = 0;
	room.tickTockSoundOn = false;

	switch (room.state) {
		case STATE_INIT:
			clearRoomObjects(roomNum);
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				p.attackType = 2;
				p.attackSprite = null;
				p.attackParam1 = 2;
				p.attackParam2 = 3;

				p.moveSpeed = 80;
				p.sprite = null;
				p.title = levelCalc(p);
				p.hidden = false;
				p.moveSpeed = 80;

				p.tag.data.joined = false;
				p.tag.role = "";
				p.tag.data.voted = false;
				p.tag.data.title = 0;
				p.tag.data.votecount = 0;
				p.tag.healed = false;
				p.tag.mafiaTarget = false;
				p.tag.data.kickList = [];
				p.tag.data.ready = false;
				p.tag.data.kickCount = 0;

				// p.spawnAt(parseInt(Math.random() * 14 + 18), parseInt(Math.random() * 10 + 37));
				p.sendUpdated();
			}
			widgetHtml = "WatingRoom.html";
			updatePlayerWidget(roomNum, widgetHtml);
			gameReset(roomNum);
			break;
		case STATE_READY:
			room.stateTimer = 0.1;
			room.start = true;
			room.total = room.players.length;
			const roleArray = createRole(room.players.length);
			let arrIndex = 0;
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				if (p.tag.widget) {
					p.tag.widget.destroy();
					p.tag.widget = null;
				}
				let pStorage = JSON.parse(p.storage);
				pStorage["playCount"] ? pStorage["playCount"]++ : (pStorage["playCount"] = 1);
				p.storage = JSON.stringify(pStorage);
				// p.spawnAt(coordinates[arrIndex + 1].x, coordinates[arrIndex + 1].y);
				p.title = `${arrIndex + 1} 번 참가자`;
				p.tag.data.title = arrIndex + 1;
				setRole(p, arrIndex, roleArray);
				arrIndex++;
			}

			sendMessageToPlayerWidget(roomNum);
			updatePlayerCount();
			break;
		case STATE_PLAYING_DAY:
			room.turnCount++;
			nightResult(roomNum);
			if (gameEndCheck(roomNum) == false) {
				tagReset(roomNum);
				// destroyAppWidget();
				clearHidden(roomNum);
				Map.clearAllObjects();
				playSoundToRoom(roomNum, "morningSound.wav");
				room.stateTimer = 10 * room.players.length;
				widgetHtml = "morning.html";
				updatePlayerWidget(roomNum, widgetHtml);
				sendMessageToPlayerWidget(roomNum);
				// sendMessageToPlayerWidget();
			}
			break;
		case STATE_VOTE:
			if (gameEndCheck(roomNum) == false) {
				// destroyAppWidget();
				playSoundToRoom(roomNum, "voteSound.wav");
				room.stateTimer = 17;
				// 투표가 시작되었습니다.
				widgetHtml = "vote.html";
				updatePlayerWidget(roomNum, widgetHtml);
				sendMessageToPlayerWidget(roomNum);
				// sendMessageToPlayerWidget();
			}
			break;
		case STATE_VOTE_RESULT:
			if (gameEndCheck(roomNum) == false) {
				room.stateTimer = 7;
				voteResult(roomNum);
			}
			break;
		case STATE_PLAYING_NIGHT:
			if (gameEndCheck(roomNum) == false) {
				// destroyAppWidget();
				tagReset(roomNum);
				createSilhouette(roomNum);
				allHidden(roomNum);
				room.stateTimer = 17;
				playSoundToRoom(roomNum, "nightSound.mp3");
				widgetHtml = "night.html";
				updatePlayerWidget(roomNum, widgetHtml);
				sendMessageToPlayerWidget(roomNum);
				// sendMessageToPlayerWidget();

				for (let playerData of room.players) {
					let p = App.getPlayerByID(playerData.id);
					if (!p) continue;
					if (p.tag.data.joined) {
						p.chatEnabled = false;
						p.sendUpdated();
						if (p.tag.data.joined == true) {
							let role = p.tag.role;
							if (role != "시민") {
								changeCharacterImage(p, role);
							}
						}
					}
				}
			}
			break;
		case STATE_END:
			room.start = false;
			startState(roomNum, STATE_INIT);
			break;
	}
}

function createRole(playerCount) {
	let roleArray = Array.from({ length: playerCount }, (v, i) => {
		if (i === 0) {
			return "마피아";
		}
		if (i === 1) {
			return "의사";
		}
		if (i === 2) {
			return "경찰";
		}
		if (i === 3) {
			return "정치인";
		}
		return "시민";
	});
	return shuffle(roleArray);
}

function setRole(player, index, roleArray) {
	if (player.tag.data.joined == true) {
		player.tag.role = roleArray[index];
		// App.sayToAll(`${player.name}은 ${player.tag.role} 역할, ${index}`);

		showRoleWidget(player);
	}
}

function showRoleWidget(player) {
	let role = player.tag.role;
	let widgetName;
	switch (role) {
		case "경찰":
			widgetName = `police.html`;
			break;
		case "마피아":
			widgetName = `mafia.html`;
			break;
		case "의사":
			widgetName = `doctor.html`;
			break;
		case "시민":
			widgetName = `citizen.html`;
			break;
		case "정치인":
			widgetName = `politician.html`;
			break;
	}
	let align = player.isMobile ? "middle" : "topleft";

	player.tag.roleWidget = player.showWidget(`${widgetName}`, `${align}`, 300, 400);

	player.tag.roleWidget.onMessage.Add(function (player, data) {
		if (data.type == "close") {
			player.tag.roleWidget.destroy();
			player.tag.roleWidget = null;
		}
	});
}

function shuffle(array) {
	for (let i = array.length - 1; i > 0; i--) {
		let j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

function playerLeft(p) {
	if (p.tag.data.joined == true) {
		p.tag.data.joined = false;
		let pStorage = JSON.parse(p.storage);
		let roomNum = p.tag.data.roomNum;
		pStorage.runCount ? pStorage.runCount++ : (pStorage.runCount = 1);
		p.storage = JSON.stringify(pStorage);
		p.save();
		if (p.tag.role == "마피아") {
			showLabelToRoom(roomNum, `${p.name} 님이 나갔습니다.`);
		} else {
			showLabelToRoom(roomNum, `${p.name} 님이 나갔습니다.`);
		}
		App.runLater(() => {
			gameEndCheck(roomNum);
		}, 2);
	}
}

function voteResult(roomNum) {
	let room = GAMEROOM[roomNum];
	let max = 0;
	let targetPlayer = -1;
	let maxCount = 0;
	let voteArray = [];
	for (let playerData of room.players) {
		p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.votecount > max) {
			max = p.tag.data.votecount;
			targetPlayer = p;
		}
	}

	if (max != 0) {
		for (let playerData of room.players) {
			p = App.getPlayerByID(playerData.id);
			if (!p) continue;
			if (p.tag.data.votecount == max) {
				maxCount++;
			}

			if (p.tag.data.joined == true) {
				voteArray.push([p.tag.data.title, p.tag.data.votecount]);
			}
		}
	}

	voteArray.sort((a, b) => b[1] - a[1]);

	if (targetPlayer == -1 || maxCount > 1) {
		showLabelToRoom(roomNum, `투표 결과 아무도 죽지 않았습니다.`);
	} else {
		if (targetPlayer.tag.role == "정치인") {
			showLabelToRoom(roomNum, `정치인은 투표로 죽지 않습니다.`);
		} else {
			dead(targetPlayer);
		}
	}

	// destroyAppWidget();
	widgetHtml = "voteResult.html";
	updatePlayerWidget(roomNum, widgetHtml);
	sendMessageToPlayerWidget(roomNum, voteArray);
}

function tagReset(roomNum) {
	let room = GAMEROOM[roomNum];
	if (!room) return;
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		p.tag.data.voted = false;
		p.tag.healed = false;
		p.tag.data.votecount = 0;
		p.tag.mafiaTarget = false;
		p.tag.data.kickCount = 0;
		p.attackSprite = null;
		p.sendUpdated();
	}
}

function allHidden(roomNum) {
	let room = GAMEROOM[roomNum];
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		p.hidden = true;
		p.sendUpdated();
	}
}

function clearHidden(roomNum) {
	let room = GAMEROOM[roomNum];
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.joined == true) {
			let room = GAMEROOM[p.tag.data.roomNum];
			let startPoint = room.startPoint;
			p.moveSpeed = 0;
			p.spawnAt(startPoint[0] + coordinates[p.tag.data.title]?.x, startPoint[1] + coordinates[p.tag.data.title]?.y);
			p.sprite = null;
			p.hidden = false;
			p.chatEnabled = true;
			p.sendUpdated();
		}
	}
}

function createSilhouette(roomNum) {
	let room = GAMEROOM[roomNum];
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.joined == true) {
			let room = GAMEROOM[p.tag.data.roomNum];
			let startPoint = room.startPoint;
			let x = startPoint[0] + coordinates[p.tag.data.title].x;
			let y = startPoint[1] + coordinates[p.tag.data.title].y;
			Map.putObject(x, y - 1, silhouette);
			Map.putObject(x, y, blankObject);
			room.SilhouetteTracker.push([x, y - 1]);
		}
	}
}

function nightResult(roomNum) {
	// App.sayToAll(`턴 : ${turnCount}`);
	let room = GAMEROOM[roomNum];
	if (room.turnCount * 1 > 1) {
		for (let playerData of room.players) {
			let p = App.getPlayerByID(playerData.id);
			if (!p) continue;
			if (p.tag.data.joined == true) {
				if (p.tag.mafiaTarget == true) {
					if (p.tag.healed == true) {
						showLabelToRoom(roomNum, `어느 훌륭하신 의사가 기적적으로 시민을 살렸습니다.`);
						return;
					} else {
						showLabelToRoom(roomNum, `이번 밤에 ${p.title}가 죽었습니다.`);
						dead(p);
						return;
					}
				}
			}
		}
		App.showCustomLabel(`이번 밤에 아무도 죽지 않았습니다.`, 0xffffff, 0x000000, 300, 5000);
	}
}

function gameEndCheck(roomNum) {
	let room = GAMEROOM[roomNum];
	if (room.start) {
		let mafiaCount = 0;
		let citizenCount = 0;
		for (let playerData of room.players) {
			let p = App.getPlayerByID(playerData.id);
			if (!p) continue;
			if (p.tag.data.joined == true) {
				if (p.tag.role == "마피아") {
					// App.sayToAll(`마피아 : ${p.title}`);
					mafiaCount++;
				} else citizenCount++;
			}
		}

		// App.sayToAll(`마피아 수: ${_mafiaCount}`);

		if (mafiaCount == 0) {
			// 시민 승리
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				if (p.tag.data.joined == true) {
					if (p.tag.role == "마피아") {
						giveExp(p, 2);
					} else {
						giveExp(p, 5);
					}
				}
			}

			playSoundToRoom(roomNum, "citizenWinSound.mp3");
			widgetHtml = "winCitizen.html";
			updatePlayerWidget(roomNum, widgetHtml);
			App.runLater(() => {
				startState(roomNum, STATE_INIT);
			}, 5);

			return true;
		} else if (mafiaCount == 1) {
			if (mafiaCount == citizenCount) {
				// 마피아 승리
				for (let playerData of room.players) {
					let p = App.getPlayerByID(playerData.id);
					if (!p) continue;
					if (p.tag.data.joined == true) {
						if (p.tag.role == "마피아") {
							giveExp(p, 10);
						} else {
							giveExp(p, 5);
						}
					}
				}
				playSoundToRoom(roomNum, "mafiaWinSound.mp3");
				widgetHtml = "winMafia.html";
				updatePlayerWidget(roomNum, widgetHtml);
				App.runLater(() => {
					startState(roomNum, STATE_INIT);
				}, 5);

				return true;
			}
		}
	}
	return false;
}

function gameReset(roomNum) {
	let room = GAMEROOM[roomNum];

	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.roleWidget) {
			p.tag.roleWidget.destroy();
			p.tag.roleWidget = null;
		}

		p.attackType = 2;
		p.attackSprite = null;
		p.attackParam1 = 2;
		p.attackParam2 = 3;
		p.chatEnabled = true;
		p.moveSpeed = 80;
		p.sprite = null;
		p.title = levelCalc(p);
		p.hidden = false;
		p.tag.data.joined = false;
		p.tag.role = "";
		p.tag.data.voted = false;
		p.tag.data.title = 0;
		p.tag.data.votecount = 0;
		p.tag.healed = false;
		p.tag.mafiaTarget = false;

		InitSpawnPlayer(p);
		p.sendUpdated();
	}

	room.start = false;
	room.state = STATE_INIT;
	room.stateTimer = 0;
	room.players = [];
	room.readyCount = 0;
	room.tickTockSoundOn = false;
	room.turnCount = 0;
	room.alive = 0;
	room.total = 0;
	room.startWaitTime = START_WAIT_TIME;
	room.SilhouetteTracker = [];
}

function changeCharacterImage(player, text) {
	if (text == "의사") {
		player.sprite = doctorSprite;
		player.moveSpeed = 80;
		player.attackSprite = doctorAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "마피아") {
		player.sprite = mafiaSprite;
		player.moveSpeed = 80;
		player.attackSprite = mafiaAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "경찰") {
		player.sprite = policeSprite;
		player.moveSpeed = 80;
		player.attackSprite = policeAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else return;
	player.sendUpdated();
}

function giveExp(p, point) {
	if (!p.isGuest) {
		if (p.storage == null) {
			p.storage = JSON.stringify({
				exp: 0,
			});
			p.save();
		}
		let myExp = JSON.parse(p.storage).exp;

		p.storage = JSON.stringify({
			exp: myExp + point,
		});

		p.showCustomLabel("경험치: " + JSON.parse(p.storage).exp);

		p.save();
		// App.sayToAll(JSON.parse(p.storage).exp);
	}
	// App.sayToAll(App.worldHashID);
}

function levelCalc(player) {
	if (player.role >= 3000) {
		return "운영자";
	} else if (player.id.indexOf("GUEST") === -1) {
		let pStorage = JSON.parse(player.storage);
		if (!pStorage.exp) {
			pStorage.exp = 0;
			player.storage = JSON.stringify(pStorage);
			player.save();
		}
		let i = 0;
		let myExp = pStorage.exp;

		while (myExp > 0) {
			myExp -= (i + 15) * i;
			i++;
		}
		return "Lv." + i;
	} else {
		return "비로그인 유저";
	}
}

function updatePlayerWidget(roomNum, htmlName) {
	let room = GAMEROOM[roomNum];
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.widget) {
			p.tag.widget.destroy();
			p.tag.widget = null;
		}
		if (p.isMobile) {
			p.tag.widget = p.showWidget(htmlName, "top", 400, 350);
		} else {
			p.tag.widget = p.showWidget(htmlName, "topright", 400, 350);
		}

		if (htmlName == "WatingRoom.html") {
			p.tag.widget.sendMessage({ type: "setID", id: p.id });
			p.tag.widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));
		}
	}
	// if (_state != STATE_VOTE_RESULT) {
	// 	sendMessageToPlayerWidget();
	// }
}

function sendMessageToPlayerWidget(roomNum, data = null) {
	let room = GAMEROOM[roomNum];
	let aliveCount = 0;
	if (room.start) {
		room.players.forEach((data) => {
			if (data.joined) aliveCount++;
		});
	}

	for (let roomPlayerData of room.players) {
		let id = roomPlayerData.id;
		let p = App.getPlayerByID(id);

		if (!p) continue;
		let p_widget = p.tag.widget;
		if (p_widget) {
			switch (room.state) {
				case STATE_INIT:
					switch (data?.type) {
						case "join":
							p_widget.sendMessage({
								type: "join",
								data: data,
							});
							break;
						case "ready":
							p_widget.sendMessage({
								type: "ready",
								id: data.id,
							});
							break;
						case "cancle-ready":
							p_widget.sendMessage({
								type: "cancle-ready",
								id: data.id,
							});
							break;
						case "kick":
							p_widget.sendMessage({
								type: "kick",
								id: data.id,
							});
							break;
						case "cancle-kick":
							p_widget.sendMessage({
								type: "cancle-kick",
								id: data.id,
							});
							break;
						case "leave":
							p_widget.sendMessage({
								type: "leave",
								id: data.id,
								kickList: data.kickList,
							});
							break;
					}

					break;
				case STATE_READY:
					p_widget.sendMessage({
						total: room.total,
						current: room.total,
						description: `마피아 게임이 곧 시작됩니다.`,
					});
					break;
				case STATE_PLAYING_DAY:
					p_widget.sendMessage({
						total: room.total,
						alive: aliveCount,
						timer: room.stateTimer,
						description: "투표 전까지 이야기를 나누세요.",
					});
					break;
				case STATE_VOTE:
					let liveList = [];
					for (let playerData of room.players) {
						let p = App.getPlayerByID(playerData.id);
						if (!p) continue;
						if (p.tag.data.joined) {
							liveList.push(parseInt(p.tag.data.title));
						}
					}
					p_widget.sendMessage({
						type: "init",
						total: room.total,
						alive: aliveCount,
						timer: room.stateTimer,
						liveList: liveList,
						description: "",
						total: room.total,
					});

					p_widget.onMessage.Add(function (player, data) {
						if (player.tag.data.joined) {
							let room = GAMEROOM[player.tag.data.roomNum];
							if (data.vote) {
								for (let playerData of room.players) {
									let p = App.getPlayerByID(playerData.id);
									if (!p) continue;
									if (p.tag.data.title == data.vote) {
										if (player.tag.role == "정치인") {
											p.tag.data.votecount += 2;
										} else {
											p.tag.data.votecount++;
										}
									}
								}
								player.tag.widget.destroy();
								player.tag.widget = null;
								player.showCustomLabel(`${data.vote}번 참가자에게 투표했습니다.`);
							}
						} else {
							player.showCustomLabel("투표 권한이 없습니다");
						}
					});

					break;
				case STATE_VOTE_RESULT:
					p_widget.sendMessage({
						type: "voteResult",
						result: data,
					});
					break;
				case STATE_PLAYING_NIGHT:
					p_widget.sendMessage({
						total: room.total,
						alive: aliveCount,
						timer: room.stateTimer,
						description: "마피아, 경찰, 의사는 밤에 움직일 수 있습니다.",
					});

					break;
			}
		}
	}
}

function WatingRoomOnMessage(player, data) {
	let roomNum = player.tag.data.roomNum;
	let room;
	if (GAMEROOM.hasOwnProperty(roomNum)) {
		room = GAMEROOM[roomNum];
	}
	switch (data.type) {
		case "join":
			if (player.tag.data.joined) {
				player.showCenterLabel("이미 참여중입니다.");
				return;
			}
			roomNum = parseInt(data.roomNum);
			room = GAMEROOM[roomNum];
			if (room.start) {
				player.showCenterLabel("이미 게임을 시작했습니다.");
				return;
			}
			let roomPlayers = room.players;
			roomPlayers.forEach((data) => {
				if (data.id == player.id) {
					player.showCenterLabel("이미 참여중입니다.");
					return;
				}
			});

			let playerCount = roomPlayers.length;
			if (playerCount < 7) {
				if (!player.tag.data.joined) {
					player.tag.data.joined = true;
					player.tag.data.roomNum = roomNum;
					room.players.push(player.tag.data);
					playSoundToRoom(roomNum, "joinSound.mp3");
					sendMessageToPlayerWidget(roomNum, {
						type: "join",
						roomData: room,
						id: player.id,
					});
				}
				updatePlayerCount();
			} else {
				if (!player.tag.data.joined) {
					player.showCustomLabel("게임 인원이 다 찼습니다.", 0xffffff, 0x000000, 300);
				}
			}
			break;
		case "ready":
			sendMessageToPlayerWidget(roomNum, {
				type: "ready",
				id: player.id,
			});
			if (!player.tag.data.ready) {
				player.tag.data.ready = true;
				room.readyCount++;
			}

			break;
		case "cancle-ready":
			if (player.tag.data.ready) {
				room.readyCount--;
				player.tag.data.ready = false;
			}
			sendMessageToPlayerWidget(roomNum, {
				type: "cancle-ready",
				id: player.id,
			});
			break;
		case "kick":
			let kickList = player.tag.data.kickList;
			if (kickList && kickList.includes(data.id)) {
				kickList.splice(kickList.indexOf(data.id), 1);
				player.tag.data.kickList = kickList;
				sendMessageToPlayerWidget(roomNum, {
					type: "cancle-kick",
					id: data.id,
				});
				let target = App.getPlayerByID(data.id);
				target.tag.data.kickCount--;
			} else {
				player.tag.data.kickList ? player.tag.data.kickList.push(data.id) : (player.tag.data.kickList = [data.id]);
				sendMessageToPlayerWidget(roomNum, {
					type: "kick",
					id: data.id,
				});
				let target = App.getPlayerByID(data.id);
				target?.tag.data.kickCount ? target.tag.data.kickCount++ : (target.tag.data.kickCount = 1);
				if (target.tag.data.kickCount >= 3) {
					quitPlayer(target);
				}
			}
			break;
		case "quit":
			quitPlayer(player);
			break;
	}
}

function showLabelToRoom(roomNum, message) {
	let gameRoom = GAMEROOM[roomNum];
	for (let playerData of gameRoom.players) {
		let player = App.getPlayerByID(playerData.id);
		if (!player) continue;
		player.showCenterLabel(message, 0xffffff, 0x000000, 300);
	}
}

function showWidgetToRoom(roomNum, turn) {
	let gameRoom = GAMEROOM[roomNum];

	if (turn == STONE_BLACK) {
		for (let playerID of gameRoom.players) {
			let player = App.getPlayerByID(playerID);
			if (!player) continue;
			if (player.tag.timerWidget) {
				player.tag.timerWidget.destroy();
				player.tag.timerWidget = null;
			}

			if (player.tag.widget) {
				player.tag.widget.destroy();
				player.tag.widget = null;
			}
			player.tag.timerWidget = player.showWidget("black_timer.html", "top", 500, 130);
		}
	} else {
		for (let playerID of gameRoom.players) {
			let player = App.getPlayerByID(playerID);
			if (!player) continue;
			if (player.tag.timerWidget) {
				player.tag.timerWidget.destroy();
				player.tag.timerWidget = null;
			}
			if (player.tag.widget) {
				player.tag.widget.destroy();
				player.tag.widget = null;
			}
			player.tag.timerWidget = player.showWidget("white_timer.html", "top", 500, 130);
		}
	}
}

function playSoundToRoom(roomNum, soundName) {
	let gameRoom = GAMEROOM[roomNum];
	for (let playerData of gameRoom.players) {
		let player = App.getPlayerByID(playerData.id);
		if (!player) continue;
		player.playSound(soundName);
	}
}

function updatePlayerCount() {
	for (let p of _players) {
		if (!p.tag.data.joined && p.tag.widget) {
			p.tag.widget.sendMessage({
				type: "updatePlayerCount",
				data: GAMEROOM,
			});
		}
	}
}

function quitPlayer(player) {
	let roomNum = player.tag.data.roomNum;
	let room;
	for (let p of _players) {
		let kickList = p.tag.data.kickList;
		if (kickList && kickList.includes(player.id)) {
			kickList.splice(kickList.indexOf(player.id), 1);
		}
	}
	if (!GAMEROOM.hasOwnProperty(roomNum)) return;
	room = GAMEROOM[roomNum];
	let players = GAMEROOM[roomNum].players;
	for (let i = 0; i < players.length; i++) {
		if (players[i].id == player.id) {
			players.splice(i, 1);
			break;
		}
	}
	if (player.tag.data.ready) {
		room.readyCount--;
		player.tag.data.ready = false;
	}
	player.tag.widget.sendMessage({
		type: "kicked",
	});
	sendMessageToPlayerWidget(roomNum, {
		type: "leave",
		id: player.id,
		kickList: player.tag.data.kickList,
	});

	player.tag.data.roomNum = -1;
	player.tag.data.joined = false;
	player.tag.data.kickList = [];
	player.tag.data.kickCount = 0;

	updatePlayerCount();
}

function clearRoomObjects(roomNum) {
	let room = GAMEROOM[roomNum];

	for (let coords of room.SilhouetteTracker) {
		Map.putObject(coords[0], coords[1], null);
	}
	room.SilhouetteTracker = [];
}

function InitSpawnPlayer(p) {
	p.spawnAt(parseInt(Math.random() * 14 + 58), parseInt(Math.random() * 7 + 43));
}
