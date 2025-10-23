// DOM取得
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const cadenceDiv = document.getElementById('cadence');

// 定数（チューニング可能）
const PEAK_THRESHOLD = 1.8;      // 「1歩」として検知する閾値 (1.5から上げてノイズを減らす)
const STEP_INTERVAL_MS = 375;    // チャタリング防止 (500から短くする。これで160bpmまで検出可能)
const HISTORY_SECONDS = 3;       // ケイデンス算出に使う過去時間 (いったん維持)

// ★ケイデンス閾値 (音変化用)
const STATE1_THRESHOLD = 20;  // これ未満: "曲①"
const STATE2_THRESHOLD = 45;  // これ未満: "遷移処理" (20以上)
const STATE3_THRESHOLD = 80;  // これ未満: "歩行" (45以上)
const STATE4_THRESHOLD = 115; // これ未満: "遷移処理" (80以上)
const STATE5_THRESHOLD = 140; // これ「以下」: "早歩き" (115以上)

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
  if (cadence < STATE1_THRESHOLD) {        // 20未満
    newState = '曲①';
  } else if (cadence < STATE2_THRESHOLD) { // 20～44
    newState = '遷移処理';
  } else if (cadence < STATE3_THRESHOLD) { // 45～79
    newState = '歩行';
  } else if (cadence < STATE4_THRESHOLD) { // 80～114
    newState = '遷移処理';
  } else if (cadence <= STATE5_THRESHOLD) { // 115～140
    newState = '早歩き';
  } else {                                 // 140より上
    newState = 'ランニング'; // (140を超える場合の仮State)
  }                                // ← 130以上

  if (newState !== currentState) {
    console.log(`State: ${currentState} → ${newState}`);
    currentState = newState;
    statusDiv.textContent = newState;
    statusDiv.style.color =
      newState === '曲①' ? 'gray' :
      newState === '遷移処理' ? 'purple' : // 遷移処理用の色
      newState === '歩行' ? 'green' :
      newState === '早歩き' ? 'orange' :
      newState === 'ランニング' ? 'red' :
      'black'; // デフォルト
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
