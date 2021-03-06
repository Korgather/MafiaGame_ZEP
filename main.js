const STATE_INIT = 3000;
const STATE_READY = 3001;
const STATE_PLAYING_NIGHT = 3002;
const STATE_PLAYING_DAY = 3003;
const STATE_VOTE = 3004;
const STATE_VOTE_RESULT = 3005;
const STATE_END = 3006;
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

let _userMainWidget = [];

let _turnCount = 0;

let _mafiaCount = 0;
let _citizenCount = 0;
let _tickTockSoundOn = false;
let _widgetHtml = "init.html";

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
	if (p.storage == null) {
		p.storage = JSON.stringify({
			exp: 0,
			mainWidget: null,
		});
		p.save();
	}
	let p_widget = p.showWidget(_widgetHtml, "top", 400, 200);
	_userMainWidget.push(p_widget);

	// p.showWidget("Channel.html", "topleft", 400, 750);

	if (p_widget) {
		// App.runLater(() => {
		// destroyAppWidget();

		switch (_state) {
			case STATE_INIT:
				try {
					p_widget.sendMessage({
						total: 6,
						current: _playerCount,
						description: `???????????? "??????"??? ????????? ????????? ????????? ??? ????????????.`,
					});
				} catch (e) {
					App.sayToAll("hey");
				}

				break;
			case STATE_PLAYING_DAY:
				p_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "?????? ????????? ???????????? ????????????.",
				});
				break;
			case STATE_VOTE:
				p_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description:
						"???????????? ????????? ??????????????? ????????? ????????????.(???????????? ?????? ??????)",
				});

				break;
			case STATE_PLAYING_NIGHT:
				p_widget.sendMessage({
					total: 6,
					alive: _mafiaCount + _citizenCount,
					timer: _stateTimer,
					description: "?????????, ??????, ????????? ?????? ????????? ??? ????????????.",
				});

				break;
		}
		// }, 2);

		// _widget.id;
	}

	p.attackType = 1;
	p.attackSprite = null;
	p.attackParam1 = 0;
	p.attackParam2 = 0;

	p.moveSpeed = 80;
	p.sprite = null;
	p.title = levelCalc(p);
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

	p.sendUpdated();

	_players = App.players;
});

