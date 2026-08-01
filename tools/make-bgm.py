"""
배경음악 합성 — res/bgm_night.mp3 · bgm_day.mp3 · bgm_trial.mp3.

왜 합성인가
-----------
효과음과 같은 이유다(tools/make-sfx.py 머리말). 출처가 다른 음원은 녹음
공간·라우드니스가 제각각이어서 낱개로는 좋아도 이어 붙이면 톤이 흩어진다.
여기서도 같은 음계(A 단5음계)와 같은 재료(나무·유리)만 쓴다 — 그래야
효과음 열여덟 개와 배경음악 세 개가 한 게임에서 난 소리로 들린다.

배경음악에는 조건이 하나 더 붙는다. 효과음은 한 번 울리고 끝나지만
배경음악은 판이 끝날 때까지 같은 파일을 되풀이한다. 그래서 "이어 붙였을 때
티가 나지 않는가"가 음색보다 먼저다.

무이음 루프를 만드는 방법
-------------------------
파형을 잘라 맞추는 대신 처음부터 주기 함수로만 만든다.

  1. 루프 길이를 n 샘플로 정하고, 모든 사인의 주파수를 SR/n의 정수배로
     맞춘다(snap). 그러면 마지막 샘플 다음이 첫 샘플과 정확히 이어진다.
     느린 물결(디튠·LFO)의 주기도 같은 격자에 얹어 루프에 딱 들어가게 한다.
  2. 잡음은 FFT로 거른다(cfilt). 원형 필터라서 걸러도 주기성이 깨지지 않는다.
     시간 영역 필터를 쓰면 파일 앞머리에 필터가 채워지는 구간이 생겨서,
     하필 이음매에서 소리가 달라진다.
  3. 감쇠하는 음 하나하나는 꼬리가 루프 끝을 넘을 때 처음으로 감아 넣는다
     (place). 그래서 이음매 위에 걸친 종소리도 잘리지 않는다.

페이드아웃을 걸지 않는 것이 요점이다. 양 끝을 무음으로 깎으면 이음매는
숨지만 대신 몇 초마다 음악이 주저앉는다 — 8초짜리 루프에서 그것은
"음악이 끊긴다"로 들린다. 위 세 규칙은 깎지 않고도 이어지게 한다.
실행하면 곡마다 찍히는 "이음매" 수치가 그 검산이다(1보다 작아야 한다 — 자세한
기준은 main 안에 적었다).

남는 이음매는 하나뿐이다. MP3는 인코더 지연 때문에 파일 앞뒤에 1000샘플
남짓의 여백이 생기고, 그것까지 없애려면 WAV나 OGG여야 한다. 16초를 WAV로
두면 모노 16비트에서도 1.4MB라 맵 용량으로 감당이 안 되므로 MP3를 쓰고,
대신 루프 경계를 리듬이 비는 자리에 두었다 — 약 25ms의 여백이 타점을
자르지 않고 드론의 숨처럼 지나간다.

왜 모노인가
-----------
효과음은 스테레오다. 어느 쪽에서 났는지가 정보이기 때문이다(누가 죽었나,
어디서 났나). 배경음악에는 그 정보가 없고, 모노로 두면 파일이 절반이 된다.
맵 하나에 실리는 용량은 접속할 때마다 모두가 내려받는 값이라 그 절반이 싸다.

왜 이 세 곡인가
---------------
밤·낮·재판이 게임에서 성격이 다른 세 시간이다. 셋의 차이를 배율만으로
말하면 폰에서는 잘 보이지 않고(화면이 좁아 배율 차가 덜 느껴진다), 컷은
3초면 걷힌다. 음악은 단계가 이어지는 내내 남는 유일한 신호다.

  밤    — 55Hz 드론 + 2초에 한 번 낮은 맥박 + 드문 종. 움직임이 거의 없다.
          밤은 기다리는 시간이라 음악이 앞에 나서면 안 된다.
  낮    — 같은 음계를 나무 소리로 올려 잡은 아르페지오. 밤보다 밝고 빠르지만
          토론을 방해하지 않을 만큼만 움직인다.
  재판  — 5.5Hz 트레몰로와 4초마다 밝아지는 스웰, 그리고 1초 시계. 유일하게
          "시간이 흐른다"를 소리로 말하는 곡이다.

의존성: numpy, lameenc  (pip install numpy lameenc)
실행:   python tools/make-bgm.py
"""

