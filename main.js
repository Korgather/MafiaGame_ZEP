const STATE_INIT = 3000;
const STATE_READY = 3001;
const STATE_PLAYING_NIGHT = 3002;
const STATE_PLAYING_DAY = 3003;
const STATE_VOTE = 3004;
const STATE_VOTE_RESULT = 3005;
const STATE_END = 3006;

const START_WAIT_TIME = 10;
// 18,31 - 31,40

const MAFIA_CHATTING_CHANNEL = 1;
const GHOST_CHATTING_CHANNEL = 2;

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

let spySprite = App.loadSpritesheet("spySprite.png", 64, 70, {
	left: [6, 7, 8, 9, 10, 11],
	right: [12, 13, 14, 15, 16, 17],
	up: [18, 19, 20, 21, 22, 23],
	down: [0, 1, 2, 3, 4, 5],
});

let detectiveSprite = App.loadSpritesheet(
	"detectiveSprite.png",
	64,
	64,
	{
		left: [4, 5, 6, 7],
		up: [12, 13, 14, 15],
		down: [0, 1, 2, 3],
		right: [8, 9, 10, 11],
	},
	8
);

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

App.addOnLocationTouched("spy", function (player) {
	player.sprite = spySprite;
	player.attackSprite = null;
	player.sendUpdated();
});

App.addOnLocationTouched("detective", function (player) {
	player.sprite = detectiveSprite;
	player.attackSprite = null;
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
	p.tag = {};
	p.tag.data = {};
	p.tag = {
		data: {
			id: p.id,
			name: p.name,
			level: levelCalc(p),
		},
	};

	if (p.isMobile) {
		p.displayRatio = 0.7;
		p.tag.widget = p.showWidget("WatingRoom.html", "top", 400, 350);
		App.putMobilePunch();
	} else {
		p.tag.widget = p.showWidget("WatingRoom.html", "topright", 400, 350);
	}

	p.tag.widget.sendMessage({ type: "setID", id: p.id, isMobile: p.isMobile });
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
							startState(roomNum, STATE_PLAYING_NIGHT);
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
	let startPoint;
	// if (p.tag.role == "마피아" || p.tag.role == "의사" || p.tag.role == "경찰" || p.tag.role == "스파이") {
	// 	let room = GAMEROOM[p.tag.data.roomNum];
	// 	startPoint = room.startPoint;
	// 	targetNum = Object.keys(coordinates).find((key) => JSON.stringify(coordinates[key]) === JSON.stringify({ x: x - startPoint[0], y: y - startPoint[1] }));
	// 	p.attackType = 2;
	// 	p.attackSprite = null;
	// 	p.attackParam1 = 2;
	// 	p.attackParam2 = 2;
	// 	p.sendUpdated();
	// } else return;

	if (!targetNum) return;

	// for (let i in _players) {
	// 	let player = _players[i];
	// 	if (player.tag.data.index == targetNum) {
	// 		target = player;
	// 	}
	// }
	let targetRole;
	if (target !== null) {
		switch (p.tag.role) {
			case "경찰":
				// p.playSound("policeAttackSound.mp3");
				// targetRole = target.tag.role;
				// if (targetRole == "마피아") {
				// 	p.showCustomLabel(`${target.title}의 직업은 ${targetRole}입니다.`, 0xffffff, 0x000000, 300, 6000);
				// } else {
				// 	p.showCustomLabel(`${target.title}은 마피아가 아닙니다.`, 0xffffff, 0x000000, 300, 6000);
				// }
				// p.spawnAt(startPoint[0] + coordinates[p.tag.data.index].x, startPoint[1] + coordinates[p.tag.data.index].y);
				// p.moveSpeed = 0;
				// p.sendUpdated();
				break;
			// case "마피아":
			// 	playSoundToRoom(p.tag.data.roomNum, "gunSound.WAV");
			// 	p.showCustomLabel(`${target.title}를 죽이기로 결졍했습니다.`, 0xffffff, 0x000000, 300);
			// 	target.tag.mafiaTarget = true;
			// 	p.spawnAt(startPoint[0] + coordinates[p.tag.data.index].x, startPoint[1] + coordinates[p.tag.data.index].y);
			// 	p.moveSpeed = 0;
			// 	p.sendUpdated();
			// 	break;
			// case "의사":
			// 	p.playSound("healSound.WAV");
			// 	p.showCustomLabel(`${target.title}를 살리기로 결졍했습니다.`, 0xffffff, 0x000000, 300);
			// 	// p.tag.healTarget = false;
			// 	target.tag.healTarget = true;
			// 	p.spawnAt(startPoint[0] + coordinates[p.tag.data.index].x, startPoint[1] + coordinates[p.tag.data.index].y);
			// 	p.moveSpeed = 0;
			// 	p.sendUpdated();
			// 	break;
			case "스파이":
				// targetRole = target.tag.role;
				// if (targetRole == "마피아") {
				// 	p.showCustomLabel(`🕵️‍♀️ ${target.title}의 직업은 ${targetRole}입니다.\n마피아 팀에 합류하여 채팅을 할 수 있게되었습니다.\n능력을 한번 더 사용할 수 있습니다.`, 0xffffff, 0x000000, 200, 6000);
				// 	// p.sendMessage("[정보] 밤에 마피아와 채팅을 공유할 수 있게 되었습니다.", 0x00ff00);
				// 	// p.sendMessage("[정보] 능력을 한번 더 사용할 수 있습니다.", 0x00ff00);
				// 	p.tag.team = "mafia";
				// 	// p.chatEnabled = true;
				// 	// p.chatGroupID = MAFIA_CHATTING_CHANNEL;
				// 	p.sendUpdated();
				// 	for (let playerData of GAMEROOM[p.tag.data.roomNum].players) {
				// 		let player = App.getPlayerByID(playerData.id);
				// 		if (!player) continue;
				// 		if (!player.tag.team || !player.tag.team == "mafia" || !player.tag.data.joined) continue;
				// 		player.sendMessage(`─────────────────\n🕵️‍♀️ ${p.name}(스파이)님이 채팅에 합류했습니다.\n밤에 채팅을 공유할 수 있습니다.\n─────────────────`, 0x00ff00);
				// 	}
				// } else {
				// 	p.showCustomLabel(`${target.title}은 ${targetRole}입니다.`, 0xffffff, 0x000000, 300, 6000);
				// 	p.spawnAt(startPoint[0] + coordinates[p.tag.data.index].x, startPoint[1] + coordinates[p.tag.data.index].y);
				// 	p.moveSpeed = 0;
				// 	p.sendUpdated();
				// }
				break;
		}
	}
});

