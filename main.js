const STATE_INIT = 3000;
const STATE_READY = 3001;
const STATE_PLAYING_NIGHT = 3002;
const STATE_PLAYING_DAY = 3003;
const STATE_VOTE = 3004;
const STATE_END = 3005;
const coordinates = {
	1: { x: 13, y: 10 },
	2: { x: 14, y: 10 },
	3: { x: 16, y: 11 },
	4: { x: 16, y: 13 },
	5: { x: 11, y: 13 },
	6: { x: 11, y: 11 },
};

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
		animation: [8, 12, 4, 16],
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

let silhouette = App.loadSpritesheet("silhouette2.png");

let _playerCount = 0;
let _players = App.players;
let _start = false;
let _timer = 0;
let _stateTimer = 0;
let _state = STATE_INIT;
let _widget = null;

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

	Map.putObject(10, 10, monster, {
		overlap: true,
		animation: {
			rotate: [1, 4, 5, 7],
		},
	});

	Map.playObjectAnimation(10, 10, "animation", 100);

	for (const [key, value] of Object.entries(monster)) {
		// App.sayToAll(`${key}: ${value}`);
	}

	p.moveSpeed = 80;
	p.attackType = 0;
	p.attackSprite = mafiaAttackSprite;
	p.attackParam1 = 3;
	p.attackParam2 = 3;
	// App.sayToAll(`공격 거리: ${p.attackParam2}`);

	p.sendUpdated();

	_players = App.players;
});