import math
import os

import lameenc
import numpy as np

SR = 44100
# 피크 천장. MP3 인코딩이 0dBFS 근처를 깎으므로 여유를 둔다
CEIL = -1.0
# 배경음악은 96kbps로 충분하다. 고역에 정보가 거의 없어서(전부 로우패스를
# 거친 재료다) 그 위로 올려도 파일만 커진다
KBPS = 96

# A 단5음계. 반음이 없어서 어떻게 겹쳐도 긁히지 않는다 — 이 게임은 추리지
# 공포가 아니므로 불협을 쓰지 않는다는 make-sfx.py의 판단을 그대로 따른다
NOTES = {
	"A1": 55.00,
	"E2": 82.41,
	"A2": 110.00,
	"C3": 130.81,
	"D3": 146.83,
	"E3": 164.81,
	"G3": 196.00,
	"A3": 220.00,
	"C4": 261.63,
	"D4": 293.66,
	"E4": 329.63,
	"G4": 392.00,
}

# 부분음 비율과 세기. 정수배로 쌓으면 오르간이 되고 귀가 0.1초 만에
# "신디사이저"로 분류한다(make-sfx.py 머리말 1번). 실제 물체의 비율을 쓴다.
BELL = ((1.0, 1.00), (2.00, 0.50), (2.98, 0.32), (4.10, 0.16), (5.43, 0.08))
WOOD = ((1.0, 1.00), (2.572, 0.28), (4.644, 0.10))


# ---------------------------------------------------------------- 루프 도구


def snap(freq, n):
	"""
	루프 길이 n 샘플에 정수 번 들어가는 가장 가까운 주파수.

	이 함수가 무이음 루프의 전부다. 55Hz를 그대로 쓰면 16초에 880.0회가
	아니라 880.0000...회여서 마지막 샘플과 첫 샘플의 위상이 어긋나고,
	그 어긋남이 루프마다 딸깍으로 들린다. 격자(SR/n = 0.0625Hz)에 맞춰
	올리면 어긋남이 0이 된다 — 사람 귀는 0.0625Hz 차이를 듣지 못한다.
	"""
	k = max(1, int(round(freq * n / SR)))
	return k * SR / n


def cyc(freq, n, phase=0.0):
	"""루프에 정확히 들어가는 사인 한 겹"""
	return np.sin(2 * np.pi * snap(freq, n) * (np.arange(n) / SR) + phase)


def lfo(rate, n, depth):
	"""
	느린 물결. 1.0을 중심으로 depth만큼 아래로만 내려간다.

	위로 부풀리지 않는 이유는 라우드니스다. 위로 키우면 피크가 올라가
	정규화가 전체를 낮추고, 결국 물결이 없는 구간이 더 조용해진다.
	"""
	tt = np.arange(n) / SR
	return 1.0 - depth * (0.5 - 0.5 * np.cos(2 * np.pi * snap(rate, n) * tt))


def cnoise(n, seed):
	"""잡음 한 통. 아래 cfilt가 원형 필터라 이대로 루프에 얹어도 안전하다"""
	return np.random.default_rng(seed).standard_normal(n)


def cfilt(x, fc, kind="lp", order=2):
	"""
	FFT로 자르는 원형 필터.

	시간 영역 재귀 필터(one-pole 캐스케이드)를 쓰지 않는 이유가 둘이다.
	하나는 루프다 — 재귀 필터는 첫 샘플에서 상태가 0이라 앞머리에 필터가
	채워지는 구간이 생기고, 하필 그 구간이 이음매에 온다. 다른 하나는
	속도다. 16초는 70만 샘플이고 파이썬 루프로 여러 단을 돌리면 곡 하나에
	수십 초가 걸린다. FFT는 주기 신호를 전제하므로 두 문제가 함께 풀린다.
	"""
	spectrum = np.fft.rfft(x)
	freqs = np.fft.rfftfreq(len(x), 1.0 / SR)
	ratio = freqs / fc
	if kind == "lp":
		gain = 1.0 / np.sqrt(1.0 + ratio ** (2 * order))
	else:
		# 0Hz에서 분모가 1이라 DC가 정확히 0으로 떨어진다
		gain = ratio**order / np.sqrt(1.0 + ratio ** (2 * order))
	return np.fft.irfft(spectrum * gain, len(x))