function dead(player) {
	let roomNum = player.tag.data.roomNum;
	// let room = GAMEROOM[roomNum];

	if (player.tag.role != "마피아") {
		showLabelToRoom(roomNum, `${player.tag.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`);
		giveExp(player, 2);
	} else {
		showLabelToRoom(roomNum, `${player.tag.name} 님이 처형당했습니다. 그는 마피아였습니다!`);
	}

	player.moveSpeed = 80;
	player.attackParam2 = -1;
	player.attackSprite = blankObject;
	player.tag.role = "";
	player.title = "유령";
	if (player.tag.name) {
		player.name = `${player.tag.name}(유령)`;
	}
	player.tag.healTarget = false;
	player.tag.mafiaTarget = false;
	player.tag.data.votecount = 0;
	player.tag.data.joined = false;
	player.sprite = ghost;
	// player.chatGroupID = GHOST_CHATTING_CHANNEL;
	player.chatEnabled = false;
	player.tag.ghostWidget = player.showWidget("roleAction.html", "top", 400, 500);
	player.tag.ghostWidget.sendMessage({
		type: "init",
		myNum: player.tag.data.index,
		role: player.tag.role,
		isMobile: player.isMobile,
		chatEnable: true,
	});
	player.tag.ghostWidget.onMessage.Add(function (player, data) {
		switch (data.type) {
			case "sendMessage":
				ghostChatNotify(roomNum, data.num, data.message, player.name);
				break;
		}
	});
	player.sendMessage(`─────────────────\n☠️ 당신은 죽었습니다.\n 유령들끼리 대화를 할 수 있습니다.\n 밤에는 영매와 대화할 수 있습니다.\n─────────────────`, 0x00ff00);
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
				p.attackParam2 = 2;

				p.moveSpeed = 80;
				p.sprite = null;
				p.title = levelCalc(p);
				p.hidden = false;
				p.moveSpeed = 80;

				p.tag.data.joined = false;
				p.tag.role = "";
				p.tag.data.voted = false;
				p.tag.data.index = 0;
				p.tag.data.votecount = 0;
				p.tag.healTarget = false;
				p.tag.mafiaTarget = false;
				p.tag.data.kickList = [];
				p.tag.data.ready = false;
				p.tag.data.kickCount = 0;

				// p.spawnAt(parseInt(Math.random() * 14 + 18), parseInt(Math.random() * 10 + 37));
				p.sendUpdated();
			}
			widgetHtml = "WatingRoom.html";
			switchAllPlayersWidget(roomNum, widgetHtml);
			gameReset(roomNum);
			break;
		case STATE_READY:
			room.stateTimer = 0.1;
			room.start = true;
			room.total = room.players.length;
			const roleArray = createRole(room.players.length);
			let arrIndex = 0;
			room.players = shuffle(room.players);
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
				p.tag.data.index = arrIndex + 1;
				setRole(p, arrIndex, roleArray);
				arrIndex++;
			}

			sendMessageToPlayerWidget(roomNum);
			updatePlayerCount();
			break;
		case STATE_PLAYING_DAY:
			nightResult(roomNum);

			if (gameEndCheck(roomNum) == false) {
				tagReset(roomNum);
				// destroyAppWidget();
				clearHidden(roomNum);
				Map.clearAllObjects();
				playSoundToRoom(roomNum, "morningSound.wav");
				room.stateTimer = 10 * room.alive > 60 ? 60 : 10 * room.alive;
				// room.stateTimer = 1000 * room.alive > 60 ? 60 : 10 * room.alive;

				widgetHtml = "morning.html";
				switchAllPlayersWidget(roomNum, widgetHtml);
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
				switchAllPlayersWidget(roomNum, widgetHtml);
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
				for (let playerData of GAMEROOM[roomNum].players) {
					let p = App.getPlayerByID(playerData.id);
					if (!p) continue;
					if (p.tag.data.joined == true) {
						let room = GAMEROOM[roomNum];
						let startPoint = room.startPoint;
						p.moveSpeed = 0;
						p.chatEnabled = false;
						p.spawnAt(parseInt(startPoint[0]) + parseInt(coordinates[p.tag.data.index]?.x), parseInt(startPoint[1]) + parseInt(coordinates[p.tag.data.index]?.y));
						p.sendUpdated();
					}
				}
				createSilhouette(roomNum);
				allHidden(roomNum);
				room.stateTimer = 22;
				playSoundToRoom(roomNum, "nightSound.mp3");

				// sendMessageToPlayerWidget();

				for (let playerData of room.players) {
					let p = App.getPlayerByID(playerData.id);
					if (!p) continue;
					if (p.tag.data.joined) {
						p.sendUpdated();
						if (p.tag.data.joined == true) {
							let role = p.tag.role;
							nightPlayerEvent(p, role, roomNum);
						} else {
							p.sendMessage(`─────────────────\n🌙 밤이 되었습니다.\n영매와 대화 할 수 있습니다.\n─────────────────`, 0x00ff00);
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
		if (i === 4) {
			return "영매";
		}
		if (i === 5) {
			return "스파이";
		}
		if (i === 7) return "마피아";
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
			player.tag.team = "mafia";
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
		case "영매":
			widgetName = `spiritian.html`;
			break;
		case "스파이":
			widgetName = `spy.html`;
			break;
	}
	let align = player.isMobile ? "middle" : "middleright";

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
				voteArray.push([p.tag.data.index, p.tag.data.votecount]);
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
	switchAllPlayersWidget(roomNum, widgetHtml);
	sendMessageToPlayerWidget(roomNum, voteArray);
}

function tagReset(roomNum) {
	let room = GAMEROOM[roomNum];
	if (!room) return;
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (room.turnCount == 0) {
			p.tag.name = p.name;
		}
		p.tag.useSkill = false;
		p.tag.data.voted = false;
		p.tag.healTarget = false;
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
		let player = App.getPlayerByID(playerData.id);
		if (!player) continue;
		if (player.tag.data.joined == true) {
			let room = GAMEROOM[player.tag.data.roomNum];
			let startPoint = room.startPoint;
			player.moveSpeed = 0;
			if (player.tag.name) {
				player.name = `${player.tag.name}`;
			}
			player.spawnAt(startPoint[0] + coordinates[player.tag.data.index]?.x, startPoint[1] + coordinates[player.tag.data.index]?.y);
			player.sprite = null;
			player.hidden = false;
			player.chatEnabled = true;
			// p.chatGroupID = 0;
			player.sendUpdated();
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
			let x = startPoint[0] + coordinates[p.tag.data.index].x;
			let y = startPoint[1] + coordinates[p.tag.data.index].y;
			Map.putObject(x, y - 1, silhouette);
			Map.putObject(x, y, blankObject);
			room.SilhouetteTracker.push([x, y - 1]);
		}
	}
}

function nightResult(roomNum) {
	// App.sayToAll(`턴 : ${turnCount}`);
	let room = GAMEROOM[roomNum];
	let text = "";
	room.turnCount++;
	// if (room.turnCount * 1 > 1) {
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.joined == true) {
			if (p.tag.role == "영매") {
				if (p.tag.ghostWidget) {
					p.tag.ghostWidget.destroy();
					p.tag.ghostWidget = null;
				}
			}
		}
	}

	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.joined == true) {
			if (p.tag.mafiaTarget == true) {
				if (p.tag.healTarget == true) {
					text += `💖 어느 훌륭하신 의사가 기적적으로 시민을 살렸습니다.`;
				} else {
					text += `☠️ 이번 밤에 ${p.title}가 죽었습니다.`;
					dead(p);
				}
				text += `\n`;
			}
		}
	}
	if (text == "") {
		sendMessageToRoom(roomNum, `✨ 이번 밤에 아무도 죽지 않았습니다.`);
	} else {
		sendMessageToRoom(roomNum, `${text}`);
	}

	// }
}

