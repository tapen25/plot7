// DOM取得
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const cadenceDiv = document.getElementById('cadence');

// 定数（チューニング可能）
const PEAK_THRESHOLD = 1.2;      // 「1歩」として検知する閾値
const STEP_INTERVAL_MS = 300;    // チャタリング防止　1回の歩行で複数回カウントすることを防ぐ
const HISTORY_SECONDS = 5;       // ケイデンス算出に使う過去時間　直近何秒間の歩数データを使うか
const STILL_THRESHOLD = 30;      // 静止とみなす閾値
const WALK_THRESHOLD = 130;      // 歩行/速歩の閾値

// 状態変数
let lastPeakTime = 0;
let stepHistory = [];
let currentState = '静止';

// Chart.js 初期設定
let accData = [];
let timeLabels = [];
const MAX_POINTS = 100;

const ctx = document.getElementById('accChart').getContext('2d');
const accChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: timeLabels,
    datasets: [
      {
        label: '加速度の大きさ (m/s²)',
        data: accData,
        borderColor: '#007bff',
        fill: false,
        tension: 0.2,
      },
      {
        label: '閾値 (PEAK_THRESHOLD)',
        data: [],
        borderColor: 'red',
        borderDash: [5, 5],
        fill: false,
      },
    ],
  },
  options: {
    scales: {
      x: { display: false },
      y: { suggestedMin: 0, suggestedMax: 3 },
    },
    animation: false,
  },
});

startButton.addEventListener('click', init);

async function init() {
  startButton.disabled = true;
  startButton.textContent = '準備中...';

  // iOSなどではセンサーアクセス許可をリクエスト
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') {
        alert('モーションセンサーの利用が許可されませんでした。');
        startButton.textContent = '許可されませんでした';
        return;
      }
    } catch (e) {
      alert('センサーアクセス中にエラーが発生しました');
      console.error(e);
      return;
    }
  }

  window.addEventListener('devicemotion', handleMotion);
  startButton.textContent = '計測中…';
  statusDiv.textContent = '静止中';
}

function handleMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc || acc.x === null) return;

  const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  const now = Date.now();

  // ピーク検出
  if (magnitude > PEAK_THRESHOLD && now - lastPeakTime > STEP_INTERVAL_MS) {
    lastPeakTime = now;
    stepHistory.push(now);
  }

  // 古い履歴削除
  while (stepHistory.length > 0 && now - stepHistory[0] > HISTORY_SECONDS * 1000) {
    stepHistory.shift();
  }

  // ケイデンス計算
  const cadence = stepHistory.length * (60000 / (HISTORY_SECONDS * 1000));
  cadenceDiv.textContent = Math.round(cadence);

  // 状態判定
  let newState;
  if (cadence < STILL_THRESHOLD) newState = '静止';
  else if (cadence < WALK_THRESHOLD) newState = '歩行';
  else newState = '速歩';

  if (newState !== currentState) {
    console.log(`State: ${currentState} → ${newState}`);
    currentState = newState;
    statusDiv.textContent = newState;
    statusDiv.style.color =
      newState === '静止' ? 'gray' : newState === '歩行' ? 'green' : 'red';
  }

  // グラフ更新
  const timestamp = new Date().toLocaleTimeString().split(' ')[0];
  accData.push(magnitude);
  timeLabels.push(timestamp);
  accChart.data.datasets[1].data.push(PEAK_THRESHOLD);

  if (accData.length > MAX_POINTS) {
    accData.shift();
    timeLabels.shift();
    accChart.data.datasets[1].data.shift();
  }

  accChart.update();
}