def place(buf, x, start):
	"""
	감쇠하는 음 하나를 루프 위에 얹는다. 꼬리가 끝을 넘으면 처음으로 감는다.

	잘라 버리면 이음매에서 종소리가 뚝 끊기고, 그 자리만 소리가 달라져서
	"여기가 루프 경계"임을 정확히 알려 준다. 감아 넣으면 앞머리에 그 꼬리가
	이미 울리고 있으므로 되풀이해도 이어진다.
	"""
	n = len(buf)
	head = start % n
	if head + len(x) <= n:
		buf[head : head + len(x)] += x
		return
	cut = n - head
	buf[head:] += x[:cut]
	tail = x[cut:]
	# 한 바퀴를 넘는 꼬리는 잘라 낸다. 여기까지 오는 음은 없지만, 있으면
	# 자기 자신과 겹쳐 쌓이므로 조용히 커지는 대신 조용히 사라지게 둔다
	if len(tail) > n:
		tail = tail[:n]
	buf[: len(tail)] += tail


def release(x, ms=8.0):
	"""
	이벤트 하나의 끝을 8ms 동안 재운다.

	루프 페이드와는 다른 것이다. 여기서 깎는 것은 곡의 끝이 아니라 음 하나의
	끝이고, 감쇠가 다 끝나기 전에 배열이 끝나 생기는 절단을 없앤다 — 종소리는
	3.4초 뒤에도 5%가 남아 있어서 그대로 두면 그 자리에 딸깍이 난다.
	루프 이음매에 걸친 음은 이 재워진 꼬리째로 감기므로 여전히 이어진다.
	"""
	m = min(len(x), max(1, int(SR * ms / 1000)))
	out = x.copy()
	out[-m:] *= np.linspace(1.0, 0.0, m)
	return out


def tone(freq, dur, tau, modes, seed, bright=0.7):
	"""
	부분음을 쌓아 만드는 음 하나. 피크 1.0으로 맞춰 돌려주므로 세기는 부르는
	쪽이 곱해서 정한다.

	부분음마다 수명이 다르다(life). 높은 쪽이 먼저 죽는 것이 실제 나무·유리이고,
	이 한 줄이 없으면 소리가 끝까지 같은 색으로 남아 오르간처럼 들린다.
	"""
	m = int(dur * SR)
	tt = np.arange(m) / SR
	rng = np.random.default_rng(seed)
	out = np.zeros(m)
	for ratio, weight in modes:
		f = freq * ratio
		if f > SR * 0.45:
			continue
		life = tau / (ratio**bright)
		out += weight * np.sin(2 * np.pi * f * tt + rng.uniform(0, 2 * np.pi)) * np.exp(-tt / life)
	# 0.6ms 램프. 그 위로 깎으면 타점이 뭉갠다(make-sfx.py 머리말 3번)
	ramp = max(1, int(SR * 0.0006))
	out[:ramp] *= np.linspace(0, 1, ramp)
	peak = float(np.max(np.abs(out)))
	return release(out / peak) if peak > 1e-9 else out


def thump(freq_from, freq_to, dur, tau, seed):
	"""
	낮은 쿵 하나. 주파수가 떨어지면서 나므로 사인 하나로는 안 되고 위상을
	누적해야 한다(cumsum). 맥박·발소리·문 닫는 소리가 모두 이 모양이다.
	"""
	m = int(dur * SR)
	tt = np.arange(m) / SR
	freq = freq_to + (freq_from - freq_to) * np.exp(-tt / (tau * 0.7))
	phase = 2 * np.pi * np.cumsum(freq) / SR
	# 앞의 4ms는 올라오는 구간이다. 없으면 첫 샘플이 곧 최대값이라 딸깍이 난다
	env = np.exp(-tt / tau) * (1.0 - np.exp(-tt / 0.004))
	# 접촉음. 무엇으로 때렸는지는 몸통이 아니라 이 2ms가 알려 준다
	hit = cnoise(m, seed) * np.exp(-tt / 0.002) * 0.12
	out = np.sin(phase) * env + cfilt(hit, 1800, "lp", 2)
	peak = float(np.max(np.abs(out)))
	return release(out / peak) if peak > 1e-9 else out


