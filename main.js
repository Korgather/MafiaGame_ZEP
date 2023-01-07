const STATE_INIT = 3000;
const STATE_READY = 3001;
const STATE_PLAYING_NIGHT = 3002;
const STATE_PLAYING_DAY = 3003;
const STATE_VOTE = 3004;
const STATE_VOTE_RESULT = 3005;
const STATE_END = 3006;
const coordinates = {
	1: { x: 28, y: 16 },
	2: { x: 29, y: 21 },
	3: { x: 28, y: 26 },
	4: { x: 21, y: 26 },
	5: { x: 20, y: 21 },
	6: { x: 21, y: 16 },
};

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

const GAMEROOM = {
	1: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: [18, 17],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
	},
	2: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: [18, 17],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
	},
	3: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: [18, 17],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
	},
	4: {
		start: false,
		state: STATE_INIT,
		stateTimer: 0,
		startPoint: [18, 17],
		players: [],
		readyCount: 0,
		tickTockSoundOn: false,
		turnCount: 0,
		alive: 0,
		total: 0,
	},
};

let _playerCount = 0;
let _players = App.players;
let _start = false;
let _timer = 0;
let _stateTimer = 0;
let _state = STATE_INIT;
let _widget = null;

let _turnCount = 0;
let _readyCount = 0;

let _mafiaCount = 0;
let _citizenCount = 0;
let _tickTockSoundOn = false;

