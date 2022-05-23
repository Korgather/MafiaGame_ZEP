const STATE_INIT = 3000;
const STATE_READY = 3001;
const STATE_PLAYING_NIGHT = 3002;
const STATE_PLAYING_DAY = 3003;
const STATE_VOTE = 3004;
const STATE_END = 3005;
const coordinates = {
	1: { x: 23, y: 11 },
	2: { x: 26, y: 11 },
	3: { x: 28, y: 13 },
	4: { x: 28, y: 16 },
	5: { x: 21, y: 16 },
	6: { x: 21, y: 13 },
};

// 18,31 - 31,40

let monster = App.loadSpritesheet(
	"monster.png",
	96,
	96,
	{
		// defined base anim
		left: [8, 9, 10, 11],
		up: [12, 13, 14, 15],
		down: [4, 5, 6, 7],
		right: [16, 17, 18, 19],
	},
	8
);

let policeSprite = App.loadSpritesheet(
	"policeSprite.png",
	48,
	48,
	{
		// defined base anim
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
		// defined base anim
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
		// defined base anim
		left: [3, 4, 5],
		up: [9, 10, 11],
		down: [0, 1, 2],
		right: [6, 7, 8],
	},
	8
);

let doctorAttackSprite = App.loadSpritesheet("doctorAttackSprite.png", 24, 24, {
	left: [0], // defined base anim
	right: [0], // defined base anim
	up: [0], // defined base anim
	down: [0], // defined base anim
});

let policeAttackSprite = App.loadSpritesheet("policeAttackSprite.png", 24, 29, {
	left: [0], // defined base anim
	right: [0], // defined base anim
	up: [0], // defined base anim
	down: [0], // defined base anim
});

let mafiaAttackSprite = App.loadSpritesheet(
	"bulletSprite2.png",
	24,
	24,
	{
		left: [2], // defined base anim
		right: [0], // defined base anim
		up: [3], // defined base anim
		down: [1], // defined base anim
	},
	8
);

let tomb = App.loadSpritesheet("tomb.png", 46, 59, {
	left: [0], // defined base anim
	right: [0], // defined base anim
	up: [0], // defined base anim
	down: [0], // defined base anim
});

// let mafiaAttackSprite = App.loadSpritesheet(
// 	"bullet_sprite.png",
// 	12,
// 	12,
// 	{
// 		left: [0], // defined base anim
// 		right: [1], // defined base anim
// 		up: [2], // defined base anim
// 		down: [3], // defined base anim
// 		rotate: [0, 1, 2, 3],
// 	},
// 	8
// );

let silhouette = App.loadSpritesheet("silhouette2.png", 48, 48, {
	left: [0], // defined base anim
	right: [0], // defined base anim
	up: [0], // defined base anim
	down: [0], // defined base anim
});

let blankObject = App.loadSpritesheet("blank.png", 32, 32, {
	left: [0], // defined base anim
	right: [0], // defined base anim
	up: [0], // defined base anim
	down: [0], // defined base anim
});

let _playerCount = 0;
let _players = App.players;
let _start = false;
let _timer = 0;
let _stateTimer = 0;
let _state = STATE_INIT;
let _widget = null;
let _policeWidget = null;
let _doctorWidget = null;
let _mafiaWidget = null;
let _citizenWidget = [];

let _turnCount = 0;

let _mafiaCount = 0;
let _citizenCount = 0;

// function playAttackSound() {
// 	for (let i in _players) {
// 		let player = _players[i];
// 		if (player.tag.joined == true) {
// 			if (player.tag.attackSprite == mafiaAttackSprite) {
// 				player.playSound("gunSound.WAV");
// 			} else if (player.tag.attackSprite == doctorAttackSprite) {
// 				player.playSound("healSound.WAV");
// 			} else if (player.tag.attackSprite == policeAttackSprite) {
// 				player.playSound("gunSound");
// 			} else return;
// 		} else return;
// 	}
// }

// App.addOnKeyDown(90, () => {
// 	playAttackSound();
// });