# ---------------------------------------------------------------- 마무리


def finish(x, rms_db):
	"""
	RMS를 목표에 맞추고 피크를 천장 아래로 누른다.

	양 끝은 건드리지 않는다 — 여기서 페이드를 걸면 위의 모든 노력이
	무의미해진다. make-sfx.py의 edges()에 대응하는 자리가 비어 있는 것이
	이 파일의 요점이다.
	"""
	ceiling = 10 ** (CEIL / 20)
	target = 10 ** (rms_db / 20)
	for _ in range(8):
		rms = float(np.sqrt(np.mean(x**2)))
		if rms < 1e-9:
			break
		x = x * (target / rms)
		if np.max(np.abs(x)) <= ceiling:
			break
		x = np.tanh(x / ceiling * 0.92) * ceiling
	peak = float(np.max(np.abs(x)))
	if peak > ceiling:
		x = x * (ceiling / peak)
	return x


def write_mp3(path, x, kbps=KBPS):
	pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").tobytes()
	enc = lameenc.Encoder()
	enc.set_bit_rate(kbps)
	enc.set_in_sample_rate(SR)
	enc.set_channels(1)
	enc.set_quality(2)
	with open(path, "wb") as fp:
		fp.write(enc.encode(pcm) + enc.flush())


# ---------------------------------------------------------------- 곡 세 개


def bgm_night(seconds=16.0):
	"""
	밤 — 거의 움직이지 않는다.

	밤은 마피아 넷이 서로를 확인하고 나머지는 기다리는 시간이다. 여기서
	음악이 앞에 나서면 지목 화면을 읽는 것을 방해하고, 무엇보다 25초짜리
	단계를 열 번 넘게 되풀이하므로 조금만 화려해도 금방 지친다.

	그래서 재료가 셋뿐이다: 낮은 드론, 2초에 한 번의 맥박, 그리고 네 번의
	종. 맥박이 있는 이유는 밤이 조용하기만 하면 "음악이 없는 것"과 구분되지
	않기 때문이다 — 아침에 낮 음악으로 바뀌었을 때 무엇이 바뀌었는지 알려면
	밤에도 무언가 세고 있어야 한다.
	"""
	n = int(seconds * SR)

	# 뿌리음(A1)과 5도(E2). 1.005로 어긋난 짝을 하나 더 얹어 느린 물결을
	# 만든다. 어긋남도 격자에 얹히므로 물결의 주기가 루프에 딱 들어간다
	drone = (
		0.90 * cyc(NOTES["A1"], n, 0.0)
		+ 0.50 * cyc(NOTES["A1"] * 1.005, n, 1.1)
		+ 0.42 * cyc(NOTES["E2"], n, 2.3)
		+ 0.16 * cyc(NOTES["A2"], n, 0.7)
	)
	drone *= lfo(0.125, n, 0.30)
	drone = cfilt(drone, 320, "lp", 2)

	# 공기. 이것이 없으면 드론이 사인 스택으로 들린다 — 방이 있어야 악기가 된다
	air = cfilt(cnoise(n, 11), 700, "lp", 2)
	air = cfilt(air, 90, "hp", 1)
	air *= lfo(0.1875, n, 0.45)

	# 맥박 여덟 번(2초 간격). 루프 길이를 정확히 8로 나눈 자리에 둔다
	pulse = np.zeros(n)
	for i in range(8):
		pulse_at = int(i * n / 8)
		place(pulse, thump(96.0, 41.0, 0.55, 0.13, 200 + i) * (1.0 if i % 4 == 0 else 0.72), pulse_at)

	# 종 넷. 자리가 고르지 않은 것이 중요하다 — 규칙적으로 울리면 맥박과
	# 한 덩어리로 들려서 "드문 소리"라는 성격을 잃는다
	bells = np.zeros(n)
	for i, (at, name) in enumerate(((1.0, "A3"), (5.5, "E4"), (9.0, "C4"), (13.5, "D3"))):
		place(bells, tone(NOTES[name], 3.4, 1.15, BELL, 300 + i) * (0.55 - 0.06 * i), int(at * SR))

	return finish(drone * 0.85 + air * 0.26 + pulse * 0.30 + bells * 0.20, -25.0)


