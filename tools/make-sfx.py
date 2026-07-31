"""
효과음 합성 — res/sfx_*.mp3를 만든다.

왜 합성인가
-----------
무료 음원 사이트에서 받아 붙이는 방법도 있었다. 그런데 이 게임에 필요한 것은
"쓸 만한 소리 열여섯 개"가 아니라 "같은 방에서 난 것처럼 들리는 소리
열여섯 개"다. 출처가 다른 음원은 녹음 공간·마이크·라우드니스가 제각각이라
낱개로는 좋아도 이어 붙이면 톤이 흩어진다.

교체 전 res/의 열 개가 정확히 그랬다(측정값):

    morningSound.wav        peak 1.000  ← 이미 깎여 있었다
    healSound.WAV           RMS -25.7 dBFS
    morningSound.wav        RMS -17.9 dBFS   ← 위와 8dB 차이
    gunSound.WAV            8bit 11025Hz 모노 ← 전화보다 낮다
    joinSound.mp3           64kbps
    nightSound.mp3          16.5초           ← 밤 컷은 3초면 걷힌다

여기서는 열여섯 개를 같은 음계(A 단5음계)·같은 잔향(ROOM)·같은 라우드니스
기준(LOUD/MID/SOFT 셋)으로 찍어 낸다. 톤 일관성이 취향이 아니라 상수가 된다.
저작권도 따라오지 않는다 — 파형을 여기서 만들기 때문이다.

왜 이 음색인가
--------------
게임 팔레트는 어두운 갈색 바탕에 황동빛 강조다(src/ui/theme.css의
--bg #14100f, --accent #e0b355). 그래서 재료를 나무·유리·황동으로 한정하고
쇳소리와 전자음을 뺐다. 장르는 추리지 공포가 아니므로 불협은 쓰지 않는다 —
A 단5음계(A-C-D-E-G)는 반음이 없어서 어떻게 겹쳐도 긁히지 않는다.

쓰는 법
-------
    python tools/make-sfx.py

res/sfx_*.mp3를 덮어쓰고, 파일마다 측정한 길이·RMS·피크를 출력한다.
소리를 손보려면 맨 아래 SPECS의 숫자를 고치면 된다.

의존성: numpy, lameenc  (pip install numpy lameenc)
"""

import os
import sys

import lameenc
import numpy as np

SR = 44100

# 잔향은 하나뿐이다. 소리마다 다른 방을 쓰면 톤이 흩어진다
ROOM_SEC = 0.42
ROOM_DAMP = 4200

# 라우드니스 세 계층(dBFS RMS).
#   LOUD  전원이 함께 듣는 사건 — 처형·승패·아침·투표
#   MID   나 혼자 듣는 알림 — 능력 결과·입장·카드
#   SOFT  깔리는 소리 — 밤 앰비언스·초읽기
# 개인 알림을 전체 방송과 같은 크기로 두면, 내 화면에서만 나는 소리가
# 방 전체 사건보다 커져서 무엇이 중요한지 뒤집힌다.
LOUD = -18.0
MID = -20.5
SOFT = -23.0

# 피크 상한. 0dBFS에 붙이면 인코딩 뒤 넘친다
CEIL = -1.5

# A 단5음계 + 장3화음 몇 개. 반음이 없어 어떻게 겹쳐도 긁히지 않는다
N = {
	"A1": 55.000,
	"E2": 82.407,
	"A2": 110.000,
	"C3": 130.813,
	"D3": 146.832,
	"E3": 164.814,
	"G3": 195.998,
	"A3": 220.000,
	"C4": 261.626,
	"D4": 293.665,
	"E4": 329.628,
	"G4": 391.995,
	"A4": 440.000,
	"C5": 523.251,
	"D5": 587.330,
	"E5": 659.255,
	"G5": 783.991,
	"A5": 880.000,
	"C6": 1046.502,
	"E6": 1318.510,
}


# ---------------------------------------------------------------- 기본 재료


