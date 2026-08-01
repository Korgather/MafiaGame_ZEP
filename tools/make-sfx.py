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

여기서는 열여섯 개를 같은 음계(A 단5음계)·같은 방(ROOM)·같은 라우드니스
기준(LOUD/MID/SOFT 셋)으로 찍어 낸다. 톤 일관성이 취향이 아니라 상수가 된다.
저작권도 따라오지 않는다 — 파형을 여기서 만들기 때문이다.

왜 이 음색인가
--------------
게임 팔레트는 어두운 갈색 바탕에 황동빛 강조다(src/ui/theme.css의
--bg #14100f, --accent #e0b355). 그래서 재료를 나무·유리·황동으로 한정하고
쇳소리와 전자음을 뺐다. 장르는 추리지 공포가 아니므로 불협은 쓰지 않는다 —
A 단5음계(A-C-D-E-G)는 반음이 없어서 어떻게 겹쳐도 긁히지 않는다.

왜 한 번 더 갈아엎었나
----------------------
첫 판은 "톤은 맞지만 몰입감이 없다"는 평을 받았다. 원인은 취향이 아니라
여섯 개의 구체적인 결함이었고, 아래 여섯 가지가 그 답이다.

1. 배음이 정수배였다.
   sin(f), sin(2f), sin(3f)... 를 쌓으면 오르간이 된다. 실제로 종·유리·
   나무는 부분음이 정수배가 아니다(종은 0.5 : 1 : 1.19 : 1.5 : 2, 나무
   막대는 1 : 2.572 : 4.644). 정수배 스택은 귀가 0.1초 만에 "신디사이저"로
   분류한다 — 이것이 합성음 티의 가장 큰 원인이었다. MODES 표로 바꿨다.

2. 타격의 접촉음이 없었다.
   물체를 때리면 몸통이 울리기 전에 2~8ms 동안 광대역 접촉 잡음이 난다.
   그게 "무엇으로 무엇을 때렸는가"를 알려 준다. 없으면 소리는 나는데
   무엇이 났는지는 모른다. modal()이 접촉음을 함께 낸다.

3. 페이드인이 8ms였다.
   finish()가 양 끝에 8ms 램프를 걸었다. 끝은 맞지만 시작은 재앙이다 —
   망치 소리의 가장 날카로운 353샘플을 정확히 깎아 냈다. 타격이 전부
   "우웁"으로 뭉갠 채 나가고 있었다. 시작은 0.6ms로 줄였다(딸깍은 막고
   트랜지언트는 남는 최소치).

4. 방이 "쉬-" 소리였다.
   감쇠 노이즈 한 겹에 고정 로우패스를 걸면 잔향이 아니라 노이즈 꼬리다.
   실제 방은 (a) 벽에서 몇 개의 또렷한 초기 반사가 먼저 돌아오고
   (b) 그 뒤 확산 꼬리가 남으며 (c) 고역이 저역보다 훨씬 빨리 흡수된다.
   셋 다 넣었다. 특히 (c)는 대역별로 다른 감쇠 상수를 써서, 방이 시간이
   갈수록 어두워진다 — 촛불 켠 실내의 인상이 여기서 나온다.

5. 스테레오가 가짜였다.
   직접음이 좌우 완전히 같아서 열여섯 개가 전부 정중앙 한 점에서 났다.
   약한 팬을 주어 장면에 배치를 만들었다(의사봉은 살짝 왼쪽, 시계는
   살짝 오른쪽). 폭은 좌우 임펄스응답이 맡는다.

   여기는 두 번 틀렸다. 처음에는 좌우 시간차와 완전히 독립인 잔향
   두 개로 폭을 벌렸는데, 측정해 보니 모노로 합칠 때 밤 소리가 6.4dB
   사라지고 1.4kHz에 9dB 골이 팼다. 스피커 하나로 듣는 사람에게는
   개선이 아니라 손상이었다. 시간차를 빼고 잔향에 공통 성분을 넣어,
   합쳐도 무너지지 않는 폭만 남겼다.

6. 소리가 화면보다 짧았다.
   초읽기가 대표적이다. TICK_TOCK_AT=9로 9초 남았을 때 울리는데 파일은
   3.6초였다 — 시계가 5.4초 먼저 멈췄다. 남은 시간을 알려 주라고 넣은
   소리가 정작 마지막 5초를 침묵으로 비웠다. 파일을 5.0초로 만들고
   STANDARD_RULES의 TICK_TOCK_AT을 5로 내려 둘을 맞췄다(속도전은 원래 5).
   밤·처형·승패도 단계 길이에 맞춰 늘렸다.

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
	"A0": 27.500,
	"E1": 41.203,
	"A1": 55.000,
	"C2": 65.406,
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


def drift(dur, seed, depth=0.004, rate=3.0):
	"""
	아주 느린 무작위 흔들림. 1에 가까운 배율로 돌려준다.

	완벽하게 고정된 주파수는 사람이 만든 소리에 없다. 지속음을 이걸로
	곱해 두면 "샘플이 재생되고 있다"가 아니라 "무언가가 울리고 있다"로
	들린다 — 깊이는 0.5% 이하라 음정으로는 인식되지 않는다.
	"""
	return 1.0 + depth * filt(noise(dur, seed), rate, 2, "lp") * 12.0


# ---------------------------------------------------------------- 악기

# 부분음 비율과 세기. 여기가 "무슨 재질인가"를 정한다.
#
# wood   실제 나무 막대의 굽힘 모드(1 : 2.572 : 4.644 : 6.984). 마림바가
#        2번째 모드를 4배로 조율해 음정을 갖는 것과 달리, 두드리는 나무는
#        조율되지 않은 이 비율 그대로 울린다.
# glass  얇은 유리 그릇. 고배음이 촘촘하고 오래 남는다.
# brass  종. 0.5(험) : 1(프라임) : 1.19(티어스) : 1.5(퀸트) : 2(노미널).
#        1.19가 단3도라서 종은 늘 조금 슬프게 들린다 — A 단조 팔레트와
#        정확히 같은 방향이라 이 게임에서는 이득이다.
# string 굵은 현. 거의 정수배지만 위로 갈수록 조금씩 날카로워진다(강성).
MODES = {
	"wood": ((1.000, 1.00), (2.572, 0.40), (4.644, 0.17), (6.984, 0.07), (10.12, 0.03)),
	"glass": ((1.000, 1.00), (2.320, 0.52), (4.250, 0.30), (6.630, 0.15), (9.380, 0.07)),
	"brass": ((0.500, 0.38), (1.000, 1.00), (1.190, 0.44), (1.500, 0.52), (2.000, 0.34), (2.660, 0.18), (3.010, 0.11)),
	"string": ((1.000, 1.00), (2.003, 0.46), (3.012, 0.26), (4.030, 0.14), (5.060, 0.08), (6.100, 0.04)),
}

# 위 모드가 기음보다 얼마나 빨리 죽는가. 나무는 순식간에, 유리·황동은 오래.
DECAY_EXP = {"wood": 0.95, "glass": 0.55, "brass": 0.48, "string": 0.70}

# 접촉음의 대역과 길이 — 무엇으로 때렸는가.
CONTACT = {
	"wood": (1600, 7500, 0.0035),
	"glass": (2600, 12000, 0.0022),
	"brass": (900, 6000, 0.0060),
	"string": (400, 3500, 0.0090),
}


def modal(freq, dur, tau, mat, seed, hit=0.30):
	"""
	모달 합성 — 부분음마다 제 비율·제 세기·제 감쇠를 갖는 울림.

	정수배 배음 스택과의 차이가 이 파일에서 가장 큰 음질 차이다. 실제
	물체는 모드마다 감쇠가 다르다: 고배음이 먼저 사라지고 기음만 남는
	과정이 "울린다"는 인상 자체다. 여기에 앞 몇 밀리초의 접촉 잡음을
	얹어야 비로소 "때렸다"가 된다.

	hit는 접촉음의 양이다. 0이면 때린 게 아니라 그냥 울리는 소리다.
	"""
	rng = np.random.default_rng(seed)
	tt = t(dur)
	y = np.zeros(len(tt))
	total = 0.0
	for ratio, amp in MODES[mat]:
		f = freq * ratio * (1.0 + rng.normal(0.0, 0.0012))
		if f >= SR * 0.45:
			continue
		# 위상을 완전히 맞추면 t=0에 모든 모드가 겹쳐 크레스트가 치솟고
		# 리미터가 그걸 눌러 정작 타격이 무뎌진다. 아주 조금만 흩는다
		y += amp * np.sin(2 * np.pi * f * tt + rng.uniform(-0.25, 0.25)) * np.exp(-tt / (tau / ratio ** DECAY_EXP[mat]))
		total += amp
	y /= max(total, 1e-9)
	if hit > 0:
		lo, hi, ctau = CONTACT[mat]
		y = y + hit * band(noise(dur, seed + 7), lo, hi) * decay(dur, ctau)
	return y


def glide(f0, f1, dur, tau):
	"""주파수가 미끄러지는 저음 — 북·임팩트의 몸통"""
	freq = f0 * np.exp(np.log(f1 / f0) * t(dur) / dur)
	return np.sin(2 * np.pi * np.cumsum(freq) / SR) * decay(dur, tau)


def sub(f0, f1, dur, tau, warm=1.6):
	"""
	가슴으로 듣는 층. 40Hz 근처로 떨어지는 사인에 약한 포화를 준다.

	포화가 없으면 작은 스피커와 노트북에서는 그냥 사라진다 — 배음이
	생겨야 저음이 없는 장치에서도 "낮은 것이 있었다"가 전달된다.
	"""
	return np.tanh(glide(f0, f1, dur, tau) * warm) / np.tanh(warm)


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
	one = sub(78, 42, 0.24, 0.055)
	two = sub(66, 36, 0.28, 0.070) * 0.8
	return pad(mix([(one, 0.0), (two, 0.30)]), dur) + 0.05 * filt(noise(dur, seed), 120, 2, "lp")


def air(dur, seed, level=0.0028):
	"""
	방의 바닥 소음. 완전한 디지털 무음은 "공간"이 아니라 "파일"로 들린다.

	-50dB 언저리라 의식되지는 않는다. 빼 보면 소리가 진공에서 나는 것처럼
	들린다는 것만 알 수 있다 — 긴 소리에만 넣는다.
	"""
	return filt(noise(dur, seed), 520, 1, "lp") * level * 6.0


# ---------------------------------------------------------------- 공간

# 방 하나. 소리마다 다른 방을 쓰면 톤이 흩어진다.
# 촛불 켠 마을 회관 정도 — 나무 바닥, 낮은 천장, 두꺼운 커튼.
ROOM_SEC = 1.10

# 대역별 확산 꼬리 감쇠(Hz_lo, Hz_hi, tau초).
# 고역이 저역보다 네 배 빨리 죽는다. 이 기울기가 "닫힌 실내"의 정체다 —
# 전부 같은 tau로 두면 어떤 방도 아닌 그냥 노이즈 꼬리가 된다.
ROOM_BANDS = ((30, 200, 0.26), (200, 800, 0.20), (800, 2500, 0.125), (2500, 7000, 0.058))

# 초기 반사 — 벽에서 또렷하게 돌아오는 몇 개. 확산 꼬리보다 이쪽이
# 방의 크기를 결정한다. 사람은 첫 60ms로 공간을 판단한다.
EARLY_N = 16
EARLY_FROM = 0.008
EARLY_TO = 0.062


def room_ir(seed, direct=1.0):
	"""직접음 + 초기 반사 + 대역별 확산 꼬리"""
	rng = np.random.default_rng(seed)
	n = int(SR * ROOM_SEC)
	ir = np.zeros(n)
	ir[0] = direct

	for i in range(EARLY_N):
		u = (i + rng.uniform(0.0, 0.7)) / EARLY_N
		at = int(SR * (EARLY_FROM * (EARLY_TO / EARLY_FROM) ** u))
		# 부호를 섞는다. 전부 같은 부호면 빗살 간섭이 생겨 금속통이 된다
		gain = (0.62 ** (1 + 3.4 * u)) * rng.choice([-1.0, 1.0]) * rng.uniform(0.7, 1.0)
		ir[at] += gain
		# 반사는 벽을 한 번 더 거칠수록 어두워진다
		ir[at + 1 : at + 40] += gain * 0.25 * np.exp(-np.arange(39) / 9.0) * rng.standard_normal(39) * 0.4

	tail = np.zeros(n)
	src = rng.standard_normal(n)
	tt = np.arange(n) / SR
	for lo, hi, tau in ROOM_BANDS:
		tail += band(src, lo, hi) * np.exp(-tt / tau)
	# 꼬리는 직접음이 지난 뒤부터 자란다. 0부터 최대로 넣으면 초기 반사가
	# 노이즈에 묻혀 방의 크기가 사라진다
	ir += tail * 0.42 * np.minimum(1.0, tt / 0.020)
	return ir


def _norm(ir):
	"""
	에너지를 1로 맞춘다. 그래야 컨볼루션이 레벨을 바꾸지 않는다 —
	잔향을 더 넣었다고 소리가 커지면 라우드니스 표가 무의미해진다.
	"""
	return ir / np.sqrt(np.sum(ir**2))


# 좌우 편차의 비중. 0이면 완전 모노, 1이면 완전 독립.
ROOM_SPREAD = 0.45

# 좌우 임펄스응답은 공통 성분을 공유하고 편차만 채널마다 다르다.
#
# 처음에는 서로 독립인 난수 두 개로 만들었다. 폭은 넓었지만 모노에서
# 상쇄됐다 — 측정해 보니 밤 소리의 좌우 상관이 -0.55, 즉 역상이었고
# 좌우를 합치면 6.4dB가 사라졌다. 스피커 하나로 듣는 사람에게는 밤
# 앰비언스가 반쯤 지워진다는 뜻이다.
#
# 공통 성분(_BASE)을 두면 합산이 안전해지면서 폭도 남는다. 편차 IR에는
# 직접음을 넣지 않는다 — 직접음까지 갈라지면 소리의 본체가 둘로 보인다.
_BASE = room_ir(101)
IR_L = _norm(_BASE + ROOM_SPREAD * room_ir(202, direct=0.0))
IR_R = _norm(_BASE + ROOM_SPREAD * room_ir(303, direct=0.0))

# 직접음과 방 사이의 간격. 이게 없으면 소리가 벽에 붙어 있다
PREDELAY = int(SR * 0.014)


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


def spatial(x, wet, pan=0.0):
	"""
	모노 재료 하나를 방에 놓는다.

	직접음의 좌우 차이는 레벨(등출력 팬)로만 준다. 좌우에 시간차를 주면
	폭은 더 넓어지지만 모노로 합칠 때 빗살 간섭이 생긴다 — 0.35ms를
	줬더니 1.4kHz 부근에 최대 9dB 골이 팼다. 목소리 대역 한가운데다.
	레벨 차이는 어떻게 합쳐도 상쇄되지 않는다.

	팬은 ±0.3을 넘기지 않는다. 한쪽 스피커만 듣는 사람에게 사건이
	통째로 사라지면 안 된다. 폭은 좌우 임펄스응답이 맡는다.
	"""
	ang = (np.pi / 4) * (1.0 + max(-0.3, min(0.3, pan)) / 0.3 * 0.55)
	gl, gr = np.cos(ang) * 1.414, np.sin(ang) * 1.414

	src = np.pad(x, (PREDELAY, 0))
	left = conv(src, IR_L)
	right = conv(src, IR_R)
	n = max(len(left), len(right), len(x))
	fit = lambda v: np.pad(v, (0, n - len(v)))
	dry = fit(x)
	return np.stack(
		[
			dry * gl * (1 - wet) + fit(left) * wet,
			dry * gr * (1 - wet) + fit(right) * wet,
		]
	)


# ---------------------------------------------------------------- 마무리


def normalize(st, rms_db):
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
	return st


def trim(st, below_peak_db=-58.0, tail_ms=60):
	"""
	들리지 않는 꼬리를 자른다. 기준은 절대값이 아니라 그 소리의 피크 대비다.

	방이 1.1초라 컨볼루션은 모든 소리에 1.1초를 덧붙인다. 0.7초짜리
	차단음이 1.8초 파일이 되고 뒤 1초는 사실상 무음이다 — 용량도 낭비지만
	다음 소리가 그만큼 늦게 시작하는 것처럼 들린다.

	정규화보다 먼저 돌린다. 뒤에 두면 무음을 잘라 낸 만큼 RMS가 올라가서
	맞춰 둔 라우드니스가 어긋난다 — 실제로 투표음이 목표보다 0.7dB 크게
	나왔고, 그 0.7dB가 계층 간 간격(2.5dB)의 3분의 1이었다.
	"""
	peak = np.max(np.abs(st))
	if peak < 1e-9:
		return st
	amp = np.max(np.abs(st), axis=0)
	over = np.nonzero(amp > peak * 10 ** (below_peak_db / 20))[0]
	if len(over) == 0:
		return st
	return st[:, : min(st.shape[1], over[-1] + int(SR * tail_ms / 1000))]


def edges(st):
	"""
	양 끝 처리. 시작과 끝이 대칭이 아니다.

	끝은 8ms 페이드로 충분하다. 시작은 0.6ms여야 한다 — 8ms를 걸면
	44.1kHz에서 353샘플, 즉 타격음의 가장 날카로운 구간을 통째로 깎는다.
	첫 판에서 망치와 노크가 전부 "우웁"으로 뭉갠 채 나간 원인이 이거였다.
	0.6ms면 DC 딸깍은 막고 트랜지언트는 남는다.
	"""
	a = max(1, int(SR * 0.0006))
	b = int(SR * 0.008)
	st[:, :a] *= np.linspace(0, 1, a)
	st[:, -b:] *= np.linspace(1, 0, b)
	return st


def write_mp3(path, st, kbps=160):
	pcm = (np.clip(st.T, -1, 1) * 32767).astype("<i2").tobytes()
	enc = lameenc.Encoder()
	enc.set_bit_rate(kbps)
	enc.set_in_sample_rate(SR)
	enc.set_channels(2)
	enc.set_quality(2)
	with open(path, "wb") as fp:
		fp.write(enc.encode(pcm) + enc.flush())


# ---------------------------------------------------------------- 소리 열여섯 개
#
# 각 함수는 (모노 재료, 잔향량, 팬)을 돌려준다.


def s_join():
	"""입장 — 문을 가볍게 두드리고 낮은 종이 하나 답한다. 환영이지 경보가 아니다"""
	knock = mix(
		[
			(modal(N["G3"], 0.30, 0.045, "wood", 11, hit=0.42), 0.00),
			(modal(N["G3"] * 1.06, 0.30, 0.040, "wood", 12, hit=0.38) * 0.75, 0.085),
		]
	)
	bell = modal(N["A4"], 0.85, 0.30, "brass", 13, hit=0.10) * 0.42
	return mix([(knock, 0.0), (bell, 0.16)]), 0.30, -0.12


def s_reveal():
	"""
	직업 카드가 뒤집힌다 — 카드가 손끝에서 튕기고 3화음이 열린다.

	판이 열리는 유일한 소리라 아래에 낮은 부풂을 하나 깐다. 화음만으로는
	"알림"이지 "시작"이 아니다.
	"""
	flick = sweep(0.16, 1200, 6800, 21, 12) * 0.62
	snap = band(noise(0.05, 22), 2200, 9000) * decay(0.05, 0.0028) * 0.55
	chord = mix(
		[
			(modal(N["A3"], 1.10, 0.42, "brass", 23, hit=0.14), 0.10),
			(modal(N["C4"], 1.10, 0.38, "brass", 24, hit=0.10) * 0.80, 0.17),
			(modal(N["E4"], 1.30, 0.46, "brass", 25, hit=0.08) * 0.70, 0.24),
		]
	)
	swell = sine(N["A1"], 1.30) * np.minimum(1.0, t(1.30) / 0.35) * decay(1.30, 0.75) * 0.45
	return mix([(flick, 0.0), (snap, 0.005), (chord, 0.0), (swell, 0.02)]), 0.36, 0.0


def s_night():
	"""
	밤이 내린다 — 6.4초. 이 게임에서 공간을 가장 넓게 여는 소리다.

	밤은 22초(속도전 12초)라 길이는 문제가 아니다. 오히려 짧으면 밤이
	'시작 알림' 하나로 끝나고 나머지 18초는 무음 위에서 능력을 고른다.
	낮은 드론 위에 먼 종을 하나 두고 잔향을 크게 걸어, 능력 위젯을 보는
	동안에도 방이 계속 울리게 한다.

	교체 전 nightSound.mp3는 16.5초였다 — 그건 반대로 다음 단계까지 넘쳤다.
	"""
	dur = 6.4
	dr = drift(dur, 41, 0.006, 2.2)
	body = (
		np.sin(2 * np.pi * np.cumsum(N["A1"] * dr) / SR) * 0.95
		+ np.sin(2 * np.pi * np.cumsum(N["E2"] * dr) / SR) * 0.45
		+ np.sin(2 * np.pi * np.cumsum(N["A2"] * dr) / SR) * 0.28
	)
	drone = body * np.minimum(1.0, t(dur) / 0.9) * decay(dur, 3.2)
	wind = filt(noise(dur, 42), 620, 2, "lp") * (0.30 + 0.16 * np.sin(2 * np.pi * 0.21 * t(dur))) * decay(dur, 3.6)
	far = modal(N["A3"], 4.4, 1.45, "brass", 43, hit=0.06) * 0.60
	low = modal(N["A2"], 3.2, 1.10, "string", 44, hit=0.0) * 0.30
	return mix([(drone, 0.0), (wind, 0.0), (far, 0.55), (low, 2.40), (air(dur, 45), 0.0)]), 0.62, 0.0


def s_morning():
	"""
	아침 — 유리 화음이 아래에서 위로 열리고 공기가 밝아진다.

	밤의 단조에서 풀려나는 지점이라 여기만 장3화음을 쓴다. 위에 얇은
	고역 스침을 얹어 "빛이 들어왔다"를 재질로도 준다.
	"""
	dur = 3.2
	chord = mix(
		[
			(modal(N["C4"], 2.2, 0.85, "glass", 51, hit=0.18), 0.00),
			(modal(N["E4"], 2.2, 0.80, "glass", 52, hit=0.14) * 0.86, 0.10),
			(modal(N["G4"], 2.3, 0.85, "glass", 53, hit=0.12) * 0.74, 0.20),
			(modal(N["C5"], 2.4, 0.95, "glass", 54, hit=0.10) * 0.62, 0.31),
		]
	)
	light = sweep(1.5, 2400, 9000, 55, 16) * 0.20
	shimmer = mix([(modal(N["E6"], 0.7, 0.22, "glass", 56, hit=0.0) * 0.16, 0.55)])
	warm = sine(N["C3"], dur) * np.minimum(1.0, t(dur) / 0.25) * decay(dur, 1.1) * 0.30
	return mix([(chord, 0.0), (light, 0.18), (shimmer, 0.0), (warm, 0.0)]), 0.40, 0.0


def s_vote():
	"""
	투표 개시 — 의사봉 세 번. 잔향을 크게 걸어 방을 법정 크기로 연다.

	세 번의 세기와 간격을 조금씩 다르게 둔다. 같은 파형 세 개를 등간격으로
	놓으면 사람이 아니라 메트로놈이 친 것으로 들린다.
	"""
	gav = lambda seed, gain: modal(N["G3"], 0.55, 0.055, "wood", seed, hit=0.55) * gain
	body = sub(120, 62, 0.30, 0.055) * 0.35
	return (
		mix(
			[
				(gav(61, 1.00), 0.000),
				(body, 0.000),
				(gav(62, 0.88), 0.215),
				(body * 0.8, 0.215),
				(gav(63, 1.04), 0.415),
				(body, 0.415),
			]
		),
		0.48,
		-0.22,
	)


def s_tick():
	"""
	초읽기 — 타가 5.0초에 걸쳐 놓이고 마지막 하나가 마감에 떨어진다.

	교체 전 tickTockSound.mp3는 8.35초 등속이었고, 첫 판은 3.6초였다.
	둘 다 틀렸다. 등속은 시간이 줄고 있다는 것을 말해 주지 않고, 3.6초는
	TICK_TOCK_AT=9보다 짧아 마지막 5.4초를 침묵으로 비웠다 — 남은 시간을
	알려 주라고 넣은 소리가 정작 가장 급한 구간에서 사라졌다.

	이제 타의 배치와 규칙(RuleSet.timing.TICK_TOCK_AT=5)이 같은 값이라
	마지막 타와 마감이 겹친다. 간격은 0.62초에서 0.24초로 좁혀지고 음도
	함께 올라간다. 파일이 5초보다 조금 긴 것은 마지막 타의 잔향이며,
	그 꼬리는 다음 단계의 소리 아래에 자연스럽게 깔린다.
	"""
	span, last = 5.0, 4.90
	times, at, i = [], 0.0, 0
	while at < last - 1e-6:
		times.append(at)
		u = at / last
		at += 0.62 - 0.38 * u**1.35
		i += 1
	times.append(last)
	parts = []
	for i, at in enumerate(times):
		u = at / last
		click = modal(940 * (1 + 0.30 * u), 0.16, 0.010 + 0.004 * (1 - u), "wood", 71 + i, hit=0.50)
		parts.append((click * (0.52 + 0.48 * u), at))
	return pad(mix(parts), span), 0.22, 0.20


def s_strike():
	"""
	마피아가 대상을 지목했다.

	교체 전 gunSound.WAV는 8비트 11kHz 총성이었다. 품질도 문제였지만
	더 큰 문제는 톤이다 — 이 게임의 그림은 실루엣과 촛불이지 총구가
	아니고, 실제 총성 한 방은 추리보다 액션으로 읽힌다. 대신 칼집에서
	쇠가 미끄러지는 소리와 심장박동을 겹쳐 "지목했다"는 긴장만 남긴다.

	서브를 앞으로 당기고 세게 준다. 이 소리는 방 전체가 듣는데, 무슨
	일이 일어났는지는 알려 주지 않아야 한다 — 정보가 아니라 압력이다.
	"""
	blade = sweep(0.34, 2800, 700, 91, 14) * 0.48
	drop = sub(160, 48, 0.70, 0.16) * 0.95
	pulse = heart(0.75, 93) * 0.50
	return mix([(blade, 0.0), (drop, 0.04), (pulse, 0.20)]), 0.30, 0.0


def s_heal():
	"""의사가 지켰다 — 유리 차임이 위로 세 걸음. 따뜻하게, 흔들리지 않게"""
	return (
		mix(
			[
				(modal(N["A4"], 1.30, 0.50, "glass", 101, hit=0.16), 0.00),
				(modal(N["C5"], 1.30, 0.46, "glass", 102, hit=0.13) * 0.85, 0.11),
				(modal(N["E5"], 1.60, 0.58, "glass", 103, hit=0.11) * 0.72, 0.22),
				(sine(N["A2"], 1.6) * np.minimum(1.0, t(1.6) / 0.2) * decay(1.6, 0.55) * 0.26, 0.0),
			]
		),
		0.44,
		0.14,
	)


def s_investigate():
	"""
	경찰·스파이의 조사 — 문을 두 번 두드리고 낮게 확인한다.

	첫 판은 여기에 사인 두 개짜리 '삐-삐'를 넣었다. 이 파일 맨 위에
	전자음을 뺐다고 적어 놓고 정작 조사음만 전자음이었다 — 게다가 그건
	경찰이 무전기를 든 그림이지, 촛불 들고 문 앞에 선 그림이 아니다.
	"""
	knock = mix(
		[
			(modal(N["D4"], 0.26, 0.030, "wood", 111, hit=0.58), 0.000),
			(modal(N["D4"] * 0.97, 0.26, 0.028, "wood", 112, hit=0.54) * 0.9, 0.135),
		]
	)
	answer = modal(N["A3"], 0.85, 0.26, "string", 113, hit=0.10) * 0.40
	return mix([(knock, 0.0), (answer, 0.30)]), 0.34, -0.16


def s_inspect():
	"""
	점쟁이가 능력을 들여다본다 — 유리가 울리고 아래가 천천히 흔들린다.

	경찰의 조사음과 재료를 나눈 이유는 결과가 다르기 때문이다. 경찰은
	진영을, 점쟁이는 능력의 결을 본다. 같은 소리를 쓰면 밤마다 무엇을
	봤는지 소리로는 구분되지 않는다. 나무(두드림) 대 유리(들여다봄)는
	재질부터 다르므로 한 번만 들어도 갈린다.
	"""
	dur = 1.9
	trem = 1 + 0.14 * np.sin(2 * np.pi * 5.8 * t(dur))
	bowl = modal(N["E5"], dur, 0.62, "glass", 121, hit=0.12) * trem
	under = modal(N["A3"], 1.6, 0.55, "string", 122, hit=0.0) * 0.34 * drift(1.6, 123, 0.010, 4.0)
	return mix([(under, 0.0), (bowl, 0.06)]), 0.50, 0.18


def s_blocked():
	"""
	건달에게 막혔다 — 둔탁하게 걸린다.

	잔향을 거의 주지 않는다. 울리면 공간이 열린 인상이 되는데, 여기서
	필요한 것은 정반대다. 접촉음도 대역을 눌러 "먹은" 소리로 만든다.
	"""
	thud = sub(200, 76, 0.34, 0.055) * 0.95
	dull = filt(noise(0.20, 131), 760, 3, "lp") * decay(0.20, 0.028) * 0.55
	dead = modal(N["E2"], 0.30, 0.035, "wood", 132, hit=0.20) * 0.40
	return mix([(thud, 0.0), (dull, 0.0), (dead, 0.0)]), 0.10, 0.0


def s_note():
	"""쪽지 — 종이가 접히고 나무 두 음이 조용히 놓인다"""
	paper = sweep(0.36, 1300, 5000, 141, 13) * 0.46
	crease = band(noise(0.04, 142), 1800, 8000) * decay(0.04, 0.0035) * 0.35
	notes = mix(
		[
			(modal(N["D4"], 0.55, 0.16, "wood", 143, hit=0.22), 0.16),
			(modal(N["A4"], 0.70, 0.22, "wood", 144, hit=0.18) * 0.8, 0.27),
		]
	)
	return mix([(paper, 0.0), (crease, 0.20), (notes, 0.0)]), 0.32, 0.10


def s_execute():
	"""
	처형 — 이 게임에서 가장 큰 소리다. 3.2초.

	개표 화면이 7초(속도전 4초) 떠 있으므로 여운을 길게 남길 수 있다.
	나무 망치 한 방, 그 아래 서브 드롭, 그리고 방이 닫히는 소리.
	낮의 결론이 내려지는 지점이라 여운이 끊기면 다음 밤으로 너무 빨리
	넘어간 것처럼 들린다.
	"""
	crack = band(noise(0.12, 151), 250, 3200) * decay(0.12, 0.016) * 0.72
	mallet = modal(N["E3"], 1.20, 0.085, "wood", 152, hit=0.60) * 1.0
	drop = sub(105, 36, 1.40, 0.30) * 0.95
	tail = modal(N["A1"], 2.60, 0.95, "string", 153, hit=0.0) * 0.42
	return mix([(crack, 0.0), (mallet, 0.004), (drop, 0.010), (tail, 0.05), (air(3.0, 154), 0.0)]), 0.54, 0.0


def s_death():
	"""
	밤사이 누군가 죽었다 — 처형보다 작고 아래로 흐른다. 2.6초.

	같은 죽음이라도 처형은 모두가 내린 결정이고 밤의 죽음은 통보다.
	크기와 방향을 반대로 두어 둘을 구분한다. 심장이 한 번 뛰고 멈춘 뒤
	현이 아래로 미끄러진다 — 죽은 본인만 듣는 소리라 서술에 가깝다.
	"""
	beat = heart(0.60, 161) * 0.75
	fall = glide(N["A3"], N["A2"] * 0.97, 1.60, 0.52) * 0.62
	body = modal(N["A2"], 2.20, 0.80, "string", 162, hit=0.05) * 0.45 * drift(2.20, 163, 0.008, 2.5)
	hush = filt(noise(2.4, 164), 900, 2, "lp") * decay(2.4, 0.75) * 0.22
	return mix([(beat, 0.0), (fall, 0.34), (body, 0.40), (hush, 0.0), (air(2.6, 165), 0.0)]), 0.50, 0.0


def s_citizen_win():
	"""
	시민 승리 — 황동 팡파르가 위로 네 걸음. 4.2초.

	종료 화면이 16초(속도전 10초)라 충분히 펼칠 수 있다. 마지막에
	두 음을 겹쳐 화음으로 닫는다. 밝지만 요란하지는 않게 — 이겼어도
	누군가는 밤에 죽었다.
	"""
	steps = [("C4", 0.00, 1.00), ("E4", 0.15, 0.92), ("G4", 0.30, 0.86), ("C5", 0.45, 0.80)]
	parts = [(modal(N[k], 2.6, 0.95, "brass", 171 + i, hit=0.20) * g, at) for i, (k, at, g) in enumerate(steps)]
	parts.append((modal(N["E5"], 2.4, 0.90, "brass", 175, hit=0.14) * 0.46, 0.60))
	parts.append((modal(N["G5"], 2.4, 0.88, "brass", 176, hit=0.12) * 0.38, 0.66))
	parts.append((sine(N["C3"], 3.4) * np.minimum(1.0, t(3.4) / 0.3) * decay(3.4, 1.30) * 0.34, 0.02))
	parts.append((air(4.0, 177), 0.0))
	return mix(parts), 0.46, 0.0


def s_mafia_win():
	"""
	마피아 승리 — 단조로, 아래로 내려간다. 4.4초.

	승리지만 밝지는 않다. 종의 1.19 부분음(단3도)이 여기서 가장 잘 듣는다.
	마지막에 서브가 바닥까지 떨어지고 방이 닫힌다.
	"""
	steps = [("A4", 0.00, 1.00), ("E4", 0.16, 0.94), ("C4", 0.32, 0.88), ("A3", 0.48, 0.84)]
	parts = [(modal(N[k], 2.8, 1.05, "brass", 181 + i, hit=0.18) * g, at) for i, (k, at, g) in enumerate(steps)]
	parts.append((modal(N["A2"], 3.2, 1.20, "string", 185, hit=0.06) * 0.50, 0.48))
	parts.append((sub(120, 34, 2.20, 0.60) * 0.70, 0.50))
	parts.append((sine(N["A0"], 3.6) * np.minimum(1.0, t(3.6) / 0.4) * decay(3.6, 1.40) * 0.30, 0.50))
	parts.append((air(4.2, 186), 0.0))
	return mix(parts), 0.52, 0.0


def s_nominate():
	"""
	최다 득표자가 단상에 올랐다 — 재판의 시작. 2.7초.

	처형(s_execute)과 같은 LOUD인데도 헷갈리지 않는 이유는 성격이 반대이기
	때문이다. 처형은 파열음으로 닫고 이쪽은 종으로 연다. 개표 화면이 열리는
	순간이라 낮·투표와 같은 phase 전환이고 전원의 주의를 요구하므로 계층도
	그 자리에 둔다.

	낮은 종 한 번 뒤에 나무 타격 두 번 — 단으로 올라가는 두 걸음이다. 두
	번째를 더 낮고 세게 두어 무게가 앞으로 쏠린다. 서브가 단에 서는 순간을
	받치고 현이 풀리지 않은 채 남는다. 아직 아무도 죽지 않았다.
	"""
	bell = modal(N["C3"], 2.20, 0.72, "brass", 201, hit=0.22) * 0.86
	step1 = modal(N["G3"], 0.60, 0.060, "wood", 202, hit=0.58) * 0.62
	step2 = modal(N["E3"], 0.72, 0.075, "wood", 203, hit=0.62) * 0.78
	stand = sub(112, 46, 1.00, 0.22) * 0.52
	tail = modal(N["A2"], 2.40, 1.05, "string", 204, hit=0.0) * 0.34
	parts = [(bell, 0.0), (step1, 0.30), (step2, 0.52), (stand, 0.52), (tail, 0.30)]
	parts.append((air(2.9, 205), 0.0))
	return mix(parts), 0.52, 0.0


def s_acquit():
	"""
	부결 — 단상에 오른 사람이 살아남았다. 2.2초.

	처형보다 한 계층 낮다. 안심을 크게 울리면 그 자체가 놀람이 되고, 무엇보다
	판이 끝나지 않았다는 사실을 소리가 말해야 한다. 지금까지 부결은 무음이라
	"아무 일도 없음"과 "살아남음"이 구별되지 않았다.

	유리 두 음이 완전4도로 올라간다(E4→A4). 그 위에 5도 하나를 얹어 3음을
	비워 둔다 — 화음이 A에 닿지만 밝은지 어두운지는 정해지지 않는다. 살았다는
	것 말고는 아직 아무것도 밝혀지지 않은 낮이다. 숨을 내려놓는 공기가 뒤를
	받고 낮은 현 하나가 유보를 남긴다.
	"""
	up1 = modal(N["E4"], 1.30, 0.42, "glass", 211, hit=0.26) * 0.72
	up2 = modal(N["A4"], 1.60, 0.50, "glass", 212, hit=0.22) * 0.80
	open5 = modal(N["E5"], 1.40, 0.44, "glass", 213, hit=0.14) * 0.34
	breath = filt(noise(0.90, 214), 1400, 2, "lp") * decay(0.90, 0.30) * 0.20
	hold = modal(N["A2"], 2.00, 0.90, "string", 215, hit=0.0) * 0.30
	parts = [(up1, 0.0), (up2, 0.16), (open5, 0.24), (breath, 0.0), (hold, 0.16)]
	parts.append((air(2.4, 216), 0.0))
	return mix(parts), 0.44, 0.0


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
	("sfx_nominate.mp3", s_nominate, LOUD),
	("sfx_execute.mp3", s_execute, LOUD),
	("sfx_acquit.mp3", s_acquit, MID),
	("sfx_death.mp3", s_death, LOUD),
	("sfx_citizen_win.mp3", s_citizen_win, LOUD),
	("sfx_mafia_win.mp3", s_mafia_win, LOUD),
]