App.onJoinPlayer.Add(function (p) {
	// p.sprite = tomb;
	// p.hidden = true;

	p.attackType = 1;
	p.attackSprite = null;
	p.attackParam1 = 0;
	p.attackParam2 = 0;

	p.moveSpeed = 80;
	p.sprite = null;
	p.title = 0;
	p.hidden = false;
	p.tag = {
		joined: false,
		role: "",
		voted: false,
		title: 0,
		votecount: 0,
		healed: false,
		mafiaTarget: false,
	};

	// Map.putObject(10, 10, policeSprite, {
	// 	overlap: true,
	// });

	// // Map.playObjectAnimation(10, 10, "rotate", 100);

	// for (const [key, value] of Object.entries(monster)) {
	// 	// App.sayToAll(`${key}: ${value}`);
	// }

	// p.moveSpeed = 80;
	// p.attackType = 0;
	// p.attackSprite = mafiaAttackSprite;
	// p.attackParam1 = 3;
	// p.attackParam2 = 3;
	// // App.sayToAll(`공격 거리: ${p.attackParam2}`);

	p.sendUpdated();

	if (_state == STATE_INIT) {
		_widget.sendMessage({
			total: 6,
			current: _playerCount,
			description: `채팅창에 "참가"를 입력해 게임에 참여할 수 있습니다.`,
		});
	}
	_players = App.players;
});

