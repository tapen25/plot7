// DOM取得
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const cadenceDiv = document.getElementById('cadence');

// 定数（チューニング可能）
const PEAK_THRESHOLD = 1.8;      // 「1歩」として検知する閾値 (1.5から上げてノイズを減らす)
const STEP_INTERVAL_MS = 375;    // チャタリング防止 (500から短くする。これで160bpmまで検出可能)
// ...existing code...
const HISTORY_SECONDS = 3;       // ケイデンス算出に使う過去時間 (いったん維持)

// 新: 安定化用定数
const STATE_STABILITY_MS = 800;      // 新状態がこの時間継続して初めて切替え
const CADENCE_SMOOTH_ALPHA = 0.3;    // EMA 平滑化係数
const MIN_INTERVALS_FOR_ESTIMATE = 2; // BPM推定のために必要な最小ステップ数

// ★ケイデンス閾値 (音変化用)
const STATE1_THRESHOLD = 20;
const STATE2_THRESHOLD = 45;
const STATE3_THRESHOLD = 80;
const STATE4_THRESHOLD = 115;
const STATE5_THRESHOLD = 140;

// 状態変数（追加）
let pendingState = null;
let pendingSince = 0;
let smoothedCadence = 0;
// ...existing code...

function handleMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc || acc.x === null) return;

  const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  const now = Date.now();

  // ピーク検出（既存ロジックを維持）
  if (magnitude > PEAK_THRESHOLD && now - lastPeakTime > STEP_INTERVAL_MS) {
    lastPeakTime = now;
    stepHistory.push(now);
  }

  // 古い履歴削除
  while (stepHistory.length > 0 && now - stepHistory[0] > HISTORY_SECONDS * 1000) {
    stepHistory.shift();
  }

  // --- 新: インターバルベースでケイデンス算出 ---
  function computeCadenceFromIntervals(history) {
    if (history.length < 2) return 0;
    const intervals = [];
    for (let i = 1; i < history.length; i++) intervals.push(history[i] - history[i - 1]);
    // 最近の最大5間隔の平均を使う（中央値に変更しても良い）
    const lastN = Math.min(5, intervals.length);
    const recent = intervals.slice(-lastN);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    return 60000 / avg; // bpm
  }

  const rawCadence = computeCadenceFromIntervals(stepHistory);
  // 平滑化（EMA）で揺れを抑える
  if (rawCadence === 0 && smoothedCadence > 0) {
    // 徐々に減衰させる（歩を止めたときの急激な落ち込みを和らげる）
    smoothedCadence = smoothedCadence * 0.85;
    if (smoothedCadence < 1) smoothedCadence = 0;
  } else if (rawCadence > 0) {
    smoothedCadence = smoothedCadence === 0 ? rawCadence : (CADENCE_SMOOTH_ALPHA * rawCadence + (1 - CADENCE_SMOOTH_ALPHA) * smoothedCadence);
  }

  const cadence = Math.round(smoothedCadence);
  cadenceDiv.textContent = cadence;

  // 状態判定（閾値は既存を使用）── 新: ヒステリシスで安定化
  let candidateState;
  if (cadence < STATE1_THRESHOLD) {
    candidateState = '曲①';
  } else if (cadence < STATE2_THRESHOLD) {
    candidateState = '遷移処理';
  } else if (cadence < STATE3_THRESHOLD) {
    candidateState = '歩行';
  } else if (cadence < STATE4_THRESHOLD) {
    candidateState = '遷移処理';
  } else if (cadence <= STATE5_THRESHOLD) {
    candidateState = '早歩き';
  } else {
    candidateState = 'ランニング';
  }

  // ヒステリシス: 新しい候補が一定時間続いたら状態を採用
  if (candidateState !== currentState) {
    if (pendingState !== candidateState) {
      pendingState = candidateState;
      pendingSince = now;
    } else if (now - pendingSince >= STATE_STABILITY_MS) {
      // 最小インターバル数の条件（短時間の誤検出を抑制）
      if (stepHistory.length >= MIN_INTERVALS_FOR_ESTIMATE || candidateState === '曲①') {
        console.log(`State: ${currentState} → ${candidateState}`);
        currentState = candidateState;
        statusDiv.textContent = currentState;
        statusDiv.style.color =
          currentState === '曲①' ? 'gray' :
          currentState === '遷移処理' ? 'purple' :
          currentState === '歩行' ? 'green' :
          currentState === '早歩き' ? 'orange' :
          currentState === 'ランニング' ? 'red' :
          'black';
      }
      pendingState = null;
    }
  } else {
    pendingState = null;
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
// ...existing code...