def bgm_day(seconds=16.0):
	"""
	낮 — 같은 음계를 나무 소리로 올려 잡는다.

	낮은 사람들이 말하는 시간이라 음악이 말을 덮으면 안 된다. 그런데 밤과
	구분은 확실해야 한다. 답은 음역과 재료다: 뿌리음을 한 옥타브 올리고
	(A1 → A2) 유리·종 대신 나무를 쓴다. 낮은 쪽이 비면 대화가 지나갈 자리가
	생기고, 나무는 감쇠가 빨라서 여러 음이 겹쳐도 뭉치지 않는다.

	아르페지오는 네 마디짜리 표를 두 번 돌린다. 무작위로 뽑지 않는 이유는
	되풀이 때문이다 — 판마다 다른 음이 나올 필요가 없고, 표로 두면 같은
	흐름이 익숙해져서 배경으로 물러난다.
	"""
	n = int(seconds * SR)

	pad = (
		0.70 * cyc(NOTES["A2"], n, 0.0)
		+ 0.46 * cyc(NOTES["E3"], n, 1.7)
		+ 0.30 * cyc(NOTES["A3"], n, 0.4)
		+ 0.18 * cyc(NOTES["C4"], n, 2.9)
	)
	pad *= lfo(0.1875, n, 0.22)
	pad = cfilt(pad, 900, "lp", 2)

	# 아침의 공기는 밤보다 밝다. 같은 잡음을 더 높은 곳에서 자른다
	air = cfilt(cnoise(n, 27), 3000, "lp", 2)
	air = cfilt(air, 400, "hp", 1)
	air *= lfo(0.25, n, 0.40)

	# 마디 하나가 2초, 여덟 마디. 마디마다 세 음이고 자리가 조금씩 다르다
	bars = (
		((0.00, "A3", 1.00), (0.50, "C4", 0.70), (1.25, "E4", 0.58)),
		((0.00, "D4", 0.86), (0.75, "C4", 0.62), (1.50, "A3", 0.52)),
		((0.00, "E4", 0.92), (0.50, "G3", 0.66), (1.25, "C4", 0.56)),
		((0.00, "A3", 0.88), (0.75, "E4", 0.64), (1.50, "D4", 0.50)),
	)
	arp = np.zeros(n)
	for bar in range(8):
		for i, (offset, name, level) in enumerate(bars[bar % 4]):
			at = int((bar * 2.0 + offset) * SR)
			place(arp, tone(NOTES[name], 1.3, 0.42, WOOD, 400 + bar * 4 + i) * level, at)

	return finish(pad * 0.70 + air * 0.22 + arp * 0.42, -25.0)