function gameEndCheck(roomNum) {
	let room = GAMEROOM[roomNum];
	if (room.start) {
		let mafiaCount = 0;
		let citizenCount = 0;
		let mafiaTeamCount = 0;
		for (let playerData of room.players) {
			let p = App.getPlayerByID(playerData.id);
			if (!p) continue;
			if (p.tag.data.joined == true) {
				if (p.tag.team == "mafia") {
					mafiaTeamCount++;
				} else {
					citizenCount++;
				}
				if (p.tag.role == "마피아") {
					// App.sayToAll(`마피아 : ${p.title}`);
					mafiaCount++;
				}
			}
		}

		// App.sayToAll(`마피아 수: ${_mafiaCount}`);

		if (mafiaTeamCount <= 0) {
			// 시민 승리
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				if (p.tag.ghostWidget) {
					p.tag.ghostWidget.destroy();
					p.tag.ghostWidget = null;
				}
				if (p.tag.data.joined == true) {
					if (p.tag.team == "마피아") {
						giveExp(p, 4);
					} else {
						giveExp(p, 5);
					}
				} else {
					if (p.tag.team == "마피아") {
						giveExp(p, 3);
					} else {
						giveExp(p, 3);
					}
				}
			}

			playSoundToRoom(roomNum, "citizenWinSound.mp3");
			widgetHtml = "winCitizen.html";
			switchAllPlayersWidget(roomNum, widgetHtml);
			App.runLater(() => {
				startState(roomNum, STATE_INIT);
			}, 5);

			return true;
		} else if (mafiaTeamCount >= citizenCount) {
			// 마피아 승리
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				if (p.tag.ghostWidget) {
					p.tag.ghostWidget.destroy();
					p.tag.ghostWidget = null;
				}
				if (p.tag.data.joined == true) {
					if (p.tag.team == "마피아") {
						giveExp(p, 12, true);
					} else {
						giveExp(p, 4, true);
					}
				} else {
					if (p.tag.team == "마피아") {
						giveExp(p, 8, true);
					} else {
						giveExp(p, 2, true);
					}
				}
			}
			playSoundToRoom(roomNum, "mafiaWinSound.mp3");
			widgetHtml = "winMafia.html";
			switchAllPlayersWidget(roomNum, widgetHtml);
			App.runLater(() => {
				startState(roomNum, STATE_INIT);
			}, 5);

			return true;
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
		p.moveSpeed = 80;
		p.sprite = null;
		p.chatEnabled = true;
		p.title = levelCalc(p);
		p.hidden = false;
		p.tag.data.joined = false;
		p.tag.role = "";
		p.tag.data.voted = false;
		p.tag.data.index = 0;
		p.tag.data.votecount = 0;
		p.tag.healTarget = false;
		p.tag.mafiaTarget = false;
		// p.chatGroupID = 0;
		p.tag.team = undefined;
		if (p.tag.name) {
			p.name = `${p.tag.name}`;
		}

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
	updatePlayerCount();
}