def t(dur):
	return np.arange(int(SR * dur)) / SR


def sine(freq, dur, phase=0.0):
	return np.sin(2 * np.pi * freq * t(dur) + phase)


def noise(dur, seed):
	"""시드를 받는다 — 같은 스크립트가 늘 같은 파일을 내야 한다"""
	return np.random.default_rng(seed).standard_normal(int(SR * dur))


def decay(dur, tau):
	"""지수 감쇠. tau초마다 진폭이 1/e로 준다"""
	return np.exp(-t(dur) / tau)


def filt(x, fc, order=2, kind="lp"):
	"""
	Butterworth 진폭응답을 주파수 영역에서 곱한다.

	IIR을 직접 돌리지 않는 이유는 위상이다. 영위상 필터라 트랜지언트가
	앞뒤로 번지지 않는다 — 타격음의 첫 순간이 뭉개지면 나무가 고무가 된다.
	"""
	n = len(x)
	f = np.maximum(np.fft.rfftfreq(n, 1 / SR), 1e-6)
	r = f / fc
	h = 1 / np.sqrt(1 + r ** (2 * order)) if kind == "lp" else r**order / np.sqrt(1 + r ** (2 * order))
	return np.fft.irfft(np.fft.rfft(x) * h, n)


def band(x, lo, hi, order=2):
	return filt(filt(x, hi, order, "lp"), lo, order, "hp")


def mix(parts):
	"""(신호, 시작초) 목록을 겹친다"""
	n = max(int(SR * at) + len(sig) for sig, at in parts)
	y = np.zeros(n)
	for sig, at in parts:
		i = int(SR * at)
		y[i : i + len(sig)] += sig
	return y


def pad(x, dur):
	"""잔향 꼬리가 들어갈 자리를 뒤에 만든다"""
	n = int(SR * dur)
	return np.pad(x, (0, max(0, n - len(x))))[:n] if n < len(x) else np.pad(x, (0, n - len(x)))


# ---------------------------------------------------------------- 악기


def tone(freq, dur, tau, harm=(1.0, 0.32, 0.11, 0.05)):
	"""
	벨·차임 계열. 배음이 위로 갈수록 빨리 죽는다.

	모든 배음을 같은 속도로 죽이면 오르간처럼 납작해진다. 실제 금속과
	유리는 고배음이 먼저 사라지고 기음만 남는다 — 그 차이가 "울린다"는
	인상을 만든다.
	"""
	y = np.zeros(int(SR * dur))
	for i, amp in enumerate(harm):
		y += amp * sine(freq * (i + 1), dur) * decay(dur, tau / (1 + i * 0.75))
	return y / sum(harm)


def glide(f0, f1, dur, tau):
	"""주파수가 미끄러지는 저음 — 북·임팩트의 몸통"""
	freq = f0 * np.exp(np.log(f1 / f0) * t(dur) / dur)
	return np.sin(2 * np.pi * np.cumsum(freq) / SR) * decay(dur, tau)


def wood(freq, dur, tau, seed):
	"""나무 두드림 — 감쇠 사인 두 겹 위에 아주 짧은 노이즈 트랜지언트"""
	body = sine(freq, dur) * decay(dur, tau) + 0.45 * sine(freq * 2.76, dur) * decay(dur, tau * 0.35)
	tick = band(noise(dur, seed), 1800, 7000) * decay(dur, 0.0035)
	return body * 0.85 + tick * 0.6


def sweep(dur, f0, f1, seed, bands=14, width=1.7):
	"""
	노이즈의 밴드 중심이 시간에 따라 이동한다 — 종이·천·바람.

	시변 필터 대신 밴드별 가우시안 엔벨로프를 겹친다. 짧은 소리에서는
	귀가 구분하지 못하고, 영위상 필터만으로 끝나 구현이 한 겹 얕다.
	"""
	src = noise(dur, seed)
	out = np.zeros_like(src)
	u_t = t(dur) / dur
	sigma = 1.1 / bands
	for i in range(bands):
		u = i / (bands - 1)
		fc = f0 * (f1 / f0) ** u
		out += band(src, fc / width, fc * width) * np.exp(-((u_t - u) ** 2) / (2 * sigma**2))
	return out / bands * 4.0