App.onLeavePlayer.Add(function (p) {
	switch (_state) {
		case STATE_INIT:
			if (p.tag.joined == true) {
				_playerCount--;
				_widget.sendMessage({
					total: 6,
					current: _playerCount,
					description: `채팅창에 "참가"를 입력해 게임에 참여할 수 있습니다.`,
				});
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
		case STATE_PLAYING_VOTE:
			playerLeft(p);

			break;
		case STATE_END:
			if (_widget) {
				_widget.destroy();
				_widget = null; // must to do for using again
			}
			_start = false;
			break;
	}

	p.tag = {
		joined: false,
		role: "",
		voted: false,
		title: 0,
		votecount: 0,
		healed: false,
	};

	_players = App.players;
});

App.onDestroy.Add(function () {
	for (let i in _players) {
		let p = _players[i];
		p.sprite = null;
		p.hidden = false;
		p.tag = {};
		p.sendUpdated();
		p.title = null;
	}
});

App.onStart.Add(function () {
	startState(STATE_INIT);
});

App.onSay.add(function (player, text) {
	// if (text == "의사") {
	// 	player.sprite = doctorSprite;
	// 	player.attackSprite = doctorAttackSprite;
	// 	player.attackType = 3;
	// 	player.attackParam1 = 2;
	// 	player.attackParam2 = 4;
	// } else if (text == "마피아") {
	// 	player.sprite = mafiaSprite;
	// 	player.attackSprite = mafiaAttackSprite;
	// 	player.attackType = 3;
	// 	player.attackParam1 = 2;
	// 	player.attackParam2 = 4;
	// } else if (text == "경찰") {
	// 	player.sprite = policeSprite;
	// 	player.attackSprite = policeAttackSprite;
	// 	player.attackType = 3;
	// 	player.attackParam1 = 2;
	// 	player.attackParam2 = 4;
	// }
	player.sendUpdated();
	if (_state == STATE_INIT) {
		if (text == "참가") {
			if (_playerCount < 6) {
				if (player.tag.joined == false) {
					_playerCount++;
					player.tag.title = _playerCount;
					player.title = _playerCount + "번 참가자";
					player.tag.joined = true;
					player.spawnAt(
						coordinates[player.tag.title].x,
						coordinates[player.tag.title].y
					);
					player.moveSpeed = 0;
					player.sendUpdated();
					App.playSound("joinSound.m4a");
				}
				_widget.sendMessage({
					total: 6,
					current: _playerCount,
					description: `채팅창에 "참가"를 입력해 게임에 참여할 수 있습니다.`,
				});
				if (_playerCount === 6) {
					App.showCenterLabel("참가 마감.", 0xffffff, 0x000000, 300);
					startState(STATE_READY);
				}
			}
		}
	}

	if (_state == STATE_VOTE) {
		if (player.tag.joined == true && player.tag.voted == false) {
			for (let i in _players) {
				p = _players[i];
				if (p.tag.joined == true && p.title != 0 && p.title != player.title) {
					if (text * 1 == p.tag.title) {
						p.tag.votecount++;
						player.tag.voted = true;
						// App.sayToAll(`${p.name}: ${p.tag.votecount} 표`);
						player.sendUpdated();
					}
				}
			}
		}
	}

	if (_state == STATE_PLAYING_NIGHT) {
		if (player.tag.joined == true) {
		}
	}
});

App.onUnitAttacked.Add(function (player, x, y, target) {
	// player.showCenterLabel(`사람을 때렸다.`, 0xffffff, 0x000000, 115);
	// player.moveSpeed = 0;
	// player.attackType = 1;
	// player.attackSprite = null;
	// player.attackParam1 = 0;
	// player.attackParam2 = 0;
	// player.sendUpdated();
	// player.spawnAt(
	// 	coordinates[player.tag.title].x,
	// 	coordinates[player.tag.title].y
	// );
	// switch (player.tag.role) {
	// 	case "경찰":
	// 		let targetRole = target.tag.role;
	// 		player.showCenterLabel(
	// 			`${target.title}의 직업은 ${targetRole}입니다.`,
	// 			0xffffff,
	// 			0x000000
	// 		);
	// 		break;
	// 	case "마피아":
	// 		player.showCenterLabel(
	// 			`${target.title}를 죽이기로 결졍했습니다.`,
	// 			0xffffff,
	// 			0x000000,
	// 			115
	// 		);
	// 		target.tag.mafiaTarget = true;
	// 		break;
	// 	case "의사":
	// 		player.showCenterLabel(
	// 			`${target.title}를 살리기로 결졍했습니다.`,
	// 			0xffffff,
	// 			0x000000
	// 		);
	// 		player.tag.healed = false;
	// 		target.tag.healed = true;
	// 		break;
	// }
});

App.onObjectAttacked.Add(function (p, x, y) {
	// p.showCenterLabel(`오브젝트를 때렸다.`, 0xffffff, 0x000000, 115);
	let target = null;
	let targetNum = 0;
	if (p.tag.role != "시민") {
		// App.sayToAll(`오브젝트를 때렸다. 좌표 ${x}, ${y}`);

		targetNum = Object.keys(coordinates).find(
			(key) =>
				JSON.stringify(coordinates[key]) === JSON.stringify({ x: x, y: y })
		);

		p.moveSpeed = 0;
		p.attackType = 1;
		p.attackSprite = null;
		p.attackParam1 = 0;
		p.attackParam2 = 0;
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
				p.showCenterLabel(
					`${target.title}의 직업은 ${targetRole}입니다.`,
					0xffffff,
					0x000000,
					300
				);
				break;
			case "마피아":
				App.playSound("gunSound.WAV");
				p.showCenterLabel(
					`${target.title}를 죽이기로 결졍했습니다.`,
					0xffffff,
					0x000000,
					300
				);
				target.tag.mafiaTarget = true;
				break;
			case "의사":
				p.playSound("healSound.wav");
				p.showCenterLabel(
					`${target.title}를 살리기로 결졍했습니다.`,
					0xffffff,
					0x000000,
					300
				);
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
		App.showCenterLabel(
			`${p.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`,
			0xffffff,
			0x000000,
			300
		);
	} else {
		App.showCenterLabel(
			`${p.name} 님이 처형당했습니다. 그는 마피아였습니다.`,
			0xffffff,
			0x000000,
			300
		);
	}

	player.moveSpeed = 80;
	player.tag.role = "";
	player.title = "유령";
	player.tag.healed = false;
	player.tag.mafiaTarget = false;
	player.tag.votecount = 0;
	player.tag.joined = false;
	player.sprite = tomb;
	player.sendUpdated();

	// gameEndCheck();
}

function startState(state) {
	_state = state;
	_stateTimer = 0;

	switch (_state) {
		case STATE_INIT:
			destroyAppWidget();
			Map.clearAllObjects();
			_turnCount = 0;
			_widget = App.showWidget("start.html", "top", 400, 200);
			_widget.sendMessage({
				total: 6,
				current: 0,
				description: `채팅창에 "참가"를 입력해 게임에 참여할 수 있습니다.`,
			});

			break;
		case STATE_READY:
			_start = true;
			const n = _players.length;
			const roleArray = createRole(n);

			for (i in _players) {
				p = _players[i];
				setRole(p, i, roleArray);
			}
			// 위젯 -> 10초 타이머
			_widget.sendMessage({
				total: 6,
				current: 6,
				description: `마피아 게임이 곧 시작됩니다.`,
			});

			App.runLater(() => {
				startState(STATE_PLAYING_DAY);
			}, 10); // 나중에 바꿈
			break;
		case STATE_PLAYING_DAY:
			nightResult(++_turnCount);
			if (gameEndCheck() == false) {
				tagReset();
				destroyAppWidget();
				clearHidden();
				Map.clearAllObjects();
				App.playSound("morningSound.wav");
				_stateTimer = 92;
				_widget = App.showWidget("morning.html", "top", 400, 200);
				_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "투표 전까지 이야기를 나누세요.",
				});
				// 위젯 -> 2분 30초간 이야기를 나누세요.
				// 카운트 끝 -> 투표
				App.runLater(() => {
					startState(STATE_VOTE);
				}, _stateTimer);
			}
			break;
		case STATE_VOTE:
			destroyAppWidget();
			App.playSound("voteSound.wav");
			_stateTimer = 17;
			// 투표가 시작되었습니다.
			_widget = App.showWidget("vote.html", "top", 400, 200);
			_widget.sendMessage({
				total: 6,
				alive: _mafiaCount + _citizenCount,
				timer: _stateTimer,
				description:
					"채팅창에 투표할 플레이어의 번호를 적으세요.(자신에게 투표 불가)",
			});

			App.runLater(() => {
				voteResult();
			}, _stateTimer);

			App.runLater(() => {
				startState(STATE_PLAYING_NIGHT);
			}, _stateTimer + 5);
			// 위젯 타이머
			// 투표 끝 -> 한명 죽고
			// 한명 죽고  -> 밤
			break;
		case STATE_PLAYING_NIGHT:
			if (gameEndCheck() == false) {
				destroyAppWidget();
				tagReset();
				createSilhouette();
				allHidden();
				_stateTimer = 22;
				App.playSound("nightSound.mp3");
				_widget = App.showWidget("night.html", "top", 400, 200);
				_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "마피아, 경찰, 의사는 밤에 움직일 수 있습니다.",
				});

				for (let i in _players) {
					let p = _players[i];
					if (p.tag.joined == true) {
						let role = p.tag.role;
						if (role != "시민") {
							changeCharacterImage(p, role);
						}
					}
				}

				App.runLater(() => {
					startState(STATE_PLAYING_DAY);
				}, _stateTimer);
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
		if (player.tag.role != "") {
			App.sayToAll("오류!");
		}
		player.tag.role = roleArray[index];
		App.sayToAll(`${player.name}은 ${player.tag.role} 역할, ${index}`);

		showRoleWidget(player);
	}
}