App.onLeavePlayer.Add(function (p) {
	if (App.playerCount == 0) {
		App.httpGet(
			"https://api.metabusstation.shop/api/v1/posts/zep/playercount?hashId=" +
				App.mapHashID +
				"&playerCount=" +
				0,
			{},
			(a) => {}
		);
	}

	switch (_state) {
		case STATE_INIT:
			if (p.tag.joined == true) {
				_playerCount--;
				sendMessageToPlayerWidget();
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
	}
});

App.onStart.Add(function () {
	// App.runLater(() => startState(STATE_INIT), 2);
	startState(STATE_INIT);
});

App.onSay.add(function (player, text) {
	if (text == "/?????????") {
		giveExp(player, 10);
	}

	player.sendUpdated();
	if (text == "??????") {
		if (_start == true) {
			player.showCenterLabel("?????? ????????? ????????? ?????????.");
		}
	}

	if (_state == STATE_INIT) {
		if (text == "??????") {
			if (_playerCount < 6) {
				if (player.tag.joined == false) {
					_playerCount++;
					player.tag.title = _playerCount;
					player.title = _playerCount + "??? ?????????";
					player.tag.joined = true;
					player.spawnAt(
						coordinates[player.tag.title].x,
						coordinates[player.tag.title].y
					);
					player.moveSpeed = 0;
					player.sendUpdated();
					App.playSound("joinSound.m4a");
				}
				sendMessageToPlayerWidget();

				if (_playerCount === 6) {
					App.showCenterLabel("?????? ??????.", 0xffffff, 0x000000, 300);
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
						// App.sayToAll(`${p.name}: ${p.tag.votecount} ???`);
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

let apiRequestDelay = 15;

App.onUpdate.Add(function (dt) {
	// modumeta????????? ???????????? ????????? ?????????
	if (apiRequestDelay > 0) {
		apiRequestDelay -= dt;
		if (apiRequestDelay < 1) {
			apiRequestDelay = 30;

			App.httpGet(
				"https://api.metabusstation.shop/api/v1/posts/zep/playercount?hashId=" +
					App.mapHashID +
					"&playerCount=" +
					App.playerCount,
				{},
				(a) => {}
			);
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

App.onUnitAttacked.Add(function (player, x, y, target) {});

App.onObjectAttacked.Add(function (p, x, y) {
	// p.showCenterLabel(`??????????????? ?????????.`, 0xffffff, 0x000000, 115);
	let target = null;
	let targetNum = 0;
	if (p.tag.role == "?????????" || p.tag.role == "??????" || p.tag.role == "??????") {
		// App.sayToAll(`??????????????? ?????????. ?????? ${x}, ${y}`);

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
			case "??????":
				p.playSound("policeAttackSound.mp3");
				let targetRole = target.tag.role;
				p.showCenterLabel(
					`${target.title}??? ????????? ${targetRole}?????????.`,
					0xffffff,
					0x000000,
					300
				);
				break;
			case "?????????":
				App.playSound("gunSound.WAV");
				p.showCenterLabel(
					`${target.title}??? ???????????? ??????????????????.`,
					0xffffff,
					0x000000,
					300
				);
				target.tag.mafiaTarget = true;
				break;
			case "??????":
				p.playSound("healSound.wav");
				p.showCenterLabel(
					`${target.title}??? ???????????? ??????????????????.`,
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
	// ?????? ?????????
	// ??? ????????? ?????? + ???????????????
	if (player.tag.role != "?????????") {
		App.showCenterLabel(
			`${player.name} ?????? ?????????????????????. ?????? ???????????? ??????????????????.`,
			0xffffff,
			0x000000,
			300
		);
		giveExp(player, 2);
	} else {
		App.showCenterLabel(
			`${player.name} ?????? ?????????????????????. ?????? ?????????????????????.`,
			0xffffff,
			0x000000,
			300
		);
	}

	player.moveSpeed = 80;
	player.tag.role = "";
	player.title = "??????";
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
			_widgetHtml = "init.html";
			updatePlayerWidget(_widgetHtml);
			_turnCount = 0;

			_players = App.players;
			for (let i in _players) {
				let p = _players[i];
				p.attackType = 1;
				p.attackSprite = null;
				p.attackParam1 = 1;
				p.attackParam2 = 0;

				p.moveSpeed = 80;
				p.sprite = null;
				p.title = levelCalc(p);
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
					parseInt(Math.random() * 10 + 31)
				);
				p.sendUpdated();
			}

			break;
		case STATE_READY:
			_players = App.players;
			_stateTimer = 5;
			_start = true;

			const roleArray = createRole(6);
			let arrIndex = 0;
			for (i in _players) {
				p = _players[i];
				if (p.tag.joined == true) {
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
				_stateTimer = 62;
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
				// ????????? ?????????????????????.
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
				_stateTimer = 22;
				App.playSound("nightSound.mp3");
				_widgetHtml = "night.html";
				updatePlayerWidget(_widgetHtml);
				// sendMessageToPlayerWidget();

				for (let i in _players) {
					let p = _players[i];
					if (p.tag.joined == true) {
						let role = p.tag.role;
						if (role != "??????") {
							changeCharacterImage(p, role);
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
			return "?????????";
		}
		if (i === 1) {
			return "??????";
		}
		if (i === 2) {
			return "??????";
		}
		return "??????";
	});
	return shuffle(roleArray);
}

function setRole(player, index, roleArray) {
	if (player.tag.joined == true) {
		if (player.tag.role != "") {
			App.sayToAll("??????!");
		}
		player.tag.role = roleArray[index];
		// App.sayToAll(`${player.name}??? ${player.tag.role} ??????, ${index}`);

		showRoleWidget(player);
	}
}

function showRoleWidget(player) {
	let role = player.tag.role;
	switch (role) {
		case "??????":
			_policeWidget = player.showWidget(`police.html`, "topleft", 221, 291);
			break;
		case "?????????":
			_mafiaWidget = player.showWidget(`mafia.html`, "topleft", 221, 291);
			break;
		case "??????":
			_doctorWidget = player.showWidget(`doctor.html`, "topleft", 221, 291);
			break;
		case "??????":
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
		if (p.tag.role == "?????????") {
			App.showCenterLabel(
				`${p.name} ?????? ???????????????.`,
				0xffffff,
				0x000000,
				300
			);
		} else {
			App.showCenterLabel(
				`${p.name} ?????? ???????????????.`,
				0xffffff,
				0x000000,
				300
			);
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
		}
	}

	for (let i in _players) {
		p = _players[i];
		if (p.tag.joined == true) {
			voteArray.push([p.tag.title, p.tag.votecount]);
		}
	}
	voteArray.sort((a, b) => b[1] - a[1]);

	if (index == -1) {
		App.showCenterLabel(
			`?????? ?????? ????????? ?????? ???????????????.`,
			0xffffff,
			0x000000,
			300
		);
	} else if (maxCount > 1) {
		App.showCenterLabel(
			`?????? ?????? ????????? ?????? ???????????????.`,
			0xffffff,
			0x000000,
			300
		);
	} else {
		dead(_players[index]);
	}

	// destroyAppWidget();
	_widgetHtml = "voteResult.html";
	updatePlayerWidget(_widgetHtml);
	sendMessageToPlayerWidget(voteArray);
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
	App.sayToAll(`??? : ${turnCount}`);

	if (turnCount * 1 > 1) {
		for (let i in _players) {
			p = _players[i];
			if (p.tag.joined == true) {
				if (p.tag.mafiaTarget == true) {
					if (p.tag.healed == true) {
						App.showCenterLabel(
							`?????? ???????????? ????????? ??????????????? ????????? ???????????????.`,
							0xffffff,
							0x000000,
							300
						);
						return;
					} else {
						App.showCenterLabel(
							`?????? ?????? ${p.title}??? ???????????????.`,
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
		App.showCenterLabel(
			`?????? ?????? ????????? ?????? ???????????????.`,
			0xffffff,
			0x000000,
			300
		);
	}
}

function gameEndCheck() {
	_mafiaCount = 0;
	_citizenCount = 0;
	for (let i in _players) {
		let p = _players[i];
		if (p.tag.joined == true) {
			if (p.tag.role == "?????????") {
				// App.sayToAll(`????????? : ${p.title}`);
				_mafiaCount++;
			} else _citizenCount++;
		}
	}

	// App.sayToAll(`????????? ???: ${_mafiaCount}`);

	if (_mafiaCount == 0) {
		// ?????? ??????
		for (let i in _players) {
			let p = _players[i];
			if (p.tag.joined == true) {
				if (p.tag.role == "?????????") {
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
			// ????????? ??????
			for (let i in _players) {
				let p = _players[i];
				if (p.tag.joined == true) {
					if (p.tag.role == "?????????") {
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

	return false;
}

function gameReset() {
	_start = false;
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
		p.title = levelCalc(p);
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
	}
	p.sendUpdated();
}

function changeCharacterImage(player, text) {
	if (text == "??????") {
		player.sprite = doctorSprite;
		player.moveSpeed = 80;
		player.attackSprite = doctorAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "?????????") {
		player.sprite = mafiaSprite;
		player.moveSpeed = 80;
		player.attackSprite = mafiaAttackSprite;
		player.attackType = 3;
		player.attackParam1 = 2;
		player.attackParam2 = 4;
	} else if (text == "??????") {
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
	if (p.id.indexOf("GUEST") === -1) {
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

		p.showCenterLabel("?????????: " + JSON.parse(p.storage).exp);

		p.save();
		// App.sayToAll(JSON.parse(p.storage).exp);
	}
	App.sayToAll(App.worldHashID);
}

function levelCalc(player) {
	if (player.role == 3000) {
		return "?????????";
	} else if (player.id.indexOf("GUEST") === -1) {
		let i = 0;
		let myExp = JSON.parse(player.storage).exp;

		while (myExp > 0) {
			myExp -= (i + 15) * i;
			i++;
		}
		return "Lv." + i;
	} else {
		return "???????????? ??????";
	}
}

function updatePlayerWidget(htmlName) {
	_players = App.players;

	if (_userMainWidget.length !== 0) {
		for (let i in _userMainWidget) {
			let w = _userMainWidget[i];
			// App.sayToAll(w);
			if (w !== null) {
				// App.sayToAll(w instanceof ScriptWidget);
				// if (w.destroyed) {
				// 	_userMainWidget.splice(i, 1);
				// } else {
				// 	w.destroy();
				// }
				// App.sayToAll(i);
				w.destroy();

				// App.sayToAll(_userMainWidget.length);
			}
		}
	}
	_userMainWidget.splice(0);
	for (let i in _players) {
		let p = _players[i];
		_userMainWidget.push(p.showWidget(htmlName, "top", 400, 200));
	}

	sendMessageToPlayerWidget();
}

function sendMessageToPlayerWidget(data = null) {
	// _players = App.players;

	if (_userMainWidget.length !== 0) {
		for (let i in _userMainWidget) {
			let p_widget = _userMainWidget[i];
			// App.sayToAll(p_widget.id);
			if (p_widget) {
				switch (_state) {
					case STATE_INIT:
						try {
							p_widget.sendMessage({
								total: 6,
								current: _playerCount,
								description: `???????????? "??????"??? ????????? ????????? ????????? ??? ????????????.`,
							});
						} catch (e) {
							App.sayToAll("hey");
						}

						break;
					case STATE_READY:
						p_widget.sendMessage({
							total: 6,
							current: 6,
							description: `????????? ????????? ??? ???????????????.`,
						});
						break;
					case STATE_PLAYING_DAY:
						p_widget.sendMessage({
							total: 6,
							alive: _mafiaCount + _citizenCount,
							timer: _stateTimer,
							description: "?????? ????????? ???????????? ????????????.",
						});
						break;
					case STATE_VOTE:
						p_widget.sendMessage({
							total: 6,
							alive: _mafiaCount + _citizenCount,
							timer: _stateTimer,
							description:
								"???????????? ????????? ??????????????? ????????? ????????????.(???????????? ?????? ??????)",
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
							description: "?????????, ??????, ????????? ?????? ????????? ??? ????????????.",
						});

						break;
				}
			}
		}
	}
}