function nightPlayerEvent(player, text, roomNum) {
	let room = GAMEROOM[roomNum];
	let liveList = [];
	let mafiaTeamCount = 0;
	if (player.tag.widget) {
		player.tag.widget.destroy();
		player.tag.widget = null;
	}
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.joined) {
			liveList.push(parseInt(p.tag.data.index));
		}
	}
	switch (text) {
		case "의사":
			player.sendMessage(`─────────────────\n🌙 밤에는 채팅을 할 수 없습니다.\n─────────────────`, 0x00ff00);
			player.showCenterLabel("살리고 싶은 대상을 선택하세요.", 0xffffff, 0x000000, 250, 6000);
			player.tag.widget = player.showWidget("roleAction.html", "top", 400, 500);
			player.sprite = doctorSprite;
			player.tag.widget.sendMessage({
				type: "init",
				total: room.total,
				isMobile: player.isMobile,
				liveList,
				time: room.stateTimer,
				role: player.tag.role,
				myNum: player.tag.data.index,
			});
			player.tag.widget.onMessage.Add(function (player, data) {
				switch (data.type) {
					case "select":
						if (!player.tag.useSkill) {
							let targetNum = data.num;
							for (let playerData of room.players) {
								let p = App.getPlayerByID(playerData.id);
								if (!p) continue;
								if (p.tag.data.joined && p.tag.data.index == targetNum) {
									p.tag.healTarget = true;
									player.showCustomLabel(`${targetNum}번 참가자를 치료하기로 결정했습니다.`, 0xffffff, 0x000000, 300);
									player.tag.useSkill = true;
									player.tag.widget.sendMessage({
										type: "selectResponse",
										num: targetNum,
									});
									player.playSound("healSound.WAV");
									break;
								}
							}
						} else {
							player.showCustomLabel(`이미 대상을 선택했습니다.`, 0xffffff, 0x000000, 300);
						}
						break;
				}
			});
			break;

		case "마피아":
			player.sprite = mafiaSprite;
			player.showCenterLabel("처형할 대상을 선택하세요.", 0xffffff, 0x000000, 250, 6000);
			player.attackSprite = mafiaAttackSprite;
			player.tag.widget = player.showWidget("roleAction.html", "top", 400, 500);

			const teamIndexArray = [];
			mafiaTeamCount = 0;
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				if (p.tag.data.joined == true && p.tag.team == "mafia") {
					mafiaTeamCount++;
					teamIndexArray.push({
						index: p.tag.data.index,
						role: p.tag.role,
					});
				}
			}
			player.tag.widget.sendMessage({
				type: "init",
				isMobile: player.isMobile,
				total: room.total,
				liveList,
				time: room.stateTimer,
				chatEnable: mafiaTeamCount > 1,
				role: player.tag.role,
				myNum: player.tag.data.index,
				teamIndexArray: teamIndexArray,
			});

			player.tag.widget.onMessage.Add(function (player, data) {
				switch (data.type) {
					case "sendMessage":
						mafiaChatNotify(roomNum, data.num, data.message, player.name);
						break;
					case "select":
						if (!player.tag.useSkill) {
							let targetNum = data.num;
							for (let playerData of room.players) {
								let p = App.getPlayerByID(playerData.id);
								if (!p) continue;
								if (p.tag.data.joined) {
									if (p.tag.data.index == targetNum && p.tag.mafiaTarget) {
										player.showCustomLabel(`다른 마피아가 선택한 대상입니다.`, 0xffffff, 0x000000, 300);
										return;
									}
									if (p.tag.data.index == targetNum) {
										p.tag.mafiaTarget = true;
										player.showCustomLabel(`${targetNum}번 참가자를 죽이기로 결정했습니다.`, 0xffffff, 0x000000, 300);
										player.tag.useSkill = true;
										player.tag.widget.sendMessage({
											type: "selectResponse",
											num: targetNum,
										});
										playSoundToRoom(player.tag.data.roomNum, "gunSound.WAV");
										break;
									}
								}
							}
						} else {
							player.showCustomLabel(`이미 대상을 선택했습니다.`, 0xffffff, 0x000000, 300);
						}

						break;
				}
			});
			player.sendMessage(`─────────────────\n🌙 밤에는 마피아팀끼리 채팅을 공유할 수 있습니다.\n─────────────────`, 0x00ff00);
			break;

		case "경찰":
			player.showCenterLabel("조사하고 싶은 대상을 선택하세요", 0xffffff, 0x000000, 250, 6000);
			player.sendMessage(`─────────────────\n🌙 밤에는 채팅을 할 수 없습니다.\n─────────────────`, 0x00ff00);
			player.sprite = policeSprite;

			player.tag.widget = player.showWidget("roleAction.html", "top", 400, 500);
			player.tag.widget.sendMessage({
				type: "init",
				isMobile: player.isMobile,
				total: room.total,
				liveList,
				time: room.stateTimer,
				role: player.tag.role,
				myNum: player.tag.data.index,
			});
			player.tag.widget.onMessage.Add(function (player, data) {
				switch (data.type) {
					case "select":
						if (!player.tag.useSkill) {
							let targetNum = data.num;
							for (let playerData of room.players) {
								let p = App.getPlayerByID(playerData.id);
								if (!p) continue;
								if (p.tag.data.joined) {
									if (p.tag.data.index == targetNum) {
										if (p.tag.role == "마피아") {
											player.showCustomLabel(`${p.title}는 마피아입니다!`, 0xffffff, 0x000000, 300, 6000);
										} else {
											player.showCustomLabel(`${p.title}는 마피아가 아닙니다.`, 0xffffff, 0x000000, 300, 6000);
										}
										player.tag.useSkill = true;
										player.tag.widget.sendMessage({
											type: "selectResponse",
											num: targetNum,
										});
										player.playSound("policeAttackSound.mp3");
									}
								}
							}
						} else {
							player.showCustomLabel(`이미 대상을 선택했습니다.`, 0xffffff, 0x000000, 300);
						}
						break;
				}
			});

			// player.moveSpeed = 80;
			// player.attackSprite = policeAttackSprite;
			// player.attackType = 3;
			// player.attackParam1 = 2;
			// player.attackParam2 = 4;
			break;
		case "영매":
			player.sendMessage(`─────────────────\n🌙 죽은 혼령들과 대화할 수 있습니다.\n─────────────────`, 0x00ff00);
			player.tag.ghostWidget = player.showWidget("roleAction.html", "top", 400, 500);
			player.tag.ghostWidget.sendMessage({
				type: "init",
				myNum: player.tag.data.index,
				time: room.stateTimer,
				role: player.tag.role,
				isMobile: player.isMobile,
				chatEnable: true,
			});
			player.tag.ghostWidget.onMessage.Add(function (player, data) {
				switch (data.type) {
					case "sendMessage":
						ghostChatNotify(roomNum, data.num, data.message, player.name);
						break;
				}
			});
			break;
		case "정치인":
			player.sendMessage(`─────────────────\n🌙 밤에는 채팅을 할 수 없습니다.\n─────────────────`, 0x00ff00);
			break;
		case "스파이":
			mafiaTeamCount = 0;
			for (let playerData of room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (!p) continue;
				if (p.tag.data.joined == true && p.tag.team == "mafia") {
					mafiaTeamCount++;
				}
			}
			player.showCenterLabel("조사하고 싶은 대상을 선택하세요.", 0xffffff, 0x000000, 250, 6000);
			player.sprite = spySprite;
			player.tag.widget = player.showWidget("roleAction.html", "top", 400, 500);
			player.tag.widget.sendMessage({
				type: "init",
				myNum: player.tag.data.index,
				total: room.total,
				liveList,
				time: room.stateTimer,
				isMobile: player.isMobile,
				chatEnable: mafiaTeamCount > 1 && player.tag.team == "mafia",
				role: player.tag.role,
			});
			player.tag.widget.onMessage.Add(function (player, data) {
				switch (data.type) {
					case "sendMessage":
						if (player.tag.team == "mafia") {
							mafiaChatNotify(roomNum, data.num, data.message, player.name);
						}
						break;
					case "select":
						if (!player.tag.useSkill) {
							let targetNum = data.num;
							for (let playerData of room.players) {
								let p = App.getPlayerByID(playerData.id);
								if (!p) continue;
								if (p.tag.data.joined) {
									if (p.tag.data.index == targetNum) {
										player.playSound("policeAttackSound.mp3");
										if (p.tag.role == "마피아") {
											player.tag.widget.sendMessage({ type: "chatEnable" });
											mafiaChatNotify(roomNum, 0, `🕵️‍♀️ ${player.tag.data.index}번 참가자(스파이)가 채팅에 합류했습니다.`);
											// player.showCustomLabel(`🕵️‍♀️ ${p.title}의 직업은 ${p.tag.role}입니다.\n마피아 팀에 합류하여 채팅을 할 수 있게되었습니다.\n능력을 한번 더 사용할 수 있습니다.`, 0xffffff, 0x000000, 200, 6000);
											player.tag.team = "mafia";
										} else {
											player.showCustomLabel(`${p.title}의 직업은 ${p.tag.role}입니다.`, 0xffffff, 0x000000, 300, 6000);
											player.tag.useSkill = true;
											player.tag.widget.sendMessage({
												type: "selectResponse",
												num: targetNum,
											});
										}
									}
								}
							}
						} else {
							player.showCustomLabel(`이미 대상을 선택했습니다.`, 0xffffff, 0x000000, 300);
						}

						break;
				}
			});

			// player.moveSpeed = 80;
			// player.attackSprite = spySprite;
			// player.attackType = 3;
			// player.attackParam1 = 2;
			// player.attackParam2 = 4;
			if (player.tag.team && player.tag.team == "mafia") {
				// player.chatEnabled = true;
				// player.chatGroupID = MAFIA_CHATTING_CHANNEL;
				player.sendMessage(`─────────────────\n🌙 밤에는 마피아팀끼리 채팅을 공유할 수 있습니다.\n─────────────────`, 0x00ff00);
			} else {
				player.sendMessage(`─────────────────\n🌙 밤에는 채팅을 할 수 없습니다.\n─────────────────`, 0x00ff00);
			}
			break;
		default:
			if (player.isMobile) {
				player.tag.widget = player.showWidget("night.html", "top", 400, 260);
			} else {
				player.tag.widget = player.showWidget("night.html", "topright", 400, 260);
			}
			player.tag.widget.sendMessage({
				total: room.total,
				alive: room.alive,
				timer: room.stateTimer,
				description: "마피아, 경찰, 의사는 밤에 움직일 수 있습니다.",
			});
			player.sendMessage(`─────────────────\n🌙 밤에는 채팅을 할 수 없습니다.\n─────────────────`, 0x00ff00);
			break;
	}
	// if (player.tag.name) {
	// 	player.name = `${player.tag.name}(${text})[${player.tag.data.index}번]`;
	// }

	player.sendUpdated();
}

