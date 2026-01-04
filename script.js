/**
 * Auto Tile Generator Logic
 */

// DOM Elements
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

// State
let loadedImages = {
    outerCorner: null, // TL
    innerCorner: null, // TL
    edgeLeft: null,    // Left
    edgeTop: null,     // Top
    fill: null         // Center
};

// Event Listeners
Object.keys(inputs).forEach(key => {
    inputs[key].addEventListener('change', (e) => handleImageUpload(key, e.target.files[0]));
});

btnGenerate.addEventListener('click', generateTiles);
btnDownload.addEventListener('click', downloadTiles);

// Functions
async function handleImageUpload(key, file) {
    if (!file) return;
    try {
        const bmp = await createImageBitmap(file);
        loadedImages[key] = bmp;
        // Optional: show some checkmark or preview near input
        inputs[key].parentElement.style.borderLeft = "3px solid #3b82f6";
    } catch (e) {
        console.error("Failed to load image", e);
        alert("Failed to load image");
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

// Utility: Resize/Draw image to a new canvas or context
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
    // We need 13 base assets scaled to tileSize
    // Outer: TL, TR, BR, BL
    // Inner: TL, TR, BR, BL
    // Edge: L, R, T, B
    // Fill

    // Create an offscreen canvas for assets
    const assetMap = {};

    // Helper to generate a single asset variant
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

    // Outer Corners (Input is TL)
    assetMap['outer_tl'] = createAsset('outerCorner', 0, false, false);
    assetMap['outer_tr'] = createAsset('outerCorner', 90, false, false);
    assetMap['outer_br'] = createAsset('outerCorner', 180, false, false);
    assetMap['outer_bl'] = createAsset('outerCorner', 270, false, false);

    // Inner Corners (Input is TL)
    assetMap['inner_tl'] = createAsset('innerCorner', 0, false, false);
    assetMap['inner_tr'] = createAsset('innerCorner', 90, false, false);
    assetMap['inner_br'] = createAsset('innerCorner', 180, false, false);
    assetMap['inner_bl'] = createAsset('innerCorner', 270, false, false);

    // Edges
    assetMap['edge_l'] = createAsset('edgeLeft', 0, false, false); // Input Left
    assetMap['edge_r'] = createAsset('edgeLeft', 0, true, false);  // Flip X for Right
    assetMap['edge_t'] = createAsset('edgeTop', 0, false, false);  // Input Top
    assetMap['edge_b'] = createAsset('edgeTop', 0, false, true);   // Flip Y for Bottom

    // Fill
    assetMap['fill'] = createAsset('fill', 0, false, false);

    return assetMap;
}

function generateTiles() {
    const { mode, tileSize } = getSettings();

    // Validation
    const missing = Object.keys(loadedImages).filter(k => !loadedImages[k]);
    if (missing.length > 0) {
        alert(`Missing images: ${missing.join(', ')}`);
        return;
    }

    placeholderText.style.display = 'none';

    prepareAssets(tileSize).then(assets => {

        let tileList = [];

        if (mode === '16') {
            // Generate standard 16 bitmasks (0-15)
            // Bitmask: N=1, E=2, S=4, W=8 (Standard 4-bit)
            // Wait, standard 16-tile mapping:
            // Let's generate all 16 combinations of orthogonal neighbors.
            // 0000 to 1111.
            for (let i = 0; i < 16; i++) {
                // Decode
                const north = (i & 1) ? 1 : 0; // Wait, usually N=1, E=2, S=4, W=8 is standard but let's be explicit
                // Actually, let's use a standard visual order?
                // 4x4 grid.
                // Row 0: 0000(0), 1000(N), 0100(E), 1100(NE)...
                // Let's just generate i=0..15 and place them. 
                // Note: 'i' here will be treated as the bitmask.
                // My bitmask convension: N=1, W=2, E=4, S=8 (Arbitrary, just need consistency)
                const n = (i & 1) ? 1 : 0;
                const w = (i & 2) ? 1 : 0;
                const e = (i & 4) ? 1 : 0;
                const s = (i & 8) ? 1 : 0;

                // Diagonals are assumed 1 (connected) for 16-tile basic set, 
                // because 16-tile doesn't support "broken" diagonals.
                // So we pass nw=1, ne=1, ...

                tileList.push({
                    n, w, e, s,
                    nw: 1, ne: 1, sw: 1, se: 1
                });
            }

            canvas.width = tileSize * 4;
            canvas.height = tileSize * 4;

        } else {
            // 47-tile mode
            // Generate all 256 masks, filter invalid.
            // Invalid rule: If N=0 or W=0, then NW must be 0. (Strict blob)
            // Loop 0..255.
            // Bit order: N=1, W=2, E=4, S=8, NW=16, NE=32, SW=64, SE=128

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

                // Rule check
                if (nw && (!n || !w)) continue;
                if (ne && (!n || !e)) continue;
                if (sw && (!s || !w)) continue;
                if (se && (!s || !e)) continue;

                valid.push({ n, w, e, s, nw, ne, sw, se });
            }

            // Should be exactly 47
            console.log(`Generated ${valid.length} tiles for 47-mode`);

            // Layout: 8 columns (typical texture sheet width)
            // Rows needed: ceil(47/8) = 6 rows. Total 48 slots.
            tileList = valid;
            canvas.width = tileSize * 8;
            canvas.height = tileSize * 6;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw tiles
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

    // TL Quadrant (Depends on N, W, NW) (Relative to the TILE)
    drawQuadrant(ctx, x, y, qSize, 'tl', mask.n, mask.w, mask.nw, assets);

    // TR Quadrant (Depends on N, E, NE)
    drawQuadrant(ctx, x + qSize, y, qSize, 'tr', mask.n, mask.e, mask.ne, assets);

    // BL Quadrant (Depends on S, W, SW)
    drawQuadrant(ctx, x, y + qSize, qSize, 'bl', mask.s, mask.w, mask.sw, assets);

    // BR Quadrant (Depends on S, E, SE)
    drawQuadrant(ctx, x + qSize, y + qSize, qSize, 'br', mask.s, mask.e, mask.se, assets);
}

function drawQuadrant(ctx, dx, dy, size, type, v, h, d, assets) {
    // type: 'tl', 'tr', 'bl', 'br' (Which quadrant of the TARGET tile we are drawing)
    // v: Vertical Neighbor (0/1)
    // h: Horizontal Neighbor (0/1)
    // d: Diagonal Neighbor (0/1)

    // Logic: Decide which source image to use based on neighbors
    let assetName = '';

    if (v === 0 && h === 0) {
        // No vertical, no horizontal -> Outer Corner
        // Which Outer Corner? Matches the quadrant type.
        // TL quadrant needs Outer_TL, TR needs Outer_TR, etc.
        assetName = `outer_${type}`;
    } else if (v === 0 && h === 1) {
        // No vertical, yes horizontal -> Edge
        // If drawing TL, v=N(0), h=W(1). This is a Top Edge.
        // If drawing TR, v=N(0), h=E(1). Top Edge.
        // If drawing BL, v=S(0), h=W(1). Bottom Edge.
        // If drawing BR, v=S(0), h=E(1). Bottom Edge.
        if (type === 'tl' || type === 'tr') assetName = 'edge_t';
        else assetName = 'edge_b';
    } else if (v === 1 && h === 0) {
        // Yes vertical, no horizontal -> Edge
        // TL: N=1, W=0 -> Left Edge
        // TR: N=1, E=0 -> Right Edge
        // BL: S=1, W=0 -> Left Edge
        // BR: S=1, E=0 -> Right Edge
        if (type === 'tl' || type === 'bl') assetName = 'edge_l';
        else assetName = 'edge_r';
    } else if (v === 1 && h === 1) {
        // Both vertical and horizontal present.
        if (d === 0) {
            // Diagonal missing -> Inner Corner
            assetName = `inner_${type}`;
        } else {
            // Full -> Fill
            assetName = 'fill';
        }
    }

    // Now draw the SPECIFIC quadrant of the selected asset
    // Since our assets are full tiles (already rotated/flipped correctly),
    // we just need to draw the corresponding quadrant of the asset.
    // E.g. If we need `outer_tl`, we assume that image is correct, and we want its 'tl' quadrant?
    // WARNING: Yes, `prepareAssets` created full tiles oriented correctly.
    // So `outer_tl` asset is a tile where the Top-Left is the corner.
    // So we just draw the `type` quadrant of that asset.

    // Slicing coordinates from source asset
    let sx = 0, sy = 0;
    // Source Asset size is `size * 2` (because size passed here is qSize)
    // Actually assets are tileSize (e.g. 64). qSize is 32.

    if (type === 'tr' || type === 'br') sx = size; // Right half
    if (type === 'bl' || type === 'br') sy = size; // Bottom half

    const asset = assets[assetName];
    if (asset) {
        ctx.drawImage(asset, sx, sy, size, size, dx, dy, size, size);
    }
}

function downloadTiles() {
    const link = document.createElement('a');
    link.download = 'autotile_set.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}