def heart(dur, seed):
	"""심장박동 한 쌍 — 쿵-쿵"""
	one = glide(78, 44, 0.22, 0.055)
	two = glide(66, 38, 0.26, 0.07) * 0.8
	return pad(mix([(one, 0.0), (two, 0.30)]), dur) + 0.05 * filt(noise(dur, seed), 120, 2, "lp")


# ---------------------------------------------------------------- 공간·정규화


def room_ir(seed):
	"""
	방 하나의 임펄스 응답. 감쇠 노이즈에 고음 흡수를 걸면 작은 실내가 된다.

	에너지를 1로 맞춰 두면 컨볼루션이 레벨을 바꾸지 않는다 — 잔향을
	더 넣었다고 소리가 커지면 라우드니스 표가 무의미해진다.
	"""
	n = int(SR * ROOM_SEC)
	ir = np.random.default_rng(seed).standard_normal(n) * np.exp(-np.arange(n) / (SR * ROOM_SEC / 4.5))
	ir = filt(ir, ROOM_DAMP, 2, "lp")
	ir[0] += 1.0
	return ir / np.sqrt(np.sum(ir**2))


IR_L = room_ir(101)
IR_R = room_ir(202)


def conv(a, b):
	"""
	주파수 영역 컨볼루션.

	np.convolve는 직접 곱을 돌려서 잔향 한 번에 신호길이 × IR길이 만큼
	연산이 든다(3초 소리에 약 30억 회). 여기서는 2의 거듭제곱으로 채워
	FFT 세 번으로 끝낸다.
	"""
	n = len(a) + len(b) - 1
	nf = 1 << (n - 1).bit_length()
	return np.fft.irfft(np.fft.rfft(a, nf) * np.fft.rfft(b, nf), nf)[:n]


def spatial(x, wet):
	"""좌우에 살짝 다른 방을 걸어 폭을 만든다. 재료는 모노 하나뿐이다"""
	left = conv(x, IR_L)
	right = conv(x, IR_R)
	dry = np.pad(x, (0, len(left) - len(x)))
	return np.stack([dry * (1 - wet) + left * wet, dry * (1 - wet) + right * wet])


def finish(st, rms_db):
	"""
	tanh 리미터와 RMS 정규화를 번갈아 돌린다.

	정규화만 하면 피크가 넘고, 피크만 깎으면 RMS가 목표에 못 미친다.
	그래서 "맞춘다 → 넘치면 누른다"를 피크가 들어올 때까지 왕복하고,
	들어오는 순간 빠져나온다. 압축으로 끝내면 마지막 한 번의 감쇠가
	보정되지 않아 RMS가 목표 아래로 남는다 — 실제로 처형음이 그렇게
	-20.0dBFS로 나와서, 가장 커야 할 소리가 밤 사망음보다 작았다.
	"""
	ceiling = 10 ** (CEIL / 20)
	target = 10 ** (rms_db / 20)
	for _ in range(8):
		rms = np.sqrt(np.mean(st.mean(axis=0) ** 2))
		if rms < 1e-9:
			break
		st = st * (target / rms)
		if np.max(np.abs(st)) <= ceiling:
			break
		st = np.tanh(st / ceiling * 0.92) * ceiling
	# 크레스트가 너무 커서 끝내 못 맞춘 소리는 라우드니스를 포기하고
	# 피크를 지킨다. 넘긴 채로 내보내면 인코딩에서 깎인다
	peak = np.max(np.abs(st))
	if peak > ceiling:
		st = st * (ceiling / peak)
	# 양끝 8ms 페이드 — 없으면 재생 시작·종료에서 딸깍 소리가 난다
	n = int(SR * 0.008)
	ramp = np.linspace(0, 1, n)
	st[:, :n] *= ramp
	st[:, -n:] *= ramp[::-1]
	return st