def main():
	# 표에 한글이 있다. Windows 콘솔 기본 코드페이지로 나가면 깨진다
	try:
		sys.stdout.reconfigure(encoding="utf-8")
	except (AttributeError, OSError):
		pass

	res = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "res")
	res = os.path.normpath(res)
	if not os.path.isdir(res):
		sys.exit("res/ 를 찾지 못했습니다: " + res)

	print(f"{'파일':22} {'길이s':>6} {'RMS dBFS':>9} {'peak dBFS':>10} {'KB':>7}")
	total = 0.0
	for name, make, rms_db in SPECS:
		mono, wet, pan = make()
		# 자르고 → 맞추고 → 끝을 다듬는다. 이 순서가 아니면 라우드니스가 어긋난다
		st = edges(normalize(trim(spatial(mono, wet, pan)), rms_db))
		path = os.path.join(res, name)
		write_mp3(path, st)

		m = st.mean(axis=0)
		rms = 20 * np.log10(max(np.sqrt(np.mean(m**2)), 1e-9))
		peak = 20 * np.log10(max(np.max(np.abs(st)), 1e-9))
		kb = os.path.getsize(path) / 1024
		total += kb
		print(f"{name:22} {st.shape[1] / SR:6.2f} {rms:9.1f} {peak:10.1f} {kb:7.1f}")
	print(f"{'합계':22} {'':6} {'':9} {'':10} {total:7.1f}")


if __name__ == "__main__":
	main()
