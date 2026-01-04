/**
 * オートタイルジェネレーターのロジック (DnD版)
 */

// DOM要素
const elements = {
    inputSource: document.getElementById('input-source'),
    gridSize: document.getElementById('grid-size'),
    sourceCanvas: document.getElementById('source-canvas'),

    // settings
    modeRadios: document.getElementsByName('tile-mode'),
    tileSize: document.getElementById('tile-size'),

    // actions
    btnGenerate: document.getElementById('btn-generate'),
    btnDownload: document.getElementById('btn-download'),
    errorMsg: document.getElementById('error-msg'),

    // preview
    previewCanvas: document.getElementById('preview-canvas'),
    placeholderText: document.getElementById('placeholder-text'),

    // slots
    slots: document.querySelectorAll('.slot')
};

const ctxSource = elements.sourceCanvas.getContext('2d');
const ctxPreview = elements.previewCanvas.getContext('2d');

// 状態
let state = {
    sourceImage: null, // ImageBitmap or HTMLImageElement
    gridSize: 64,
    assignments: {
        outerCorner: null,
        innerCorner: null,
        edgeLeft: null,
        edgeTop: null,
        fill: null
    },
    isDragging: false,
    dragData: null // { x, y, width, height, imageBitmap }
};

// 初期化
init();

function init() {
    // イベントリスナー
    elements.inputSource.addEventListener('change', handleSourceUpload);
    elements.gridSize.addEventListener('change', updateGrid);
    elements.gridSize.addEventListener('input', updateGrid);

    elements.btnGenerate.addEventListener('click', generateTiles);
    elements.btnDownload.addEventListener('click', downloadTiles);

    // Canvas Mouse Events for Dragging
    elements.sourceCanvas.addEventListener('mousedown', handleCanvasMouseDown);
    // Note: We use a simplified 'click-to-select' or 'drag-ghost' approach.
    // HTML5 native Drag & Drop from Canvas is tricky without creating an image element.
    // Let's implement a custom "Draggable" utilizing standard HTML5 DnD attributes on a ghost element 
    // OR just use internal state tracking if we don't need to drag OUT of the browser.
    // However, "Drop Zones" are divs. Standard HTML5 DnD is best for Div targets.

    // Approach:
    // 1. MouseDown on Canvas -> Calculate Cell.
    // 2. Set 'draggable="true"' dynamically on the canvas? No.
    // 3. Alternative: Use a hidden draggable element that follows mouse?
    // 4. Easies fix for "DnD from Canvas to Div": 
    //    Make the Canvas draggable="true".
    //    On 'dragstart', set the dataTransfer with the cell info.

    elements.sourceCanvas.setAttribute('draggable', 'true');
    elements.sourceCanvas.addEventListener('dragstart', handleDragStart);

    // Slot Events
    elements.slots.forEach(slot => {
        slot.addEventListener('dragover', handleDragOver);
        slot.addEventListener('dragleave', handleDragLeave);
        slot.addEventListener('drop', handleDrop);
        slot.addEventListener('click', () => {
            // Optional: Click to clear?
        });
    });
}

// --- ソース画像処理 ---

async function handleSourceUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const bmp = await createImageBitmap(file);
        state.sourceImage = bmp;
        updateSourceCanvas();
    } catch (err) {
        console.error(err);
        showError("画像の読み込みに失敗しました");
    }
}

function updateGrid() {
    state.gridSize = parseInt(elements.gridSize.value, 10) || 64;
    updateSourceCanvas();
}

function updateSourceCanvas() {
    if (!state.sourceImage) return;

    const w = state.sourceImage.width;
    const h = state.sourceImage.height;

    elements.sourceCanvas.width = w;
    elements.sourceCanvas.height = h;

    // Draw Image
    ctxSource.drawImage(state.sourceImage, 0, 0);

    // Draw Grid
    drawGridOverlay(w, h, state.gridSize);
}