function giveExp(player, point, mafiaWin = false) {
	if (!player.isGuest) {
		if (player.storage == null) {
			player.storage = JSON.stringify({
				exp: 0,
			});
			player.save();
		}

		const pStorage = JSON.parse(player.storage);

		if (!pStorage.hasOwnProperty("mafiaWin")) {
			pStorage.mafiaWin = 0;
		}
		if (!pStorage.hasOwnProperty("mafiaLose")) {
			pStorage.mafiaLose = 0;
		}
		if (!pStorage.hasOwnProperty("citizenWin")) {
			pStorage.citizenWin = 0;
		}

		if (!pStorage.hasOwnProperty("citizenLose")) {
			pStorage.citizenLose = 0;
		}

		if (mafiaWin) {
			if (player.tag.role == "스파이") {
				pStorage.mafiaWin++;
			} else if (player.tag.team == "mafia") {
				pStorage.mafiaWin++;
			} else {
				pStorage.citizenLose++;
			}
		} else {
			if (player.tag.role == "스파이") {
				pStorage.mafiaLose++;
			} else if (player.tag.team == "mafia") {
				pStorage.mafiaLose++;
			} else {
				pStorage.citizenWin++;
			}
		}

		player.showCustomLabel(`경험치: ${point} 흭득`);
		pStorage.exp += point;

		player.storage = JSON.stringify(pStorage);
		player.save();
		// App.sayToAll(JSON.parse(p.storage).exp);
	}
	// App.sayToAll(App.worldHashID);
}

