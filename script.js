/**
 * オートタイルジェネレーターのロジック
 */

// DOM要素
const inputs = {
    outerCorner: document.getElementById('input-outer-corner'),
    innerCorner: document.getElementById('input-inner-corner'),
    edgeLeft: document.getElementById('input-edge-left'),
    edgeTop: document.getElementById('input-edge-top'),
    fill: document.getElementById('input-fill')
};

const settings = {
    modeRadios: document.getElementsByName('tile-mode'),
    tileSize: document.getElementById('tile-size')
};

const btnGenerate = document.getElementById('btn-generate');
const btnDownload = document.getElementById('btn-download');
const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');
const placeholderText = document.getElementById('placeholder-text');

// 状態
let loadedImages = {
    outerCorner: null, // 左上
    innerCorner: null, // 左上
    edgeLeft: null,    // 左
    edgeTop: null,     // 上
    fill: null         // 中央
};

// イベントリスナー
Object.keys(inputs).forEach(key => {
    inputs[key].addEventListener('change', (e) => handleImageUpload(key, e.target.files[0]));
});

btnGenerate.addEventListener('click', generateTiles);
btnDownload.addEventListener('click', downloadTiles);

// 関数
async function handleImageUpload(key, file) {
    if (!file) return;
    try {
        const bmp = await createImageBitmap(file);
        loadedImages[key] = bmp;
        // オプション: 入力欄の近くにチェックマークやプレビューを表示する
        inputs[key].parentElement.style.borderLeft = "3px solid #3b82f6";
    } catch (e) {
        console.error("画像の読み込みに失敗しました", e);
        alert("画像の読み込みに失敗しました");
    }
}

function getSettings() {
    let mode = '16';
    for (const radio of settings.modeRadios) {
        if (radio.checked) {
            mode = radio.value;
            break;
        }
    }
    return {
        mode: mode,
        tileSize: parseInt(settings.tileSize.value, 10) || 64
    };
}

// ユーティリティ: 画像をリサイズして新しいキャンバスまたはコンテキストに描画する
function drawResized(source, targetCtx, x, y, size, rotation = 0, flipX = false, flipY = false) {
    if (!source) return;

    targetCtx.save();
    targetCtx.translate(x + size / 2, y + size / 2);
    targetCtx.rotate(rotation * Math.PI / 180);
    targetCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    targetCtx.drawImage(source, -size / 2, -size / 2, size, size);
    targetCtx.restore();
}

async function prepareAssets(tileSize) {
    // 13個の基本アセットをタイルサイズに合わせてスケーリングする必要があります
    // 外側: 左上、右上、右下、左下
    // 内側: 左上、右上、右下、左下
    // 端: 左、右、上、下
    // フィル

    // アセット用のオフスクリーンキャンバスを作成
    const assetMap = {};

    // 単一のアセットバリアントを生成するヘルパー
    const createAsset = (sourceKey, rot, flipX, flipY) => {
        const c = document.createElement('canvas');
        c.width = tileSize;
        c.height = tileSize;
        const cx = c.getContext('2d');
        const img = loadedImages[sourceKey];
        if (img) {
            drawResized(img, cx, 0, 0, tileSize, rot, flipX, flipY);
        }
        return c;
    }

    // 外側の角 (入力は左上)
    assetMap['outer_tl'] = createAsset('outerCorner', 0, false, false);
    assetMap['outer_tr'] = createAsset('outerCorner', 90, false, false);
    assetMap['outer_br'] = createAsset('outerCorner', 180, false, false);
    assetMap['outer_bl'] = createAsset('outerCorner', 270, false, false);

    // 内側の角 (入力は左上)
    assetMap['inner_tl'] = createAsset('innerCorner', 0, false, false);
    assetMap['inner_tr'] = createAsset('innerCorner', 90, false, false);
    assetMap['inner_br'] = createAsset('innerCorner', 180, false, false);
    assetMap['inner_bl'] = createAsset('innerCorner', 270, false, false);

    // 端
    assetMap['edge_l'] = createAsset('edgeLeft', 0, false, false); // 入力は左
    assetMap['edge_r'] = createAsset('edgeLeft', 0, true, false);  // 右用にX反転
    assetMap['edge_t'] = createAsset('edgeTop', 0, false, false);  // 入力は上
    assetMap['edge_b'] = createAsset('edgeTop', 0, false, true);   // 下用にY反転

    // フィル
    assetMap['fill'] = createAsset('fill', 0, false, false);

    return assetMap;
}