def write_mp3(path, st, kbps=128):
	pcm = (np.clip(st.T, -1, 1) * 32767).astype("<i2").tobytes()
	enc = lameenc.Encoder()
	enc.set_bit_rate(kbps)
	enc.set_in_sample_rate(SR)
	enc.set_channels(2)
	enc.set_quality(2)
	with open(path, "wb") as fp:
		fp.write(enc.encode(pcm) + enc.flush())


# ---------------------------------------------------------------- 소리 열여섯 개


def s_join():
	"""입장 — 두 음이 부드럽게 올라간다. 환영이지 경보가 아니다"""
	return mix([(tone(N["E4"], 0.34, 0.13), 0.0), (tone(N["A4"], 0.55, 0.20), 0.10)]), 0.22


def s_reveal():
	"""직업 카드가 뒤집힌다 — 종이 스치는 소리 뒤에 3화음이 열린다"""
	card = sweep(0.20, 900, 5200, 11) * 0.55
	chord = mix(
		[
			(tone(N["A3"], 0.75, 0.28), 0.10),
			(tone(N["C4"], 0.75, 0.26), 0.16),
			(tone(N["E4"], 0.85, 0.30), 0.22),
		]
	)
	return mix([(card, 0.0), (chord, 0.0)]), 0.30


def s_night():
	"""
	밤이 내린다 — 낮은 드론 위에 종 하나.

	교체 전 nightSound.mp3는 16.5초였다. 밤 컷은 3초 안팎에 걷히므로
	나머지 13초는 밤 능력 위젯 위로 계속 흘렀다.
	"""
	dur = 3.4
	drone = (sine(N["A1"], dur) * 0.9 + sine(N["A2"], dur) * 0.5 + sine(N["E2"], dur) * 0.3) * np.minimum(
		1.0, t(dur) / 0.5
	) * decay(dur, 2.6)
	air = filt(noise(dur, 31), 700, 2, "lp") * decay(dur, 1.9) * 0.35
	bell = tone(N["A3"], 2.6, 1.05, (1.0, 0.28, 0.14, 0.07)) * 0.75
	return mix([(drone, 0.0), (air, 0.0), (bell, 0.22)]), 0.42


def s_morning():
	"""아침 — 장3화음이 아래에서 위로 열린다. 밤의 단조에서 풀려나는 지점"""
	chord = mix(
		[
			(tone(N["C4"], 1.5, 0.55), 0.00),
			(tone(N["E4"], 1.5, 0.52), 0.09),
			(tone(N["G4"], 1.6, 0.55), 0.18),
			(tone(N["C5"], 1.7, 0.60), 0.27),
		]
	)
	shimmer = mix([(tone(N["E6"], 0.5, 0.16) * 0.22, 0.42), (tone(N["C6"], 0.6, 0.20) * 0.18, 0.58)])
	return mix([(chord, 0.0), (shimmer, 0.0)]), 0.34


def s_vote():
	"""투표 개시 — 의사봉 세 번. 나무 하나로만 만든다"""
	hit = wood(196, 0.45, 0.055, 51)
	return mix([(hit, 0.0), (hit * 0.92, 0.20), (hit * 1.0, 0.40)]), 0.26


def s_tick():
	"""
	초읽기 — 여덟 번. 뒤로 갈수록 조금씩 높고 조금씩 커진다.

	교체 전 tickTockSound.mp3는 8.35초 등속이었다. 등속은 시간이 줄고
	있다는 것을 말해 주지 않는다.
	"""
	parts = []
	for i in range(8):
		up = i / 7
		click = wood(1150 * (1 + 0.16 * up), 0.13, 0.011, 71 + i) * (0.62 + 0.38 * up)
		parts.append((click, i * 0.44))
	return mix(parts), 0.18