function showRoleWidget(player) {
	let role = player.tag.role;
	switch (role) {
		case "경찰":
			_policeWidget = player.showWidget(`police.html`, "topleft", 221, 291);
			break;
		case "마피아":
			_mafiaWidget = player.showWidget(`mafia.html`, "topleft", 221, 291);
			break;
		case "의사":
			_doctorWidget = player.showWidget(`doctor.html`, "topleft", 221, 291);
			break;
		case "시민":
			_citizenWidget.push(
				player.showWidget(`citizen.html`, "topleft", 221, 291)
			);
			break;
	}
}

function shuffle(array) {
	array.sort(() => Math.random() - 0.5);
	return array;
}

function playerLeft(p) {
	if (p.tag.joined == true) {
		if (p.tag.role == "마피아") {
			App.showCenterLabel(
				"마피아가 나갔습니다. 게임을 종료합니다.",
				0xffffff,
				0x000000,
				300
			);
		} else {
			App.showCenterLabel(
				`${p.name} 님이 나갔습니다. 그는 마피아가 아니었습니다.`,
				0xffffff,
				0x000000,
				300
			);
		}
	}
}

function voteResult() {
	let max = 0;
	let index = -1;
	let maxCount = 0;
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
		}
	}

	let voteArray = [];
	for (let i in _players) {
		p = _players[i];
		voteArray.push([p.tag.title, p.tag.votecount]);
	}
	voteArray.sort((a, b) => b[1] - a[1]);

	if (index == -1) {
		App.showCenterLabel(
			`투표 결과 아무도 죽지 않았습니다.`,
			0xffffff,
			0x000000,
			300
		);
	} else if (maxCount > 1) {
		App.showCenterLabel(
			`투표 결과 아무도 죽지 않았습니다.`,
			0xffffff,
			0x000000,
			300
		);
	} else {
		dead(_players[index]);
	}

	destroyAppWidget();

	_widget = App.showWidget("voteResult.html", "top", 400, 200);
	_widget.sendMessage({
		result: voteArray,
	});
}