function levelCalc(player) {
	if (player.role >= 3000) {
		return "운영자";
	} else if (!player.isGuest) {
		let pStorage = JSON.parse(player.storage);
		let title = "";
		if (player.role == 0) {
			player.titleColor = 0x00ff00;
		} else {
			player.titleColor = 0xffffff;
		}
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
		title += `Lv.${i}`;
		title += `\n마피아 ${pStorage.mafiaWin || 0}승 ${pStorage.mafiaLose || 0}패`;
		title += `\n시민 ${pStorage.citizenWin || 0}승 ${pStorage.citizenLose || 0}패`;
		player.tag.data.level = `Lv.${i}`;
		return title;
	} else {
		return "비로그인 유저";
	}
}

function switchAllPlayersWidget(roomNum, htmlName) {
	let room = GAMEROOM[roomNum];
	for (let playerData of room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.widget) {
			p.tag.widget.destroy();
			p.tag.widget = null;
		}

		if (htmlName == "WatingRoom.html") {
			if (p.isMobile) {
				p.tag.widget = p.showWidget("WatingRoom.html", "top", 400, 350);
			} else {
				p.tag.widget = p.showWidget("WatingRoom.html", "topright", 400, 350);
			}
			p.tag.widget.sendMessage({ type: "setID", id: p.id, isMobile: p.isMobile });
			p.tag.widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));
		} else {
			if (p.isMobile) {
				p.tag.widget = p.showWidget(htmlName, "top", 400, 260);
			} else {
				p.tag.widget = p.showWidget(htmlName, "topright", 400, 260);
			}
		}
	}
	// if (_state != STATE_VOTE_RESULT) {
	// 	sendMessageToPlayerWidget();
	// }
}