def s_strike():
	"""
	마피아가 대상을 지목했다.

	교체 전 gunSound.WAV는 8비트 11kHz 총성이었다. 품질도 문제였지만
	더 큰 문제는 톤이다 — 이 게임의 그림은 실루엣과 촛불이지 총구가
	아니고, 실제 총성 한 방은 추리보다 액션으로 읽힌다. 대신 칼집에서
	쇠가 미끄러지는 소리와 심장박동을 겹쳐 "지목했다"는 긴장만 남긴다.
	"""
	blade = sweep(0.30, 2600, 780, 91, 12) * 0.5
	body = glide(150, 58, 0.55, 0.13) * 0.85
	return mix([(blade, 0.0), (body, 0.06), (heart(0.62, 93) * 0.55, 0.16)]), 0.26


def s_heal():
	"""의사가 지켰다 — 따뜻한 차임이 위로 세 걸음"""
	return (
		mix(
			[
				(tone(N["A4"], 0.9, 0.36), 0.00),
				(tone(N["C5"], 0.9, 0.34), 0.11),
				(tone(N["E5"], 1.1, 0.42), 0.22),
			]
		),
		0.38,
	)


def s_investigate():
	"""경찰·스파이의 조사 — 짧게 훑고 두 번 확인한다"""
	scan = sweep(0.26, 700, 3800, 111, 12) * 0.42
	beep = mix([(tone(N["E5"], 0.16, 0.045), 0.0), (tone(N["A5"], 0.22, 0.06), 0.12)]) * 0.8
	return mix([(scan, 0.0), (beep, 0.22)]), 0.24


def s_inspect():
	"""
	점쟁이가 능력을 들여다본다 — 벨에 미세한 떨림을 준다.

	경찰의 조사음과 재료를 나눈 이유는 결과가 다르기 때문이다. 경찰은
	진영을, 점쟁이는 능력의 결을 본다. 같은 소리를 쓰면 밤마다 무엇을
	봤는지 소리로는 구분되지 않는다.
	"""
	dur = 1.25
	trem = 1 + 0.16 * np.sin(2 * np.pi * 6.5 * t(dur))
	bell = tone(N["E5"], dur, 0.5, (1.0, 0.22, 0.30, 0.12)) * trem
	under = tone(N["A3"], dur, 0.42) * 0.35
	return mix([(under, 0.0), (bell, 0.05)]), 0.44


def s_blocked():
	"""
	건달에게 막혔다 — 둔탁하게 걸린다.

	잔향을 거의 주지 않는다. 울리면 공간이 열린 인상이 되는데, 여기서
	필요한 것은 정반대다.
	"""
	thud = glide(210, 92, 0.30, 0.055) * 0.9
	dull = filt(noise(0.16, 131), 900, 3, "lp") * decay(0.16, 0.03) * 0.55
	return mix([(thud, 0.0), (dull, 0.0)]), 0.10


def s_note():
	"""쪽지 — 종이가 스치고 두 음이 조용히 놓인다"""
	paper = sweep(0.32, 1400, 4600, 151, 12) * 0.42
	notes = mix([(tone(N["D4"], 0.45, 0.16), 0.14), (tone(N["A4"], 0.55, 0.20), 0.24)]) * 0.7
	return mix([(paper, 0.0), (notes, 0.0)]), 0.28


def s_execute():
	"""
	처형 — 이 게임에서 가장 큰 소리다.

	북 한 방 뒤에 잔향만 남긴다. 낮의 결론이 내려지는 지점이라
	여운이 끊기면 다음 밤으로 너무 빨리 넘어간 것처럼 들린다.
	"""
	drum = glide(96, 40, 0.9, 0.20)
	crack = band(noise(0.10, 171), 200, 2400) * decay(0.10, 0.018) * 0.6
	low = sine(N["A1"], 1.6) * decay(1.6, 0.55) * 0.5
	return mix([(crack, 0.0), (drum, 0.005), (low, 0.02)]), 0.52