App.onLeavePlayer.Add(function (p) {
	p.tag = {
		joined: false,
		role: "",
		voted: false,
		title: 0,
		votecount: 0,
		healed: false,
	};
	switch (_state) {
		case STATE_INIT:
			if (p.tag.joined == true) {
				_playerCount--;
				App.showCenterLabel(
					`마피아게임 참가 인원 수 : ${_playerCount}/6`,
					0xffffff,
					0x000000,
					115
				);
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
	if (text == "의사") {
		player.sprite = doctorSprite;
		player.attackSprite = doctorAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "마피아") {
		player.sprite = mafiaSprite;
		player.attackSprite = mafiaAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "경찰") {
		player.sprite = policeSprite;
		player.attackSprite = policeAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	}
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
				}

				App.showCenterLabel(
					`마피아게임 참가 인원 수 : ${_playerCount}/6`,
					0xffffff,
					0x000000,
					115
				);
				if (_playerCount === 6) {
					App.showCenterLabel("참가 마감.", 0xffffff, 0x000000, 115);
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
					if (text * 1 == p.title) {
						p.tag.votecount++;
						player.tag.voted = true;
						App.sayToAll(`${p.name}: ${p.tag.votecount} 표`);
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
	player.showCenterLabel(`사람을 때렸다.`, 0xffffff, 0x000000, 115);

	player.moveSpeed = 0;
	player.attackType = 1;
	player.attackSprite = null;
	player.attackParam1 = 0;
	player.attackParam2 = 0;
	player.sendUpdated();
	player.spawnAt(
		coordinates[player.tag.title].x,
		coordinates[player.tag.title].y
	);

	switch (player.tag.role) {
		case "경찰":
			let targetRole = target.tag.role;
			player.showCenterLabel(
				`${target.title}의 직업은 ${targetRole}입니다.`,
				0xffffff,
				0x000000,
				115
			);
			break;
		case "마피아":
			player.showCenterLabel(
				`${target.title}를 죽이기로 결졍했습니다.`,
				0xffffff,
				0x000000,
				115
			);
			target.tag.mafiaTarget = true;
			break;
		case "의사":
			player.showCenterLabel(
				`${target.title}를 살리기로 결졍했습니다.`,
				0xffffff,
				0x000000,
				115
			);
			player.tag.healed = false;
			target.tag.healed = true;
			break;
	}
});

App.onObjectAttacked.Add(function (p, x, y) {
	p.showCenterLabel(`오브젝트를 때렸다.`, 0xffffff, 0x000000, 115);
});

function dead(player) {
	// 위젯 메시지
	// 이 사람의 직업 + 죽었습니다
	if (player.tag.role != "마피아") {
		App.showCenterLabel(
			`${p.name} 님이 처형당했습니다. 그는 마피아가 아니었습니다.`,
			0xffffff,
			0x000000,
			115
		);
	} else {
		App.showCenterLabel(
			`${p.name} 님이 처형당했습니다. 그는 마피아였습니다.`,
			0xffffff,
			0x000000,
			115
		);
	}
	player.tag.joined = false;
	player.sprite = tomb;
	player.sendUpdated();
}

function startState(state) {
	_state = state;
	_stateTimer = 0;

	switch (_state) {
		case STATE_INIT:
			Map.clearAllObjects();
			_turnCount = 0;
			App.showCenterLabel(
				`채팅창에 '참가'를 입력해 마피아 게임에 참여할 수 있습니다.`,
				0xffffff,
				0x000000,
				115
			);
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
			App.showCenterLabel(
				`마피아 게임이 곧 시작됩니다..`,
				0xffffff,
				0x000000,
				115
			);
			// setTimeout(() => {
			// 	startState(STATE_PLAYING_DAY);
			// }, 10000);
			App.runLater(() => {
				startState(STATE_PLAYING_DAY);
			}, 10); // 나중에 바꿈
			break;
		case STATE_PLAYING_DAY:
			gameEndCheck();
			nightResult(++_turnCount);
			destroyAppWidget();
			clearHidden();
			Map.clearAllObjects();
			App.playSound("morningSound.wav");
			_stateTimer = 10;
			_widget = App.showWidget("morning.html", "top", 400, 200);
			_widget.sendMessage({
				total: 6,
				alive: _mafiaCount + _citizenCount,
				timer: 10,
				description: "투표 전까지 이야기를 나누세요.",
			});
			// 위젯 -> 2분 30초간 이야기를 나누세요.
			// 카운트 끝 -> 투표
			App.runLater(() => {
				startState(STATE_VOTE);
			}, _stateTimer);
			break;
		case STATE_VOTE:
			destroyAppWidget();
			App.playSound("voteSound.wav");
			_stateTimer = 10;
			// 투표가 시작되었습니다.
			_widget = App.showWidget("vote.html", "top", 400, 200);
			_widget.sendMessage({
				total: 6,
				alive: _mafiaCount + _citizenCount,
				timer: 10,
				description:
					"채팅창에 투표할 플레이어의 번호를 적으세요.(자신에게 투표 불가)",
			});

			App.runLater(() => {
				voteResult();
			}, 10);

			App.runLater(() => {
				startState(STATE_PLAYING_NIGHT);
			}, _stateTimer);
			// 위젯 타이머
			// 투표 끝 -> 한명 죽고
			// 한명 죽고  -> 밤
			break;
		case STATE_PLAYING_NIGHT:
			gameEndCheck();
			destroyAppWidget();
			tagReset();
			createSilhouette();
			allHidden();
			App.playSound("nightSound.mp3");
			_widget = App.showWidget("night.html", "top", 400, 200);
			_widget.sendMessage({
				total: 6,
				alive: _mafiaCount + _citizenCount,
				timer: 10,
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

			// _widget = App.showWidget("timer.html", "top", 200, 300);
			// _widget.sendMessage({
			// 	state: _state,
			// 	timer: 10,
			// 	description: "밤이 되었습니다.",
			// });
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
			player.showWidget(`police.html`, "topleft", 221, 291);
			break;
		case "마피아":
			player.showWidget(`mafia.html`, "topleft", 221, 291);
			break;
		case "의사":
			player.showWidget(`doctor.html`, "topleft", 221, 291);
			break;
		case "시민":
			player.showWidget(`citizen.html`, "topleft", 221, 291);
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
				115
			);
		} else {
			App.showCenterLabel(
				`${p.name} 님이 나갔습니다. 그는 마피아가 아니었습니다.`,
				0xffffff,
				0x000000,
				115
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

	if (index == -1) {
		App.showCenterLabel(
			`투표 결과 아무도 죽지 않았습니다.`,
			0xffffff,
			0x000000,
			115
		);
	} else if (maxCount > 1) {
		App.showCenterLabel(
			`투표 결과 아무도 죽지 않았습니다.`,
			0xffffff,
			0x000000,
			115
		);
	} else {
		dead(_players[index]);
	}
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
		p = _players[i];
		p.hidden = false;
		p.sendUpdated();
	}
}

function createSilhouette() {
	for (let i in _players) {
		p = _players[i];
		if (p.tag.joined == true) {
			Map.putObject(p.tileX, p.tileY, silhouette);
		}
	}
}

function nightResult(turnCount) {
	if (turnCount != 1) {
		for (let i in _players) {
			p = _players[i];
			if (p.tag.joined == true) {
				if (p.tag.mafiaTarget == true) {
					if (p.tag.healed == true) {
						App.showCenterLabel(
							`이번 밤에 아무도 죽지 않았습니다.`,
							0xffffff,
							0x000000,
							115
						);
					} else {
						App.showCenterLabel(
							`이번 밤에 ${p.title}가 죽었습니다.`,
							0xffffff,
							0x000000,
							115
						);
					}
				}
			}
		}
	}
}

function gameEndCheck() {
	_mafiaCount = 0;
	_citizenCount = 0;
	for (let i in _players) {
		let p = _players[i];
		if (p.tag.joined == true) {
			if (p.tag.role == "마피아") _mafiaCount++;
			else _citizenCount++;
		}
	}

	if (_mafiaCount == 0) {
		// 시민 승리
		destroyAppWidget();
		startState(STATE_INIT);
		return true;
	} else if (_mafiaCount == 1) {
		if (_mafiaCount == _citizenCount) {
			// 마피아 승리
			destroyAppWidget();
			startState(STATE_INIT);
			return true;
		}
	}

	return false;
}

function changeCharacterImage(player, text) {
	if (text == "의사") {
		player.sprite = doctorSprite;
		player.attackSprite = doctorAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "마피아") {
		player.sprite = mafiaSprite;
		player.attackSprite = mafiaAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "경찰") {
		player.sprite = policeSprite;
		player.attackSprite = policeAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else return;
	player.sendUpdated();
}