function drawGridOverlay(w, h, size) {
    ctxSource.strokeStyle = 'rgba(0, 255, 255, 0.5)';
    ctxSource.lineWidth = 1;
    ctxSource.beginPath();

    // Verticals
    for (let x = 0; x <= w; x += size) {
        ctxSource.moveTo(x, 0);
        ctxSource.lineTo(x, h);
    }

    // Horizontals
    for (let y = 0; y <= h; y += size) {
        ctxSource.moveTo(0, y);
        ctxSource.lineTo(w, y);
    }

    ctxSource.stroke();
}

function showError(msg) {
    elements.errorMsg.textContent = msg;
    setTimeout(() => elements.errorMsg.textContent = '', 3000);
}

// --- Drag & Drop Handling ---

function handleDragStart(e) {
    if (!state.sourceImage) {
        e.preventDefault();
        return;
    }

    // Calculate cell based on mouse position relative to canvas
    const rect = elements.sourceCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Scale for canvas scaling (if any CSS scaling)
    const scaleX = elements.sourceCanvas.width / rect.width;
    const scaleY = elements.sourceCanvas.height / rect.height;

    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    const cellSize = state.gridSize;
    const col = Math.floor(canvasX / cellSize);
    const row = Math.floor(canvasY / cellSize);

    const cellX = col * cellSize;
    const cellY = row * cellSize;

    // Check bounds
    if (cellX >= elements.sourceCanvas.width || cellY >= elements.sourceCanvas.height) {
        e.preventDefault();
        return;
    }

    // Store data
    state.dragData = {
        x: cellX,
        y: cellY,
        width: cellSize,
        height: cellSize
    };

    // Create preview image for drag (optional, simple ghost)
    // To make it look nice, we can extract the blob.
    // For now, simple text transfer or JSON
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(state.dragData));

    // Generating a ghost image from canvas part is async/complex in dragstart synchronous event
    // So we rely on browser default or set a standard icon if needed.
}

function handleDragOver(e) {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'copy';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    const slotElement = e.currentTarget;
    slotElement.classList.remove('drag-over');

    const dataStr = e.dataTransfer.getData('application/json');
    if (!dataStr) return;

    try {
        const data = JSON.parse(dataStr);
        const role = slotElement.dataset.role;

        // Extract the sub-image from source
        const cellCanvas = document.createElement('canvas');
        cellCanvas.width = data.width;
        cellCanvas.height = data.height;
        const cCtx = cellCanvas.getContext('2d');

        cCtx.drawImage(state.sourceImage,
            data.x, data.y, data.width, data.height,
            0, 0, data.width, data.height
        );

        // Create Bitmap for rendering usage
        const bmp = await createImageBitmap(cellCanvas);
        state.assignments[role] = bmp; // Store for generator

        // Update Slot UI
        updateSlotUI(slotElement, cellCanvas);

    } catch (err) {
        console.error(err);
        showError("ドロップの処理に失敗しました");
    }
}

function updateSlotUI(slotElement, canvasImage) {
    slotElement.classList.add('filled');
    const container = slotElement.querySelector('.slot-content');
    container.innerHTML = '';
    container.appendChild(canvasImage);
}

// --- ハンドリング (クリックでグリッド選択 - オプション) ---
function handleCanvasMouseDown(e) {
    // Just for visual feedback or preparing drag
}


// --- タイル生成ロジック (既存改修) ---

