// ==================================================
// 1. 変数定義 & 設定
// ==================================================
// ユーザー提供のロジック用変数
let motionBuffer = [];
const DURATION = 1000; // 1000ms = 1秒間のデータを保持
let targetActivity = 0.0; // 計算された最新の揺れ具合 (標準偏差)
let motionListenerAttached = false;

// 音楽・アニメーション用変数
let currentActivity = 0.0; // targetActivityに滑らかに追従する値 (0.0 ~ 1.0に正規化後)
let isPlaying = false;
let chordIndex = 0;


// ==================================================
// 2. 音源設定 (Tone.js)
// ==================================================
// キラキラしたFMシンセ
const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 10,
    detune: 0,
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.5 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
}).toDestination();

// エフェクト（宇宙っぽい広がり）
const reverb = new Tone.Reverb({ decay: 4, wet: 0.6 }).toDestination();
const delay = new Tone.FeedbackDelay("8n", 0.3).toDestination();
synth.connect(reverb);
synth.connect(delay);


// ==================================================
// 3. 音楽理論データ (カノン進行 C Major)
// ==================================================
const canonChords = [
    ["C4", "E4", "G4"], // C
    ["G3", "B3", "D4"], // G
    ["A3", "C4", "E4"], // Am
    ["E3", "G3", "B3"], // Em
    ["F3", "A3", "C4"], // F
    ["C4", "E4", "G4"], // C
    ["F3", "A3", "C4"], // F
    ["G3", "B3", "D4"]  // G
];


// ==================================================
// 4. イベントリスナー & 開始処理
// ==================================================
const startBtn = document.getElementById('start-btn');

startBtn.addEventListener('click', async () => {
    if (isPlaying) return;

    // A. AudioContextの開始 (必須)
    await Tone.start();
    
    // B. センサー許可フロー (ユーザー提供コードを統合)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        // iOS 13+ の場合
        try {
            const permissionState = await DeviceMotionEvent.requestPermission();
            if (permissionState === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
                motionListenerAttached = true;
            } else {
                alert("センサー許可が必要です");
                return;
            }
        } catch (e) {
            console.error(e);
            alert("エラーが発生しました: " + e);
            return;
        }
    } else {
        // Android / PC / 旧iOS の場合
        window.addEventListener('devicemotion', handleMotion);
        motionListenerAttached = true;
    }

    // C. 音楽ループ開始
    startMusicLoop();
    
    // UI更新
    startBtn.innerText = "RUNNING...";
    startBtn.style.background = "#ff0099"; // 色を変えてみる
    isPlaying = true;
    
    // アニメーションループ開始
    requestAnimationFrame(updateLoop);
});


// ==================================================
// 5. センサー処理 (ユーザー提供ロジック)
// ==================================================
function handleMotion(event) {
    const a = event.accelerationIncludingGravity;
    if (!a) return;

    // 重力込みの加速度ベクトル長
    const mag = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
    const now = Date.now();

    motionBuffer.push({ t: now, m: mag });

    // 古いデータ削除 (DURATIONより前のもの)
    while (motionBuffer.length > 0 && motionBuffer[0].t < now - DURATION) {
        motionBuffer.shift();
    }

    // データ不足時は計算しない
    if (motionBuffer.length < 10) {
        targetActivity = 0.0;
        return;
    }

    // 標準偏差の計算
    const magnitudes = motionBuffer.map(d => d.m);
    const mean = magnitudes.reduce((s, v) => s + v, 0) / magnitudes.length;
    const variance = magnitudes.reduce((s, v) => s + (v - mean) ** 2, 0) / magnitudes.length;
    const activityLevel = Math.sqrt(variance);

    targetActivity = activityLevel;
}


// ==================================================
// 6. メインループ (値の平滑化とUI更新)
// ==================================================
function updateLoop() {
    // 生の標準偏差(targetActivity)はノイズでガタガタするので、
    // currentActivity を少しずつ近づける (線形補間)
    
    // 標準偏差の目安: 
    // 0.1以下: 静止
    // 1.0前後: 歩行
    // 3.0以上: 走行/激しい動き
    // ここでは 3.0 をMAX(1.0)として正規化します
    
    let normalizedTarget = Math.min(targetActivity / 3.0, 1.0);
    
    // ノイズ除去（極小の値は0にする）
    if (normalizedTarget < 0.05) normalizedTarget = 0;

    // 滑らかに数値を追従させる (0.05の係数でゆっくり近づく)
    currentActivity += (normalizedTarget - currentActivity) * 0.05;

    // UIの更新
    const percent = Math.min(Math.round(currentActivity * 100), 100);
    
    // 数値表示
    const valElem = document.getElementById('activity-val');
    if(valElem) valElem.innerText = targetActivity.toFixed(2); // 生の標準偏差を表示

    // バー表示
    const barElem = document.getElementById('activity-bar');
    if(barElem) barElem.style.width = percent + "%";

    requestAnimationFrame(updateLoop);
}


// ==================================================
// 7. 音楽生成ロジック
// ==================================================
function startMusicLoop() {
    Tone.Transport.bpm.value = 120;

    // 16分音符ごとに実行
    Tone.Transport.scheduleRepeat((time) => {
        
        // currentActivity (0.0~1.0) に基づいて確率決定
        // 静止時: 5% / MAX時: 95%
        const probability = 0.05 + (currentActivity * 0.9);

        if (Math.random() < probability) {
            const chord = canonChords[chordIndex];
            let note = chord[Math.floor(Math.random() * chord.length)];

            // 激しい動き(0.6以上)なら、確率でオクターブ上げる
            if (currentActivity > 0.6 && Math.random() > 0.4) {
               const noteName = note.slice(0, -1);
               const octave = parseInt(note.slice(-1)) + 1;
               note = noteName + octave;
            }

            // 音の長さ: 動きが激しいほど短く（スタッカート気味に）
            const length = currentActivity > 0.5 ? "16n" : "8n";
            
            // ベロシティ（音の強さ）も連動
            const vel = 0.5 + (currentActivity * 0.5);

            synth.triggerAttackRelease(note, length, time, vel);
        }

    }, "16n");

    // コード進行ループ (1小節ごと)
    Tone.Transport.scheduleRepeat((time) => {
        chordIndex = (chordIndex + 1) % canonChords.length;
    }, "1m");

    Tone.Transport.start();
}