const spawnPoint = [25, 40];

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
	p.spawnAt(parseInt(Math.random() * 14 + 18), parseInt(Math.random() * 11 + 37));
	_players = App.players;
	p.tag = {
		data: {
			id: p.id,
			name: p.name,
			level: levelCalc(p),
		},
	};
	if (p.storage == null) {
		p.storage = JSON.stringify({
			exp: 0,
		});
		p.save();
	}

	p.tag.widget = p.showWidget("WatingRoom.html", "top", 400, 350);
	p.tag.widget.sendMessage({ type: "setID", id: p.id });
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
				room.playerCount--;
				if (p.tag.data.ready) {
					room.readyCount--;
				}
				let kickList = p.tag.data.kickList;
				sendMessageToPlayerWidget(p.tag.data.roomNum, {
					type: "leave",
					id: p.id,
					kickList: p.tag.data.kickList,
				});
				if (kickList) {
					for (let id of kickList) {
						let target = App.getPlayerByID(id);
						if (target) {
							target.tag.data.kickCount--;
						}
					}
				}
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
	if (text == "/경험치") {
		giveExp(player, 10);
	}

	player.sendUpdated();
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

	for (let roomNum of GAMEROOM) {
		let gameRoom = GAMEROOM[roomNum];
		if (gameRoom.start) continue;
		if (gameRoom.stateTimer > 0) {
			gameRoom.stateTimer -= dt;
			if (gameRoom.state != STATE_READY && _tickTockSoundOn == false) {
				if (gameRoom.stateTimer < 9) {
					_tickTockSoundOn = true;
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
});

App.onObjectAttacked.Add(function (p, x, y) {
	let target = null;
	let targetNum = 0;
	if (p.tag.role == "마피아" || p.tag.role == "의사" || p.tag.role == "경찰") {
		targetNum = Object.keys(coordinates).find((key) => JSON.stringify(coordinates[key]) === JSON.stringify({ x: x, y: y }));

		p.moveSpeed = 0;
		p.attackType = 2;
		p.attackSprite = null;
		p.attackParam1 = 2;
		p.attackParam2 = 3;
		p.sendUpdated();
		p.spawnAt(coordinates[p.tag.data.title].x, coordinates[p.tag.data.title].y);
	} else return;

	if (targetNum === undefined) return;

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
				p.showCustomLabel(`${target.title}의 직업은 ${targetRole}입니다.`, 0xffffff, 0x000000, 300, 6000);
				break;
			case "마피아":
				App.playSound("gunSound.WAV");
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
	let roomNum = player.tag.roomNum;
	let room = GAMEROOM[roomNum];

	if (player.tag.role != "마피아") {
		showLabelToRoom(roomNum, `${player.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`);
		giveExp(player, 2);
	} else {
		showLabelToRoom(roomNum, `${player.name} 님이 처형당했습니다. 그는 마피아였습니다!`);
	}

	player.moveSpeed = 80;
	player.tag.role = "";
	player.title = "유령";
	player.tag.healed = false;
	player.tag.mafiaTarget = false;
	player.tag.data.votecount = 0;
	player.tag.data.joined = false;
	_playerCount--;
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
			Map.clearAllObjects();
			widgetHtml = "WatingRoom.html";

			updatePlayerWidget(roomNum, widgetHtml);
			room.turnCount = 0;
			room.readyCount = 0;

			for (let playerData in room.players) {
				let p = App.getPlayerByID(playerData.id);
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

				p.spawnAt(parseInt(Math.random() * 14 + 18), parseInt(Math.random() * 10 + 37));
				p.sendUpdated();
			}

			break;
		case STATE_READY:
			room.stateTimer = 5;
			room.start = true;

			const roleArray = createRole(6);
			let arrIndex = 0;
			for (let playerData in room.players) {
				let p = App.getPlayerByID(playerData.id);
				let pStorage = JSON.parse(p.storage);
				pStorage["playCount"] ? pStorage["playCount"]++ : (pStorage["playCount"] = 1);
				p.storage = JSON.stringify(pStorage);
				if (p.tag.data.joined == true) {
					// p.spawnAt(coordinates[arrIndex + 1].x, coordinates[arrIndex + 1].y);
					p.title = `${arrIndex + 1} 번 참가자`;
					p.tag.data.title = arrIndex + 1;
					setRole(p, arrIndex, roleArray);
					arrIndex++;
				}
			}

			sendMessageToPlayerWidget();

			break;
		case STATE_PLAYING_DAY:
			nightResult(++_turnCount);
			if (gameEndCheck(roomNum) == false) {
				tagReset();
				// destroyAppWidget();
				clearHidden();
				Map.clearAllObjects();
				App.playSound("morningSound.wav");
				room.stateTimer = 10 * _playerCount;
				widgetHtml = "morning.html";
				updatePlayerWidget(widgetHtml);
				// sendMessageToPlayerWidget();
			}
			break;
		case STATE_VOTE:
			if (gameEndCheck(roomNum) == false) {
				// destroyAppWidget();
				App.playSound("voteSound.wav");
				room.stateTimer = 17;
				// 투표가 시작되었습니다.
				widgetHtml = "vote.html";
				updatePlayerWidget(widgetHtml);
				// sendMessageToPlayerWidget();
			}
			break;
		case STATE_VOTE_RESULT:
			if (gameEndCheck(roomNum) == false) {
				room.stateTimer = 7;
				voteResult();
			}
			break;
		case STATE_PLAYING_NIGHT:
			if (gameEndCheck(roomNum) == false) {
				// destroyAppWidget();
				tagReset();
				createSilhouette();
				allHidden();
				room.stateTimer = 17;
				App.playSound("nightSound.mp3");
				widgetHtml = "night.html";
				updatePlayerWidget(widgetHtml);
				// sendMessageToPlayerWidget();

				for (let playerData in room.players) {
					let p = App.getPlayerByID(playerData.id);
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
	let index = -1;
	let maxCount = 0;
	let voteArray = [];
	for (let playerData of room.players) {
		p = App.getPlayerByID(playerData.id);
		if (!p) continue;
		if (p.tag.data.votecount > max) {
			max = p.tag.data.votecount;
			index = i;
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

	if (index == -1 || maxCount > 1) {
		showLabelToRoom(roomNum, `투표 결과 아무도 죽지 않았습니다.`);
	} else {
		dead(_players[index]);
	}

	// destroyAppWidget();
	widgetHtml = "voteResult.html";
	updatePlayerWidget(widgetHtml);
	sendMessageToPlayerWidget(voteArray);
}

function tagReset(roomNum) {
	let room = GAMEROOM[roomNum];
	for (let playerData in room.players) {
		let p = App.getPlayerByID(playerData.id);
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
	for (let playerData in room.players) {
		let p = App.getPlayerByID(playerData.id);
		p.hidden = true;
		p.sendUpdated();
	}
}

function clearHidden(roomNum) {
	let room = GAMEROOM[roomNum];
	for (let playerData in room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (p.tag.data.joined == true) {
			p = _players[i];
			p.moveSpeed = 0;
			p.spawnAt(coordinates[p.tag.data.title]?.x, coordinates[p.tag.data.title]?.y);
			p.sprite = null;
			p.hidden = false;
			p.chatEnabled = true;
			p.sendUpdated();
		}
	}
}

function createSilhouette(roomNum) {
	let room = GAMEROOM[roomNum];
	for (let playerData in room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (p.tag.data.joined == true) {
			let x = coordinates[p.tag.data.title].x;
			let y = coordinates[p.tag.data.title].y;
			Map.putObject(x, y - 1, silhouette);
			Map.putObject(x, y, blankObject);
		}
	}
}

function nightResult(roomNum) {
	// App.sayToAll(`턴 : ${turnCount}`);
	let room = GAMEROOM[roomNum];
	if (room.turnCount * 1 > 1) {
		for (let playerData in room.players) {
			let p = App.getPlayerByID(playerData.id);
			if (p.tag.data.joined == true) {
				if (p.tag.mafiaTarget == true) {
					if (p.tag.healed == true) {
						App.showCustomLabel(`어느 훌륭하신 의사가 기적적으로 시민을 살렸습니다.`, 0xffffff, 0x000000, 300, 5000);
						return;
					} else {
						App.showCustomLabel(`이번 밤에 ${p.title}가 죽었습니다.`, 0xffffff, 0x000000, 300, 5000);
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
		for (let playerData in room.players) {
			let p = App.getPlayerByID(playerData.id);
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
			for (let playerData in room.players) {
				let p = App.getPlayerByID(playerData.id);
				if (p.tag.data.joined == true) {
					if (p.tag.role == "마피아") {
						giveExp(p, 2);
					} else {
						giveExp(p, 5);
					}
				}
			}
			// destroyAppWidget();
			gameReset(roomNum);
			App.playSound("citizenWinSound.mp3");
			widgetHtml = "winCitizen.html";
			updatePlayerWidget(widgetHtml);

			App.runLater(() => {
				startState(STATE_INIT);
			}, 8);
			return true;
		} else if (mafiaCount == 1) {
			if (mafiaCount == citizenCount) {
				// 마피아 승리
				for (let playerData in room.players) {
					let p = App.getPlayerByID(playerData.id);
					if (p.tag.data.joined == true) {
						if (p.tag.role == "마피아") {
							giveExp(p, 10);
						} else {
							giveExp(p, 5);
						}
					}
				}
				App.playSound("mafiaWinSound.mp3");
				// destroyAppWidget();
				gameReset(roomNum);
				widgetHtml = "winMafia.html";
				updatePlayerWidget(widgetHtml);

				App.runLater(() => {
					startState(roomNum, STATE_INIT);
				}, 8);

				return true;
			}
		}
	}
	return false;
}

function gameReset(roomNum) {
	let room = GAMEROOM[roomNum];
	room.start = false;
	room.playerCount = 0;

	for (let playerData in room.players) {
		let p = App.getPlayerByID(playerData.id);
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
		p.title = levelCalc(p);
		p.hidden = false;
		p.tag.data.joined = false;
		p.tag.role = "";
		p.tag.data.voted = false;
		p.tag.data.title = 0;
		p.tag.data.votecount = 0;
		p.tag.healed = false;
		p.tag.mafiaTarget = false;

		p.spawnAt(parseInt(Math.random() * 14 + 18), parseInt(Math.random() * 11 + 37));
	}
	p.sendUpdated();
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
		let i = 0;
		let myExp = JSON.parse(player.storage).exp;

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
	for (let playerData in room.players) {
		let p = App.getPlayerByID(playerData.id);
		if (p.tag.widget) {
			p.tag.widget.destroy();
			p.tag.widget = null;
		}
		p.tag.widget = p.showWidget(htmlName, "top", 400, 350);
		p.tag.widget.sendMessage({ type: "setID", id: p.id });
		p.tag.widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));
	}
	// if (_state != STATE_VOTE_RESULT) {
	// 	sendMessageToPlayerWidget();
	// }
}

function sendMessageToPlayerWidget(roomNum, data = null) {
	let room = GAMEROOM[roomNum];
	for (let roomPlayerData of room.players) {
		let id = roomPlayerData.id;
		let p = App.getPlayerByID(id);
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
						total: 6,
						current: 6,
						description: `마피아 게임이 곧 시작됩니다.`,
					});
					break;
				case STATE_PLAYING_DAY:
					p_widget.sendMessage({
						total: 6,
						alive: room.mafiaCount + room.citizenCount,
						timer: room.stateTimer,
						description: "투표 전까지 이야기를 나누세요.",
					});
					break;
				case STATE_VOTE:
					let liveList = [];
					for (let i in _players) {
						let p = _players[i];

						if (p.tag.data.joined) {
							liveList.push(parseInt(p.tag.data.title));
						}
					}
					p_widget.sendMessage({
						total: 6,
						alive: room.mafiaCount + room.citizenCount,
						timer: room.stateTimer,
						liveList: liveList,
						description: "",
					});

					p_widget.onMessage.Add(function (player, data) {
						if (player.tag.data.joined) {
							if (data.vote) {
								for (let i in _players) {
									let p = _players[i];
									if (p.tag.data.title == data.vote) {
										p.tag.data.votecount++;
									}
								}
								player.tag.widget.destroy();
								player.tag.widget = null;
							}
						} else {
							player.showCustomLabel("투표 권한이 없습니다");
						}
					});

					break;
				case STATE_VOTE_RESULT:
					p_widget.sendMessage({
						result: data,
					});
					break;
				case STATE_PLAYING_NIGHT:
					p_widget.sendMessage({
						total: 6,
						alive: room.mafiaCount + room.citizenCount,
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
	switch (data.type) {
		case "join":
			if (_start) return;
			if (player.tag.data.joined) return;
			roomNum = parseInt(data.roomNum);
			let room = GAMEROOM[roomNum];
			let playerCount = room.players.length;
			if (playerCount < 7) {
				if (!player.tag.data.joined) {
					player.tag.data.joined = true;
					player.tag.data.roomNum = roomNum;
					room.players.push(player.tag.data);
					App.playSound("joinSound.mp3");
					sendMessageToPlayerWidget(roomNum, {
						type: "join",
						roomData: room,
						id: player.id,
					});
				}
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
				_readyCount++;
				if (_readyCount == 6) {
					App.showCustomLabel("게임이 곧 시작됩니다.", 0xffffff, 0x000000, 300);
					startState(STATE_READY);
				}
			}

			break;
		case "cancle-ready":
			if (player.tag.data.ready) {
				_readyCount--;
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
				target?.tag.kickCount ? target.tag.data.kickCount++ : (target.tag.data.kickCount = 1);
				if (target.tag.data.kickCount >= 3) {
					target.tag.data.joined = false;

					target.tag.data.kickCount = 0;
					_playerCount--;
					if (target.tag.data.ready) {
						_readyCount--;
						target.tag.data.ready = false;
					}
					target.tag.widget.sendMessage(roomNum, {
						type: "kicked",
					});

					sendMessageToPlayerWidget(roomNum, {
						type: "leave",
						id: target.id,
						kickList: target.tag.data.kickList,
					});
					target.tag.data.kickList = [];
				}
			}
			break;
	}
}

function MafiaGame(p) {
	if (p.tag.widget) {
		switch (_state) {
			case STATE_INIT:
				for (let player of _players) {
					if (player.tag.data.joined == true) {
						let tpStorage = JSON.parse(player.storage);
						let data = {
							id: player.id,
							name: player.name,
							level: levelCalc(player),
							runCount: tpStorage.runCount,
							isReady: player.tag.data.ready,
							kickCount: player.tag.data.kickCount,
						};
						p.tag.widget.sendMessage({ type: "init", data: data });
					}
				}

				p.tag.widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));

				break;
			case STATE_PLAYING_DAY:
				p.tag.widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "투표 전까지 이야기를 나누세요.",
				});
				break;
			case STATE_VOTE:
				p.tag.widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "채팅창에 투표할 플레이어의 번호를 적으세요.(자신에게 투표 불가)",
				});

				break;
			case STATE_PLAYING_NIGHT:
				p.tag.widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "마피아, 경찰, 의사는 밤에 움직일 수 있습니다.",
				});

				break;
		}
	}
}

class GamaPlayer {
	constructor(player) {
		let pStorage = JSON.parse(player.storage);
		this.id = player.id;
		this.name = player.name;
		this.level = levelCalc(player);
		this.runCount = pStorage.runCount;
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

	for (let playerID of gameRoom.players) {
		let player = App.getPlayerByID(playerID);
		if (!player) continue;
		player.playSound(soundName);
	}
}