function getSettings() {
    let mode = '16';
    for (const radio of elements.modeRadios) {
        if (radio.checked) {
            mode = radio.value;
            break;
        }
    }
    return {
        mode: mode,
        tileSize: parseInt(elements.tileSize.value, 10) || 64
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
    const assetMap = {};

    // Helper to generate a single asset variant
    // Note: 'loadedImages' is replaced by 'state.assignments'
    const createAsset = (roleKey, rot, flipX, flipY) => {
        const c = document.createElement('canvas');
        c.width = tileSize;
        c.height = tileSize;
        const cx = c.getContext('2d');
        const img = state.assignments[roleKey];
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
    assetMap['edge_l'] = createAsset('edgeLeft', 0, false, false);
    assetMap['edge_r'] = createAsset('edgeLeft', 0, true, false);
    assetMap['edge_t'] = createAsset('edgeTop', 0, false, false);
    assetMap['edge_b'] = createAsset('edgeTop', 0, false, true);

    // フィル
    assetMap['fill'] = createAsset('fill', 0, false, false);

    return assetMap;
}

function generateTiles() {
    const { mode, tileSize } = getSettings();

    // Check if fully assigned? (Or allow partial)
    // Let's warn if empty but proceed
    const missing = Object.keys(state.assignments).filter(k => !state.assignments[k]);
    if (missing.length === 5) { // All missing
        showError("パーツが割り当てられていません");
        return;
    }

    elements.placeholderText.style.display = 'none';

    prepareAssets(tileSize).then(assets => {
        let tileList = [];

        if (mode === '16') {
            for (let i = 0; i < 16; i++) {
                const n = (i & 1) ? 1 : 0;
                const w = (i & 2) ? 1 : 0;
                const e = (i & 4) ? 1 : 0;
                const s = (i & 8) ? 1 : 0;
                tileList.push({ n, w, e, s, nw: 1, ne: 1, sw: 1, se: 1 });
            }
            elements.previewCanvas.width = tileSize * 4;
            elements.previewCanvas.height = tileSize * 4;
        } else {
            // 47-tile
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

                if (nw && (!n || !w)) continue;
                if (ne && (!n || !e)) continue;
                if (sw && (!s || !w)) continue;
                if (se && (!s || !e)) continue;

                valid.push({ n, w, e, s, nw, ne, sw, se });
            }
            tileList = valid;
            elements.previewCanvas.width = tileSize * 8;
            elements.previewCanvas.height = tileSize * 6;
        }

        ctxPreview.clearRect(0, 0, elements.previewCanvas.width, elements.previewCanvas.height);

        tileList.forEach((mask, index) => {
            const col = index % (elements.previewCanvas.width / tileSize);
            const row = Math.floor(index / (elements.previewCanvas.width / tileSize));
            const x = col * tileSize;
            const y = row * tileSize;

            drawComposedTile(ctxPreview, x, y, tileSize, mask, assets);
        });

        elements.btnDownload.disabled = false;
    });
}

function drawComposedTile(ctx, x, y, size, mask, assets) {
    const qSize = size / 2;
    drawQuadrant(ctx, x, y, qSize, 'tl', mask.n, mask.w, mask.nw, assets);
    drawQuadrant(ctx, x + qSize, y, qSize, 'tr', mask.n, mask.e, mask.ne, assets);
    drawQuadrant(ctx, x, y + qSize, qSize, 'bl', mask.s, mask.w, mask.sw, assets);
    drawQuadrant(ctx, x + qSize, y + qSize, qSize, 'br', mask.s, mask.e, mask.se, assets);
}

function drawQuadrant(ctx, dx, dy, size, type, v, h, d, assets) {
    let assetName = '';

    // Logic (Same as before)
    if (v === 0 && h === 0) {
        assetName = `outer_${type}`;
    } else if (v === 0 && h === 1) {
        if (type === 'tl' || type === 'tr') assetName = 'edge_t';
        else assetName = 'edge_b';
    } else if (v === 1 && h === 0) {
        if (type === 'tl' || type === 'bl') assetName = 'edge_l';
        else assetName = 'edge_r';
    } else if (v === 1 && h === 1) {
        if (d === 0) assetName = `inner_${type}`;
        else assetName = 'fill';
    }

    let sx = 0, sy = 0;
    if (type === 'tr' || type === 'br') sx = size;
    if (type === 'bl' || type === 'br') sy = size;

    // 1. Fill Background
    const fillAsset = assets['fill'];
    if (fillAsset) {
        ctx.drawImage(fillAsset, sx, sy, size, size, dx, dy, size, size);
    }

    // 2. Specific Part
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
    link.href = elements.previewCanvas.toDataURL('image/png');
    link.click();
}