function sendMessageToPlayerWidget(roomNum, data = null) {
	let room = GAMEROOM[roomNum];
	if (!room) return;
	if (room.start) {
		room.players.forEach((data) => {
			if (data.joined) room.alive++;
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
						alive: room.alive,
						timer: room.stateTimer,
						// timer: 1000,
						description: "투표 전까지 이야기를 나누세요.",
						isMobile: p.isMobile,
					});
					if (p.tag.data.joined) {
						p.sendMessage(`🌞 ${room.turnCount}번째 아침`, 0x00ff00);
					}
					break;
				case STATE_VOTE:
					let liveList = [];
					for (let playerData of room.players) {
						let p = App.getPlayerByID(playerData.id);
						if (!p) continue;
						if (p.tag.data.joined) {
							liveList.push(parseInt(p.tag.data.index));
						}
					}
					p_widget.sendMessage({
						type: "init",
						total: room.total,
						alive: room.alive,
						timer: room.stateTimer,
						liveList: liveList,
						description: "",
						isMobile: p.isMobile,
					});

					p_widget.onMessage.Add(function (player, data) {
						if (player.tag.data.joined) {
							let room = GAMEROOM[player.tag.data.roomNum];
							if (data.vote) {
								for (let playerData of room.players) {
									let p = App.getPlayerByID(playerData.id);
									if (!p) continue;
									if (p.tag.data.index == data.vote) {
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
						isMobile: p.isMobile,
					});
					break;
				case STATE_PLAYING_NIGHT:
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
				player.showCenterLabel("이미 참여중입니다.", 0xffffff, 0x000000, 300, 5000);
				return;
			}
			roomNum = parseInt(data.roomNum);
			room = GAMEROOM[roomNum];
			if (room.start) {
				player.showCenterLabel("이미 게임을 시작했습니다.", 0xffffff, 0x000000, 300, 5000);
				return;
			}
			let roomPlayers = room.players;
			roomPlayers.forEach((data) => {
				if (data.id == player.id) {
					player.showCenterLabel("이미 참여중입니다.", 0xffffff, 0x000000, 300, 5000);
					return;
				}
			});

			let playerCount = roomPlayers.length;
			if (playerCount < 8) {
				if (player.tag.kickUntil) {
					if (player.tag.kickUntil > Time.GetUtcTime()) {
						player.showCenterLabel("강퇴를 당해서 30초간 게임에 참가할 수 없습니다.");
						return;
					}
				}
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
				if (target) {
					target.tag.data.kickCount--;
				}
			} else {
				player.tag.data.kickList ? player.tag.data.kickList.push(data.id) : (player.tag.data.kickList = [data.id]);
				sendMessageToPlayerWidget(roomNum, {
					type: "kick",
					id: data.id,
				});
				let target = App.getPlayerByID(data.id);
				if (target) {
					target?.tag.data.kickCount ? target.tag.data.kickCount++ : (target.tag.data.kickCount = 1);
					if (target.tag.data.kickCount >= 3) {
						quitPlayer(target, true);
					}
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
		player.showCenterLabel(message, 0xffffff, 0x000000, 300, 4000);
	}
}

function sendMessageToRoom(roomNum, message) {
	let gameRoom = GAMEROOM[roomNum];
	for (let playerData of gameRoom.players) {
		let player = App.getPlayerByID(playerData.id);
		if (!player) continue;
		player.sendMessage(message, 0x00ff00);
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

function quitPlayer(player, kick = false) {
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

	if (kick) {
		player.tag.kickUntil = Time.GetUtcTime() + 30000;
	}

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
	p.spawnAt(parseInt(Math.random() * 13 + 63), parseInt(Math.random() * 4 + 42));
}

function mafiaChatNotify(roomNum, num, message, name) {
	let players = GAMEROOM[roomNum].players;
	for (let i = 0; i < players.length; i++) {
		let player = App.getPlayerByID(players[i].id);
		if (!player) return;
		if (player.tag.team == "mafia") {
			if (num != player.tag.data.index) {
				if (player.tag.widget) {
					player.tag.widget.sendMessage({
						type: "chatNotify",
						name: name,
						num,
						message,
					});
				}
			}
		}
	}
}

function ghostChatNotify(roomNum, num, message, name) {
	let players = GAMEROOM[roomNum].players;
	for (let i = 0; i < players.length; i++) {
		let player = App.getPlayerByID(players[i].id);
		if (!player) return;
		if (!player.tag.data.joined || player.tag.role == "영매") {
			if (num != player.tag.data.index) {
				if (player.tag.ghostWidget) {
					player.tag.ghostWidget.sendMessage({
						type: "chatNotify",
						name: name,
						num,
						message,
					});
				}
			}
		}
	}
}
