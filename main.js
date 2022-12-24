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
let _widgetHtml = "WatingRoom.html";

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

App.onJoinPlayer.Add(function (p) {
	p.spawnAt(spawnPoint[0], spawnPoint[1]);
	_players = App.players;
	p.tag = {
		joined: false,
		role: "",
		voted: false,
		title: 0,
		votecount: 0,
		healed: false,
		mafiaTarget: false,
		widget: null,
	};
	if (p.storage == null) {
		p.storage = JSON.stringify({
			exp: 0,
		});
		p.save();
	}
	p.tag.widget = p.showWidget(_widgetHtml, "top", 400, 350);
	p.tag.widget.sendMessage({ type: "setID", id: p.id });
	p_widget = p.tag.widget;

	if (p_widget) {
		switch (_state) {
			case STATE_INIT:
				for (let player of _players) {
					if (player.tag.joined == true) {
						let tpStorage = JSON.parse(player.storage);
						let data = {
							id: player.id,
							name: player.name,
							level: levelCalc(player),
							runCount: tpStorage.runCount,
							isReady: player.tag.ready,
							kickCount: player.tag.kickCount,
						};
						p_widget.sendMessage({ type: "init", data: data });
					}
				}

				p_widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));

				break;
			case STATE_PLAYING_DAY:
				p_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "투표 전까지 이야기를 나누세요.",
				});
				break;
			case STATE_VOTE:
				p_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "채팅창에 투표할 플레이어의 번호를 적으세요.(자신에게 투표 불가)",
				});

				break;
			case STATE_PLAYING_NIGHT:
				p_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "마피아, 경찰, 의사는 밤에 움직일 수 있습니다.",
				});

				break;
		}
		// }, 2);

		// _widget.id;
	}

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
	if (App.playerCount == 0) {
		App.httpGet("https://api.metabusstation.shop/api/v1/posts/zep/playercount?hashId=" + App.mapHashID + "&playerCount=" + 0, {}, (a) => {});
	}

	switch (_state) {
		case STATE_INIT:
			if (p.tag.joined == true) {
				_playerCount--;
				if (p.tag.ready) {
					_readyCount--;
				}
				let kickList = p.tag.kickList;
				sendMessageToPlayerWidget({
					type: "leave",
					id: p.id,
					kickList: p.tag.kickList,
				});
				if (kickList) {
					for (let id of kickList) {
						let target = App.getPlayerByID(id);
						if (target) {
							target.tag.kickCount--;
						}
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

	_players = App.players;
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

App.onStart.Add(function () {
	startState(STATE_INIT);
});

App.onSay.add(function (player, text) {
	if (text == "/경험치") {
		giveExp(player, 10);
	}

	player.sendUpdated();
	// if (text == "참가") {
	// 	if (_start == true) {
	// 		player.showCustomLabel("이미 게임이 진행중 입니다.");
	// 	}
	// }

	// if (_state == STATE_VOTE) {
	// 	if (player.tag.joined == true && player.tag.voted == false) {
	// 		for (let i in _players) {
	// 			p = _players[i];
	// 			if (p.tag.joined == true && p.title != 0 && p.title != player.title) {
	// 				if (text * 1 == p.tag.title) {
	// 					p.tag.votecount++;
	// 					player.tag.voted = true;
	// 					// App.sayToAll(`${p.name}: ${p.tag.votecount} 표`);
	// 					player.sendUpdated();
	// 				}
	// 			}
	// 		}
	// 	}
	// }

	if (_state == STATE_PLAYING_NIGHT) {
		if (player.tag.joined == true) {
		}
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

	if (_stateTimer > 0) {
		_stateTimer -= dt;
		if (_state != STATE_READY && _tickTockSoundOn == false) {
			if (_stateTimer < 9) {
				_tickTockSoundOn = true;
				App.playSound("tickTockSound.mp3");
			}
		}
	}

	if (_stateTimer < 0) {
		_stateTimer = 0;
		switch (_state) {
			case STATE_READY:
				startState(STATE_PLAYING_DAY);
				break;
			case STATE_PLAYING_DAY:
				startState(STATE_VOTE);
				break;
			case STATE_VOTE:
				startState(STATE_VOTE_RESULT);
				break;
			case STATE_VOTE_RESULT:
				startState(STATE_PLAYING_NIGHT);
				break;
			case STATE_PLAYING_NIGHT:
				startState(STATE_PLAYING_DAY);
				break;
		}
	}
});

App.onObjectAttacked.Add(function (p, x, y) {
	// p.showCustomLabel(`오브젝트를 때렸다.`, 0xffffff, 0x000000, 115);
	let target = null;
	let targetNum = 0;
	if (p.tag.role == "마피아" || p.tag.role == "의사" || p.tag.role == "경찰") {
		// App.sayToAll(`오브젝트를 때렸다. 좌표 ${x}, ${y}`);

		targetNum = Object.keys(coordinates).find((key) => JSON.stringify(coordinates[key]) === JSON.stringify({ x: x, y: y }));

		p.moveSpeed = 0;
		p.attackType = 2;
		p.attackSprite = null;
		p.attackParam1 = 2;
		p.attackParam2 = 3;
		p.sendUpdated();
		p.spawnAt(coordinates[p.tag.title].x, coordinates[p.tag.title].y);
	} else return;

	if (targetNum === undefined) return;

	for (let i in _players) {
		let player = _players[i];
		if (player.tag.title == targetNum) {
			target = player;
		}
	}

	if (target !== null) {
		switch (p.tag.role) {
			case "경찰":
				p.playSound("policeAttackSound.mp3");
				let targetRole = target.tag.role;
				p.showCustomLabel(`${target.title}의 직업은 ${targetRole}입니다.`, 0xffffff, 0x000000, 300);
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
	// 위젯 메시지
	// 이 사람의 직업 + 죽었습니다
	if (player.tag.role != "마피아") {
		App.showCustomLabel(`${player.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`, 0xffffff, 0x000000, 300);
		giveExp(player, 2);
	} else {
		App.showCustomLabel(`${player.name} 님이 처형당했습니다. 그는 마피아였습니다.`, 0xffffff, 0x000000, 300);
	}

	player.moveSpeed = 80;
	player.tag.role = "";
	player.title = "유령";
	player.tag.healed = false;
	player.tag.mafiaTarget = false;
	player.tag.votecount = 0;
	player.tag.joined = false;
	player.sprite = ghost;
	player.sendUpdated();

	// gameEndCheck();
}

function startState(state) {
	_state = state;
	_stateTimer = 0;
	_tickTockSoundOn = false;

	switch (_state) {
		case STATE_INIT:
			Map.clearAllObjects();
			// destroyAppWidget();
			_widgetHtml = "WatingRoom.html";

			updatePlayerWidget(_widgetHtml);
			_turnCount = 0;
			_readyCount = 0;

			for (let i in _players) {
				let p = _players[i];
				p.attackType = 2;
				p.attackSprite = null;
				p.attackParam1 = 2;
				p.attackParam2 = 3;

				p.moveSpeed = 80;
				p.sprite = null;
				p.title = levelCalc(p);
				p.hidden = false;
				p.moveSpeed = 80;

				p.tag.joined = false;
				p.tag.role = "";
				p.tag.voted = false;
				p.tag.title = 0;
				p.tag.votecount = 0;
				p.tag.healed = false;
				p.tag.mafiaTarget = false;

				p.spawnAt(parseInt(Math.random() * 14 + 18), parseInt(Math.random() * 10 + 37));
				p.sendUpdated();
			}

			break;
		case STATE_READY:
			_stateTimer = 5;
			_start = true;

			const roleArray = createRole(6);
			let arrIndex = 0;
			for (i in _players) {
				p = _players[i];
				let pStorage = JSON.parse(p.storage);
				pStorage["playCount"] ? pStorage["playCount"]++ : (pStorage["playCount"] = 1);
				p.storage = JSON.stringify(pStorage);
				if (p.tag.joined == true) {
					// p.spawnAt(coordinates[arrIndex + 1].x, coordinates[arrIndex + 1].y);
					p.title = `${arrIndex + 1} 번 참가자`;
					p.tag.title = arrIndex + 1;
					setRole(p, arrIndex, roleArray);
					arrIndex++;
				}
			}

			sendMessageToPlayerWidget();

			break;
		case STATE_PLAYING_DAY:
			nightResult(++_turnCount);
			if (gameEndCheck() == false) {
				tagReset();
				// destroyAppWidget();
				clearHidden();
				Map.clearAllObjects();
				App.playSound("morningSound.wav");
				_stateTimer = 10 * _playerCount;
				_widgetHtml = "morning.html";
				updatePlayerWidget(_widgetHtml);
				// sendMessageToPlayerWidget();
			}
			break;
		case STATE_VOTE:
			if (gameEndCheck() == false) {
				// destroyAppWidget();
				App.playSound("voteSound.wav");
				_stateTimer = 17;
				// 투표가 시작되었습니다.
				_widgetHtml = "vote.html";
				updatePlayerWidget(_widgetHtml);
				// sendMessageToPlayerWidget();
			}
			break;
		case STATE_VOTE_RESULT:
			if (gameEndCheck() == false) {
				_stateTimer = 7;
				voteResult();
			}
			break;
		case STATE_PLAYING_NIGHT:
			if (gameEndCheck() == false) {
				// destroyAppWidget();
				tagReset();
				createSilhouette();
				allHidden();
				_stateTimer = 17;
				App.playSound("nightSound.mp3");
				_widgetHtml = "night.html";
				updatePlayerWidget(_widgetHtml);
				// sendMessageToPlayerWidget();

				for (let i in _players) {
					let p = _players[i];
					if (p.tag.joined) {
						p.chatEnabled = false;
						p.sendUpdated();
						if (p.tag.joined == true) {
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
			if (_widget) {
				_widget.destroy();
				_widget = null; // must to do for using again
			}
			_start = false;
			startState(STATE_INIT);
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
	if (player.tag.joined == true) {
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
	let align = "topleft";
	if (player.isMobile) {
		align = "middle";
	}
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
	if (p.tag.joined == true) {
		let pStorage = JSON.parse(p.storage);
		pStorage.runCount ? pStorage.runCount++ : (pStorage.runCount = 1);
		p.storage = JSON.stringify(pStorage);
		p.save();
		if (p.tag.role == "마피아") {
			App.showCustomLabel(`${p.name} 님이 나갔습니다.`, 0xffffff, 0x000000, 300, 5000);
		} else {
			App.showCustomLabel(`${p.name} 님이 나갔습니다.`, 0xffffff, 0x000000, 300, 5000);
		}
	}
	App.runLater(() => {
		gameEndCheck();
	}, 2);
}

function voteResult() {
	let max = 0;
	let index = -1;
	let maxCount = 0;
	let voteArray = [];
	for (let i in _players) {
		p = _players[i];
		if (p.tag.votecount > max) {
			max = p.tag.votecount;
			index = i;
		}
	}

	if (max != 0) {
		for (let i in _players) {
			p = _players[i];
			if (p.tag.votecount == max) {
				maxCount++;
			}

			if (p.tag.joined == true) {
				voteArray.push([p.tag.title, p.tag.votecount]);
			}
		}
	}

	voteArray.sort((a, b) => b[1] - a[1]);

	if (index == -1) {
		App.showCustomLabel(`투표 결과 아무도 죽지 않았습니다.`, 0xffffff, 0x000000, 300);
	} else if (maxCount > 1) {
		App.showCustomLabel(`투표 결과 아무도 죽지 않았습니다.`, 0xffffff, 0x000000, 300);
	} else {
		dead(_players[index]);
	}

	// destroyAppWidget();
	_widgetHtml = "voteResult.html";
	updatePlayerWidget(_widgetHtml);
	sendMessageToPlayerWidget(voteArray);
}

function tagReset() {
	for (let i in _players) {
		p = _players[i];
		p.tag.voted = false;
		p.tag.healed = false;
		p.tag.votecount = 0;
		p.tag.mafiaTarget = false;
		p.tag.kickCount = 0;
		p.attackSprite = null;
		p.sendUpdated();
	}
}

function allHidden() {
	for (let i in _players) {
		p = _players[i];
		p.hidden = true;
		p.sendUpdated();
	}
}

function clearHidden() {
	for (let i in _players) {
		let p = _players[i];
		if (p.tag.joined == true) {
			p = _players[i];
			p.moveSpeed = 0;
			p.spawnAt(coordinates[p.tag.title]?.x, coordinates[p.tag.title]?.y);
			p.sprite = null;
			p.hidden = false;
			p.chatEnabled = true;
			p.sendUpdated();
		}
	}
}

function createSilhouette() {
	for (let i in _players) {
		p = _players[i];
		if (p.tag.joined == true) {
			let x = coordinates[p.tag.title].x;
			let y = coordinates[p.tag.title].y;
			Map.putObject(x, y - 1, silhouette);
			Map.putObject(x, y, blankObject);
		}
	}
}

function nightResult(turnCount) {
	// App.sayToAll(`턴 : ${turnCount}`);

	if (turnCount * 1 > 1) {
		for (let i in _players) {
			p = _players[i];
			if (p.tag.joined == true) {
				if (p.tag.mafiaTarget == true) {
					if (p.tag.healed == true) {
						App.showCustomLabel(`어느 훌륭하신 의사가 기적적으로 시민을 살렸습니다.`, 0xffffff, 0x000000, 300);
						return;
					} else {
						App.showCustomLabel(`이번 밤에 ${p.title}가 죽었습니다.`, 0xffffff, 0x000000, 300);
						dead(p);
						return;
					}
				}
			}
		}
		App.showCustomLabel(`이번 밤에 아무도 죽지 않았습니다.`, 0xffffff, 0x000000, 300);
	}
}

function gameEndCheck() {
	if (_start) {
		_mafiaCount = 0;
		_citizenCount = 0;
		for (let i in _players) {
			let p = _players[i];
			if (p.tag.joined == true) {
				if (p.tag.role == "마피아") {
					// App.sayToAll(`마피아 : ${p.title}`);
					_mafiaCount++;
				} else _citizenCount++;
			}
		}

		// App.sayToAll(`마피아 수: ${_mafiaCount}`);

		if (_mafiaCount == 0) {
			// 시민 승리
			for (let i in _players) {
				let p = _players[i];
				if (p.tag.joined == true) {
					if (p.tag.role == "마피아") {
						giveExp(p, 2);
					} else {
						giveExp(p, 5);
					}
				}
			}
			// destroyAppWidget();
			gameReset();
			App.playSound("citizenWinSound.mp3");
			_widgetHtml = "winCitizen.html";
			updatePlayerWidget(_widgetHtml);

			App.runLater(() => {
				startState(STATE_INIT);
			}, 8);
			return true;
		} else if (_mafiaCount == 1) {
			if (_mafiaCount == _citizenCount) {
				// 마피아 승리
				for (let i in _players) {
					let p = _players[i];
					if (p.tag.joined == true) {
						if (p.tag.role == "마피아") {
							giveExp(p, 10);
						} else {
							giveExp(p, 5);
						}
					}
				}
				App.playSound("mafiaWinSound.mp3");
				// destroyAppWidget();
				gameReset();
				_widgetHtml = "winMafia.html";
				updatePlayerWidget(_widgetHtml);

				App.runLater(() => {
					startState(STATE_INIT);
				}, 8);

				return true;
			}
		}
	}
	return false;
}

function gameReset() {
	_start = false;
	_playerCount = 0;

	for (let i in _players) {
		let p = _players[i];
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
		p.tag.joined = false;
		p.tag.role = "";
		p.tag.voted = false;
		p.tag.title = 0;
		p.tag.votecount = 0;
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

function updatePlayerWidget(htmlName) {
	for (let i in _players) {
		let p = _players[i];
		if (p.tag.widget) {
			p.tag.widget.destroy();
			p.tag.widget = null;
		}
		p.tag.widget = p.showWidget(htmlName, "top", 400, 350);
		p.tag.widget.sendMessage({ type: "setID", id: p.id });
		p.tag.widget.onMessage.Add((player, data) => WatingRoomOnMessage(player, data));
	}
	if (_state != STATE_VOTE_RESULT) {
		sendMessageToPlayerWidget();
	}
}

function sendMessageToPlayerWidget(data = null) {
	for (let i in _players) {
		let p = _players[i];
		let p_widget = p.tag.widget;
		if (p_widget) {
			switch (_state) {
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
						alive: _mafiaCount + _citizenCount,
						timer: _stateTimer,
						description: "투표 전까지 이야기를 나누세요.",
					});
					break;
				case STATE_VOTE:
					let liveList = [];
					for (let i in _players) {
						let p = _players[i];

						if (p.tag.joined) {
							liveList.push(parseInt(p.tag.title));
						}
					}
					p_widget.sendMessage({
						total: 6,
						alive: _mafiaCount + _citizenCount,
						timer: _stateTimer,
						liveList: liveList,
						description: "",
					});

					p_widget.onMessage.Add(function (player, data) {
						if (player.tag.joined) {
							if (data.vote) {
								for (let i in _players) {
									let p = _players[i];
									if (p.tag.title == data.vote) {
										p.tag.votecount++;
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
						alive: _mafiaCount + _citizenCount,
						timer: _stateTimer,
						description: "마피아, 경찰, 의사는 밤에 움직일 수 있습니다.",
					});

					break;
			}
		}
	}
}

function WatingRoomOnMessage(player, data) {
	switch (data.type) {
		case "join":
			if (_start) return;
			if (player.tag.joined) return;
			if (_playerCount < 6) {
				if (!player.tag.joined) {
					_playerCount++;
					// player.tag.title = _playerCount;
					// player.title = _playerCount + "번 참가자";
					player.tag.joined = true;
					// player.sendUpdated();
					App.playSound("joinSound.mp3");
					let pStorage = JSON.parse(player.storage);
					sendMessageToPlayerWidget({
						type: "join",
						id: player.id,
						name: player.name,
						level: levelCalc(player),
						runCount: pStorage.runCount,
					});
				}
			} else {
				if (!player.tag.joined) {
					player.showCustomLabel("게임 인원이 다 찼습니다.", 0xffffff, 0x000000, 300);
				}
			}
			break;
		case "ready":
			sendMessageToPlayerWidget({
				type: "ready",
				id: player.id,
			});
			if (!player.tag.ready) {
				player.tag.ready = true;
				_readyCount++;
				if (_readyCount == 6) {
					App.showCustomLabel("게임이 곧 시작됩니다.", 0xffffff, 0x000000, 300);
					startState(STATE_READY);
				}
			}

			break;
		case "cancle-ready":
			if (player.tag.ready) {
				_readyCount--;
				player.tag.ready = false;
			}
			sendMessageToPlayerWidget({
				type: "cancle-ready",
				id: player.id,
			});
			break;
		case "kick":
			let kickList = player.tag.kickList;
			if (kickList && kickList.includes(data.id)) {
				kickList.splice(kickList.indexOf(data.id), 1);
				player.tag.kickList = kickList;
				sendMessageToPlayerWidget({
					type: "cancle-kick",
					id: data.id,
				});
				let target = App.getPlayerByID(data.id);
				target.tag.kickCount--;
			} else {
				player.tag.kickList ? player.tag.kickList.push(data.id) : (player.tag.kickList = [data.id]);
				sendMessageToPlayerWidget({
					type: "kick",
					id: data.id,
				});
				let target = App.getPlayerByID(data.id);
				target?.tag.kickCount ? target.tag.kickCount++ : (target.tag.kickCount = 1);
				if (target.tag.kickCount >= 3) {
					target.tag.joined = false;
					target.tag.ready = false;
					target.tag.kickCount = 0;
					_playerCount--;
					if (target.tag.ready) {
						_readyCount--;
					}
					target.tag.widget.sendMessage({
						type: "kicked",
					});

					sendMessageToPlayerWidget({
						type: "leave",
						id: target.id,
						kickList: target.tag.kickList,
					});
					target.tag.kickList = [];
				}
			}
			break;
	}
}
