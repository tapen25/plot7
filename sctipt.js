// ■ グローバル変数
let accelerationBuffer = [];
const BUFFER_SIZE = 30; // 感度調整（値を小さくすると反応が早くなる）
let currentActivity = 0;
let isPlaying = false;

// ■ シンセサイザー設定
// キラキラした音（FMシンセ）
const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 10,
    detune: 0,
    oscillator: { type: "sine" },
    envelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.5 },
    modulation: { type: "square" },
    modulationEnvelope: { attack: 0.5, decay: 0, sustain: 1, release: 0.5 }
}).toDestination();

// エコー効果（宇宙感）
const reverb = new Tone.Reverb({ decay: 3, wet: 0.5 }).toDestination();
const delay = new Tone.FeedbackDelay("8n", 0.3).toDestination();
synth.connect(reverb);
synth.connect(delay);


// ■ カノン進行 (C Major)
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
let chordIndex = 0;


// ■ 開始ボタンの処理
document.getElementById('start-btn').addEventListener('click', async () => {
    if (isPlaying) return;
    
    // 1. オーディオ起動
    await Tone.start();
    console.log("Audio Context Started");

    // 2. センサー許可リクエスト (iOS用)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceMotionEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('devicemotion', handleMotion);
            } else {
                alert("センサー許可が必要です");
                return;
            }
        } catch (e) {
            console.error(e);
        }
    } else {
        // Android / PC
        window.addEventListener('devicemotion', handleMotion);
    }

    // 3. メロディ生成ループ開始
    startMusicLoop();
    
    // UI変更
    document.getElementById('start-btn').innerText = "RUNNING...";
    isPlaying = true;
});


// ■ センサー処理
function handleMotion(event) {
    const acc = event.accelerationIncludingGravity;
    if (!acc) return;

    // ベクトルの大きさを計算
    const magnitude = Math.sqrt(acc.x**2 + acc.y**2 + acc.z**2);
    
    accelerationBuffer.push(magnitude);
    if (accelerationBuffer.length > BUFFER_SIZE) {
        accelerationBuffer.shift();
    }

    // 標準偏差を計算
    const stdDev = calculateStdDev(accelerationBuffer);
    
    // activityを更新 (0.0 〜 1.0 に正規化)
    // ※ 0.1 はノイズ対策、3.0 は激しい動きの目安
    currentActivity = Math.min(Math.max(0, stdDev - 0.1) / 3.0, 1.0);

    // 画面更新
    updateUI();
}

function calculateStdDev(arr) {
    if(arr.length === 0) return 0;
    const mean = arr.reduce((a, b) => a + b) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
}

function updateUI() {
    const percent = Math.round(currentActivity * 100);
    document.getElementById('activity-val').innerText = currentActivity.toFixed(2);
    document.getElementById('activity-bar').style.width = percent + "%";
    
    // 激しいときはバーの色を変える等の演出も可能
}


// ■ 音楽生成ループ
function startMusicLoop() {
    Tone.Transport.bpm.value = 120;

    // 16分音符ごとに実行されるループ
    Tone.Transport.scheduleRepeat((time) => {
        
        // activityに応じて「音を鳴らす確率」を決める
        // 静止時: 10% / 全力時: 90%
        const probability = 0.1 + (currentActivity * 0.8);

        if (Math.random() < probability) {
            const chord = canonChords[chordIndex];
            let note = chord[Math.floor(Math.random() * chord.length)];

            // activityが高いとオクターブ上げる
            if (currentActivity > 0.6 && Math.random() > 0.5) {
               // 簡易的に文字列操作でオクターブ上げ ("C4" -> "C5")
               // ※正確にはTone.Frequencyを使うが、ここでは簡易版
               const noteName = note.slice(0, -1);
               const octave = parseInt(note.slice(-1)) + 1;
               note = noteName + octave;
            }

            const length = currentActivity > 0.5 ? "16n" : "8n";
            synth.triggerAttackRelease(note, length, time);
        }

    }, "16n");

    // コード進行を進めるループ (2秒に1回)
    Tone.Transport.scheduleRepeat((time) => {
        chordIndex = (chordIndex + 1) % canonChords.length;
    }, "1m"); // 1小節ごと

    Tone.Transport.start();
}