def bgm_trial(seconds=12.0):
	"""
	재판 — 유일하게 "시간이 흐른다"를 소리로 말하는 곡.

	최후의 반론과 찬반은 합쳐 20초다. 그 20초 동안 방 전체가 한 사람을
	보고 있고, 남은 시간이 얼마인지가 곧 긴장이다. 그래서 여기만 1초 시계를
	넣었다. 5.5Hz 트레몰로는 그 위에 얹는 떨림이고, 4초마다 밝아지는 스웰이
	"뭔가 다가온다"를 만든다.

	시계를 1초 간격으로 둔 이유는 효과음이다. 남은 5초에 TICK_TOCK이 울리는데
	(GameFlow.advanceGame) 배경의 시계가 0.5초 간격이면 둘이 엉켜서 어느 쪽이
	카운트다운인지 모른다. 1초는 초침이라 귀가 따로 듣는다.
	"""
	n = int(seconds * SR)

	drone = 0.90 * cyc(NOTES["A1"], n, 0.0) + 0.45 * cyc(NOTES["E2"], n, 2.1) + 0.22 * cyc(NOTES["A2"], n, 0.9)
	# 5.5Hz — 12초에 66번이라 격자에 정확히 얹힌다. 이보다 느리면 물결이고
	# 빠르면 소리가 거칠어진다. 5~6Hz가 "떨고 있다"로 들리는 구간이다
	drone *= lfo(5.5, n, 0.42)
	drone = cfilt(drone, 400, "lp", 2)

	# 스웰. 같은 잡음을 두 대역으로 갈라 봉투로 오르내리며 섞는다 —
	# 시간에 따라 변하는 필터를 쓰지 않고 밝아지는 소리를 만드는 방법이다.
	# 잡음이 같아야 두 대역이 한 소리로 붙는다(다른 씨앗을 쓰면 두 겹으로 들린다)
	raw = cnoise(n, 41)
	low = cfilt(raw, 600, "lp", 2)
	high = cfilt(cfilt(raw, 3200, "lp", 2), 700, "hp", 1)
	rise = 1.0 - lfo(0.25, n, 1.0)
	swell = low * (1.0 - rise) * 0.55 + high * rise

	# 초침 열둘. 넷째마다 조금 세게 — 마디가 있으면 세고 있다는 느낌이 난다
	ticks = np.zeros(n)
	for i in range(12):
		ticks_at = int(i * n / 12)
		place(ticks, tone(880.0, 0.22, 0.030, WOOD, 500 + i) * (1.0 if i % 4 == 0 else 0.58), ticks_at)

	# 2초에 한 번의 낮은 쿵. 밤의 맥박보다 짧고 무겁다
	beats = np.zeros(n)
	for i in range(6):
		place(beats, thump(84.0, 38.0, 0.42, 0.10, 600 + i) * (1.0 if i % 3 == 0 else 0.66), int(i * n / 6))

	return finish(drone * 0.80 + swell * 0.30 + ticks * 0.30 + beats * 0.26, -23.0)


# ---------------------------------------------------------------- 실행


TRACKS = (
	("bgm_night.mp3", bgm_night),
	("bgm_day.mp3", bgm_day),
	("bgm_trial.mp3", bgm_trial),
)


def main():
	res = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "res")
	for name, make in TRACKS:
		track = make()
		path = os.path.join(res, name)
		write_mp3(path, track)
		rms = 20 * math.log10(max(1e-12, float(np.sqrt(np.mean(track**2)))))
		peak = 20 * math.log10(max(1e-12, float(np.max(np.abs(track)))))
		# 이음매 검산. 마지막 샘플과 첫 샘플의 차이를 0과 비교하면 안 된다 —
		# 파형은 샘플마다 움직이므로 완벽한 루프에서도 그 차이는 0이 아니다.
		#
		# 볼 것은 "그 한 걸음이 파형이 원래 밟는 걸음보다 큰가"다. 경계 앞뒤
		# 256샘플에서 가장 큰 걸음으로 나눠 1보다 작으면 이음매가 그 구간의
		# 어느 샘플 경계와도 구분되지 않는다 — 딸깍은 파형이 못 낼 만큼 큰
		# 걸음일 때만 들린다. 평균으로 나누면 안 되는데, 걸음 크기가 위상에
		# 따라 몇 배씩 오가서 이상 없는 루프도 2를 넘게 나온다(낮 곡이 그랬다)
		edge = np.abs(np.diff(np.concatenate((track[-256:], track[:256]))))
		seam = abs(float(track[-1] - track[0])) / max(1e-12, float(np.max(edge)))
		size = os.path.getsize(path) / 1024
		print(
			f"{name:16s} {len(track) / SR:5.1f}s  RMS {rms:6.1f}dBFS  "
			f"peak {peak:6.1f}dBFS  이음매 {seam:4.2f}  {size:6.1f}KB"
		)


if __name__ == "__main__":
	main()