def s_death():
	"""
	밤사이 누군가 죽었다 — 처형보다 작고 아래로 흐른다.

	같은 죽음이라도 처형은 모두가 내린 결정이고 밤의 죽음은 통보다.
	크기와 방향을 반대로 두어 둘을 구분한다.
	"""
	fall = glide(N["A3"], N["A2"], 1.0, 0.34) * 0.7
	air = filt(noise(1.2, 191), 1100, 2, "lp") * decay(1.2, 0.42) * 0.3
	return mix([(fall, 0.0), (air, 0.0), (tone(N["A2"], 1.3, 0.5) * 0.45, 0.10)]), 0.44


def s_citizen_win():
	"""시민 승리 — 장조 팡파르가 위로 네 걸음"""
	steps = [("C4", 0.00), ("E4", 0.13), ("G4", 0.26), ("C5", 0.39)]
	parts = [(tone(N[k], 1.6, 0.62), at) for k, at in steps]
	parts.append((mix([(tone(N["E5"], 1.4, 0.55), 0.0), (tone(N["G5"], 1.4, 0.55), 0.06)]) * 0.5, 0.52))
	return mix(parts), 0.38


def s_mafia_win():
	"""마피아 승리 — 단조로, 아래로 내려간다. 승리지만 밝지는 않다"""
	steps = [("A4", 0.00), ("E4", 0.14), ("C4", 0.28), ("A3", 0.42)]
	parts = [(tone(N[k], 1.7, 0.66), at) for k, at in steps]
	parts.append((sine(N["A1"], 1.8) * decay(1.8, 0.7) * 0.55, 0.42))
	parts.append((glide(120, 52, 0.8, 0.22) * 0.5, 0.42))
	return mix(parts), 0.36


# 파일 이름 / 만드는 함수 / 라우드니스 계층.
# 이 표가 볼륨 밸런스의 유일한 출처다.
SPECS = [
	("sfx_join.mp3", s_join, MID),
	("sfx_reveal.mp3", s_reveal, MID),
	("sfx_night.mp3", s_night, SOFT),
	("sfx_morning.mp3", s_morning, LOUD),
	("sfx_vote.mp3", s_vote, LOUD),
	("sfx_tick.mp3", s_tick, SOFT),
	("sfx_strike.mp3", s_strike, MID),
	("sfx_heal.mp3", s_heal, MID),
	("sfx_investigate.mp3", s_investigate, MID),
	("sfx_inspect.mp3", s_inspect, MID),
	("sfx_blocked.mp3", s_blocked, MID),
	("sfx_note.mp3", s_note, MID),
	("sfx_execute.mp3", s_execute, LOUD),
	("sfx_death.mp3", s_death, LOUD),
	("sfx_citizen_win.mp3", s_citizen_win, LOUD),
	("sfx_mafia_win.mp3", s_mafia_win, LOUD),
]


def main():
	res = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "res")
	res = os.path.normpath(res)
	if not os.path.isdir(res):
		sys.exit("res/ 를 찾지 못했습니다: " + res)

	print(f"{'파일':22} {'길이s':>6} {'RMS dBFS':>9} {'peak dBFS':>10} {'KB':>7}")
	for name, make, rms_db in SPECS:
		mono, wet = make()
		st = finish(spatial(mono, wet), rms_db)
		path = os.path.join(res, name)
		write_mp3(path, st)

		m = st.mean(axis=0)
		rms = 20 * np.log10(max(np.sqrt(np.mean(m**2)), 1e-9))
		peak = 20 * np.log10(max(np.max(np.abs(st)), 1e-9))
		kb = os.path.getsize(path) / 1024
		print(f"{name:22} {st.shape[1] / SR:6.2f} {rms:9.1f} {peak:10.1f} {kb:7.1f}")


if __name__ == "__main__":
	main()