function destroyAppWidget() {
	if (_widget) {
		_widget.destroy();
		_widget = null; // must to do for using again
	}
}

function tagReset() {
	for (let i in _players) {
		p = _players[i];
		p.tag.voted = false;
		p.tag.healed = false;
		p.tag.votecount = 0;
		p.tag.mafiaTarget = false;
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
			p.spawnAt(coordinates[p.tag.title].x, coordinates[p.tag.title].y);
			p.sprite = null;
			p.hidden = false;
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
	App.sayToAll(`턴 : ${turnCount}`);

	if (turnCount * 1 > 1) {
		for (let i in _players) {
			p = _players[i];
			if (p.tag.joined == true) {
				if (p.tag.mafiaTarget == true) {
					if (p.tag.healed == true) {
						App.showCenterLabel(
							`어느 훌륭하신 의사가 기적적으로 시민을 살렸습니다.`,
							0xffffff,
							0x000000,
							300
						);
						return;
					} else {
						App.showCenterLabel(
							`이번 밤에 ${p.title}가 죽었습니다.`,
							0xffffff,
							0x000000,
							300
						);
						dead(p);
						return;
					}
				}
			}
		}
	}
	App.showCenterLabel(
		`이번 밤에 아무도 죽지 않았습니다.`,
		0xffffff,
		0x000000,
		300
	);
}

function gameEndCheck() {
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
		destroyAppWidget();
		gameReset();
		App.playSound("citizenWinSound.mp3");
		_widget = App.showWidget("winCitizen.html", "top", 400, 200);
		App.runLater(() => {
			startState(STATE_INIT);
		}, 10);
		return true;
	} else if (_mafiaCount == 1) {
		if (_mafiaCount == _citizenCount) {
			// 마피아 승리
			App.playSound("mafiaWinSound.mp3");
			destroyAppWidget();
			gameReset();
			_widget = App.showWidget("winMafia.html", "top", 400, 200);

			App.runLater(() => {
				startState(STATE_INIT);
			}, 10);

			return true;
		}
	}

	return false;
}

function gameReset() {
	_players = App.players;
	_playerCount = 0;
	if (_citizenWidget.length !== 0) {
		for (let i in _citizenWidget) {
			let w = _citizenWidget[i];
			if (w !== null) {
				w.destroy();
			}
		}
	}
	if (_policeWidget !== null) {
		_policeWidget.destroy();
	}
	if (_mafiaWidget !== null) {
		_mafiaWidget.destroy();
	}
	if (_doctorWidget !== null) {
		_doctorWidget.destroy();
	}

	_policeWidget = null;
	_doctorWidget = null;
	_mafiaWidget = null;
	_citizenWidget = [];

	for (let i in _players) {
		let p = _players[i];
		p.attackType = 1;
		p.attackSprite = null;
		p.attackParam1 = 1;
		p.attackParam2 = 0;

		p.moveSpeed = 80;
		p.sprite = null;
		p.title = 0;
		p.hidden = false;
		p.tag = {
			joined: false,
			role: "",
			voted: false,
			title: 0,
			votecount: 0,
			healed: false,
			mafiaTarget: false,
		};
		p.spawnAt(
			parseInt(Math.random() * 14 + 18),
			parseInt(Math.random() * 11 + 31)
		);
		p.sendUpdated();
	}
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