function generateTiles() {
    const { mode, tileSize } = getSettings();

    // バリデーション
    const missing = Object.keys(loadedImages).filter(k => !loadedImages[k]);
    if (missing.length > 0) {
        alert(`画像が見つかりません: ${missing.join(', ')}`);
        return;
    }

    placeholderText.style.display = 'none';

    prepareAssets(tileSize).then(assets => {

        let tileList = [];

        if (mode === '16') {
            // 標準的な16ビットマスクを生成 (0-15)
            // 標準的な16タイルのマッピング:
            // 直交する近傍の全16通りの組み合わせを生成します。
            // 0000 から 1111。
            for (let i = 0; i < 16; i++) {
                // デコード
                // 通常 N=1, E=2, S=4, W=8 ですが、ここでは明示的に記述します。
                // 4x4 グリッド。
                // 行 0: 0000(0), 1000(N), 0100(E), 1100(NE)...
                // i=0..15 を生成して配置します。
                // ここでの 'i' はビットマスクとして扱われます。
                // ビットマスクの規約: N=1, W=2, E=4, S=8 (一貫性があれば任意でOK)
                const n = (i & 1) ? 1 : 0;
                const w = (i & 2) ? 1 : 0;
                const e = (i & 4) ? 1 : 0;
                const s = (i & 8) ? 1 : 0;

                // 16タイルの基本セットでは、対角線は接続されている（1）と仮定します。
                // 16タイルは「途切れた」対角線をサポートしないためです。
                // したがって、nw=1, ne=1... を渡します。

                tileList.push({
                    n, w, e, s,
                    nw: 1, ne: 1, sw: 1, se: 1
                });
            }

            canvas.width = tileSize * 4;
            canvas.height = tileSize * 4;

        } else {
            // 47タイルモード
            // 全256マスクを生成し、無効なものをフィルタリングします。
            // 無効ルール: N=0 または W=0 の場合、NW は 0 でなければなりません（厳密なBlob）。
            // ループ 0..255。
            // ビット順序: N=1, W=2, E=4, S=8, NW=16, NE=32, SW=64, SE=128

            const valid = [];
            for (let i = 0; i < 256; i++) {
                const n = (i & 1) ? 1 : 0;
                const w = (i & 2) ? 1 : 0;
                const e = (i & 4) ? 1 : 0;
                const s = (i & 8) ? 1 : 0;
                const nw = (i & 16) ? 1 : 0;
                const ne = (i & 32) ? 1 : 0;
                const sw = (i & 64) ? 1 : 0;
                const se = (i & 128) ? 1 : 0;

                // ルールチェック
                if (nw && (!n || !w)) continue;
                if (ne && (!n || !e)) continue;
                if (sw && (!s || !w)) continue;
                if (se && (!s || !e)) continue;

                valid.push({ n, w, e, s, nw, ne, sw, se });
            }

            // 正確に47個になるはずです
            console.log(`47モード用に ${valid.length} 個のタイルを生成しました`);

            // レイアウト: 8列 (一般的なテクスチャシート幅)
            // 必要な行数: ceil(47/8) = 6行。合計48スロット。
            tileList = valid;
            canvas.width = tileSize * 8;
            canvas.height = tileSize * 6;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // タイルを描画
        tileList.forEach((mask, index) => {
            const col = index % (canvas.width / tileSize);
            const row = Math.floor(index / (canvas.width / tileSize));
            const x = col * tileSize;
            const y = row * tileSize;

            drawComposedTile(ctx, x, y, tileSize, mask, assets);
        });

        btnDownload.disabled = false;
    });
}

function drawComposedTile(ctx, x, y, size, mask, assets) {
    const qSize = size / 2;

    // 左上象限 (N, W, NW に依存) (タイルに対する相対位置)
    drawQuadrant(ctx, x, y, qSize, 'tl', mask.n, mask.w, mask.nw, assets);

    // 右上象限 (N, E, NE に依存)
    drawQuadrant(ctx, x + qSize, y, qSize, 'tr', mask.n, mask.e, mask.ne, assets);

    // 左下象限 (S, W, SW に依存)
    drawQuadrant(ctx, x, y + qSize, qSize, 'bl', mask.s, mask.w, mask.sw, assets);

    // 右下象限 (S, E, SE に依存)
    drawQuadrant(ctx, x + qSize, y + qSize, qSize, 'br', mask.s, mask.e, mask.se, assets);
}

function drawQuadrant(ctx, dx, dy, size, type, v, h, d, assets) {
    // type: 'tl', 'tr', 'bl', 'br' (描画対象のターゲットタイルのどの象限か)
    // v: 垂直方向の近傍 (0/1)
    // h: 水平方向の近傍 (0/1)
    // d: 対角方向の近傍 (0/1)

    // ロジック: 近傍に基づいてどのソース画像を使用するか決定する
    let assetName = '';

    if (v === 0 && h === 0) {
        // 垂直なし、水平なし -> 外側の角
        // どの外側の角？ 象限タイプと一致するもの。
        // 左上象限にはOuter_TL、右上にはOuter_TRなどが必要。
        assetName = `outer_${type}`;
    } else if (v === 0 && h === 1) {
        // 垂直なし、水平あり -> 端
        // 左上を描画中で、v=N(0), h=W(1) なら、これは上端。
        // 右上を描画中で、v=N(0), h=E(1) なら、上端。
        // 左下を描画中で、v=S(0), h=W(1) なら、下端。
        // 右下を描画中で、v=S(0), h=E(1) なら、下端。
        if (type === 'tl' || type === 'tr') assetName = 'edge_t';
        else assetName = 'edge_b';
    } else if (v === 1 && h === 0) {
        // 垂直あり、水平なし -> 端
        // TL: N=1, W=0 -> 左端
        // TR: N=1, E=0 -> 右端
        // BL: S=1, W=0 -> 左端
        // BR: S=1, E=0 -> 右端
        if (type === 'tl' || type === 'bl') assetName = 'edge_l';
        else assetName = 'edge_r';
    } else if (v === 1 && h === 1) {
        // 垂直と水平の両方が存在
        if (d === 0) {
            // 対角が欠けている -> 内側の角
            assetName = `inner_${type}`;
        } else {
            // 完全 -> フィル
            assetName = 'fill';
        }
    }

    // 選択されたアセットの特定の象限を描画する
    // アセットは（すでに正しく回転/反転された）完全なタイルなので、
    // アセットの対応する象限を描画するだけでよい。

    // ソースアセットからの切り出し座標
    let sx = 0, sy = 0;
    // ソースアセットのサイズは `size * 2` (ここで渡されるsizeはqSizeなので)
    // 実際にはアセットはtileSize (例: 64)。qSizeは32。

    if (type === 'tr' || type === 'br') sx = size; // 右半分
    if (type === 'bl' || type === 'br') sy = size; // 下半分

    // 1. 常に最初にフィルの背景を描画する
    const fillAsset = assets['fill'];
    if (fillAsset) {
        ctx.drawImage(fillAsset, sx, sy, size, size, dx, dy, size, size);
    }

    // 2. その上に特定のパーツを描画する（重複を避けるため、それがフィルでない場合のみ）
    if (assetName !== 'fill') {
        const asset = assets[assetName];
        if (asset) {
            ctx.drawImage(asset, sx, sy, size, size, dx, dy, size, size);
        }
    }
}

function downloadTiles() {
    const link = document.createElement('a');
    link.download = 'autotile_set.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}
