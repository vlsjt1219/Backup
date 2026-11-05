/* =====================================================================
   MAFIAZ 레이아웃 에디터 (위치 어긋남, 이동 제한, 스냅 완벽 해결판)
   ===================================================================== */
(function () {
    const MZ = window.MZ;
    const sb = MZ.sb;
    const TABLE = MZ.TABLE;

    window.startEditor = function (isAdmin, pageName) {
        const basePage = pageName || 'main';
        const PAGE = (basePage === 'main') ? ('main_' + MZ.getTheme()) : basePage;
        const isMainPage = (basePage === 'main');
        
        const gallery = document.getElementById('draggableGallery');
        const panelContent = document.getElementById('panelContent');
        const resetBtn = document.getElementById('resetLayoutBtn');
        const saveBtn = document.getElementById('saveLayoutBtn');
        const addTextBtn = document.getElementById('addTextBtn');
        const addCalendarBtn = document.getElementById('addCalendarBtn');
        const addImageBtn = document.getElementById('addImageBtn');
        const addStickerBtn = document.getElementById('addStickerBtn');
        const snapToggle = document.getElementById('snapToggle');
        const lineV = document.getElementById('centerSnapLineV');
        const lineH = document.getElementById('centerSnapLineH');
        const elemLineV = document.getElementById('elemSnapLineV');
        const elemLineH = document.getElementById('elemSnapLineH');
        const selectionMarquee = document.getElementById('selectionMarquee');

        const imageEditModal = document.getElementById('imageEditModal');
        const closeImgModal = document.getElementById('closeImgModal');
        const applyImgModal = document.getElementById('applyImgModal');
        const modalImgScale = document.getElementById('modalImgScale');
        const cropPreviewContainer = document.getElementById('cropPreviewContainer');
        const modalTargetImg = document.getElementById('modalTargetImg');
        const editTabA = document.getElementById('editTabA');
        const editTabB = document.getElementById('editTabB');

        let editingImageElement = null;
        let currentEditingTarget = 'A';
        let activeElement = null;
        let selectedElements = new Set();
        let dirty = false;     
        let loaded = false;    

        if (isAdmin) document.body.classList.add('is-admin', 'mh-admin-edit');

        const normalizeImgUrl = MZ.imgUrl;   
        const esc = MZ.esc;
        const hexToRgba = MZ.hexToRgba;

        function parseRgbaColor(rgbaStr) {
            if (!rgbaStr || rgbaStr === 'transparent') return { hex: '#1f1f2a', alpha: 1 };
            if (rgbaStr.startsWith('#')) return { hex: rgbaStr, alpha: 1 };
            const match = rgbaStr.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)/);
            if (match) {
                const r = parseInt(match[1]).toString(16).padStart(2, '0');
                const g = parseInt(match[2]).toString(16).padStart(2, '0');
                const b = parseInt(match[3]).toString(16).padStart(2, '0');
                const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
                return { hex: `#${r}${g}${b}`, alpha: a };
            }
            return { hex: '#1f1f2a', alpha: 1 };
        }

        function toHexColor(c, fallback) {
            if (!c) return fallback;
            if (c.startsWith('#')) return c.length === 7 ? c : fallback;
            const m = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return fallback;
            return '#' + [m[1], m[2], m[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        }

        function getImgState(el, key) {
            const p = key.toLowerCase();
            return {
                src: el.getAttribute('data-val-' + p) || '',
                scale: parseFloat(el.getAttribute('data-img-scale-' + p)) || 1,
                x: parseFloat(el.getAttribute('data-img-posx-' + p)) || 0,
                y: parseFloat(el.getAttribute('data-img-posy-' + p)) || 0
            };
        }
        function imgTransformCss(s) { return `translate(${s.x}%, ${s.y}%) scale(${s.scale})`; }

        function makeBlockImg(cls, alt, s) {
            const img = document.createElement('img');
            img.className = cls;
            img.alt = alt;
            img.draggable = false;
            if (s.src) MZ.setImgSrc(img, normalizeImgUrl(s.src));
            img.style.cssText = 'position:absolute; left:0; top:0; width:100%; height:100%; object-fit:contain; transform-origin:center center;';
            img.style.transform = imgTransformCss(s);
            return img;
        }

        function renderImageBlock(el) {
            const main = el.getAttribute('data-main-img') || 'A';
            const other = main === 'A' ? 'B' : 'A';
            el.innerHTML = '';
            el.appendChild(makeBlockImg('main-img', '메인', getImgState(el, main)));
            el.appendChild(makeBlockImg('hover-img', '오버', getImgState(el, other)));
        }

        // 이미지 블록 패널의 A/B 링크 입력 → 블록에 반영 (원본 코드에서 호출만 되고 정의가 빠져 있었음)
        // 링크 입력칸 아래에 "GitHub에서 선택" 버튼을 붙임 → 고르면 입력칸에 주소가 들어가고 input 이벤트로 블록에 반영
        function attachGhPicker(inputId, accept, el) {
            const input = document.getElementById(inputId);
            if (!input || !MZ.pickGithubImage) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = '📁 GitHub에서 선택';
            btn.style.cssText = 'display:block; width:100%; margin-top:4px; background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; font-size:0.78em; padding:4px 2px; border-radius:3px; cursor:pointer;';
            btn.addEventListener('click', function () {
                MZ.pickGithubImage({
                    accept: accept,
                    onPick: function (url, name, info) {
                        // 일부만 자른 경우: 스티커·효과 블록은 가로를 유지하고 높이를 조각 비율에 맞춤 (그림이 찌그러지지 않게)
                        if (el && info && info.ratio > 0) {
                            const w = parseFloat(el.style.width) || el.offsetWidth;
                            if (w) el.style.height = Math.max(8, Math.round(w / info.ratio)) + 'px';
                        }
                        input.value = url;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            });
            input.insertAdjacentElement('afterend', btn);
        }

        function bindImgSide(el, S) {
            const input = document.getElementById('val' + S + 'Input');
            if (!input) return;
            attachGhPicker('val' + S + 'Input', 'image');
            input.addEventListener('input', e => {
                el.setAttribute('data-val-' + S.toLowerCase(), e.target.value.trim());
                renderImageBlock(el);
                saveState(el);
            });
        }

        function updateImageTransforms(el) {
            const main = el.getAttribute('data-main-img') || 'A';
            const other = main === 'A' ? 'B' : 'A';
            const m = el.querySelector('.main-img');
            const h = el.querySelector('.hover-img');
            if (!m || !h) { renderImageBlock(el); return; }
            m.style.transform = imgTransformCss(getImgState(el, main));
            h.style.transform = imgTransformCss(getImgState(el, other));
        }

        // =================================================================
        // 장식 블록 (스티커 / 도형 / 효과)
        //  - 종류별 설정값은 data-p-* 속성에 두고, 저장할 때 layout_data.props 로 함께 직렬화한다.
        //  - 크기는 스티커·도형·효과 모두 같은 방식(자유 조절 / Shift = 비율 고정)으로 조절된다.
        // =================================================================
        const DECOR_TYPES = ['sticker', 'shape', 'effect'];
        const isDecor = t => DECOR_TYPES.indexOf(t) >= 0;
        const P = (el, k, d = '') => { const v = el.getAttribute('data-p-' + k); return (v === null || v === '') ? d : v; };
        const setP = (el, k, v) => el.setAttribute('data-p-' + k, v);
        const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

        function boxSize(el) {
            return { w: parseFloat(el.style.width) || el.offsetWidth || 1, h: parseFloat(el.style.height) || el.offsetHeight || 1 };
        }
        function hexToRgbArr(hex) {
            let h = String(hex || '').replace('#', '');
            if (h.length === 3) h = h.split('').map(c => c + c).join('');
            const n = parseInt(h, 16) || 0;
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        }
        function setAspect(el, w, h) { if (w && h) setP(el, 'aspect', (w / h).toFixed(4)); }   // Shift 비율 고정용 원본 비율

        function showPlaceholder(el, text, color) {
            el.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; color:${color || '#9d947e'}; font-size:0.8em; text-align:center; pointer-events:none;">${esc(text)}</div>`;
        }
        // 이미지는 칸 크기에 맞춰 그대로 늘어난다(자유 조절 시 이미지도 같이 변형)
        function makeFillImg(url) {
            const img = document.createElement('img');
            MZ.setImgSrc(img, url);
            img.draggable = false;
            img.style.cssText = 'width:100%; height:100%; object-fit:fill; display:block; pointer-events:none;';
            return img;
        }

        // 색 변경용 이미지(CORS 허용 로드)는 주소별로 한 번만 불러온다
        const stickerImgCache = new Map();
        function loadStickerImage(url) {
            if (!stickerImgCache.has(url)) {
                stickerImgCache.set(url, new Promise((resolve, reject) => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => { stickerImgCache.delete(url); reject(new Error('load')); };
                    MZ.resolveImgSrc(url).then(r => { img.src = r; });
                }));
            }
            return stickerImgCache.get(url);
        }

        // 스티커: 이미지(선·어두운 부분) 색 / 내부 면(밝은 부분) 색을 따로 바꾼다. 투명 배경은 그대로 유지.
        async function renderStickerElement(el) {
            const seq = el._seq = (el._seq || 0) + 1;
            const src = P(el, 'src');
            const lineOn = P(el, 'line-on', '0') === '1';
            const fillOn = P(el, 'fill-on', '0') === '1';
            el.style.backgroundColor = 'transparent';

            if (!src) { showPlaceholder(el, '스티커 이미지 링크를 입력하세요'); return; }
            const url = normalizeImgUrl(src);

            if (!lineOn && !fillOn) {
                const img = makeFillImg(url);
                img.onload = () => setAspect(el, img.naturalWidth, img.naturalHeight);
                img.onerror = () => showPlaceholder(el, '이미지 로드 실패', '#ff4757');
                el.innerHTML = '';
                el.appendChild(img);
                return;
            }

            try {
                const img = await loadStickerImage(url);
                if (seq !== el._seq) return;                       // 그 사이 설정이 또 바뀌었으면 버림
                setAspect(el, img.naturalWidth, img.naturalHeight);

                const MAX = 1600;
                const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
                canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const d = imgData.data;
                const [lr, lg, lb] = hexToRgbArr(P(el, 'line', '#000000'));
                const [fr, fg, fb] = hexToRgbArr(P(el, 'fill', '#ffc83c'));
                const thr = parseInt(P(el, 'thr', '128'), 10);
                const soft = 28;                                   // 선/면 경계를 부드럽게 (톱니 방지)

                for (let i = 0; i < d.length; i += 4) {
                    if (d[i + 3] < 8) continue;                    // 투명 배경은 건드리지 않음
                    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
                    const t = clamp((lum - (thr - soft)) / (soft * 2), 0, 1);   // 0 = 선(어두움), 1 = 면(밝음)
                    const wl = lineOn ? (1 - t) : 0;
                    const wf = fillOn ? t : 0;
                    if (!wl && !wf) continue;
                    d[i]     += (lr - d[i])     * wl + (fr - d[i])     * wf;
                    d[i + 1] += (lg - d[i + 1]) * wl + (fg - d[i + 1]) * wf;
                    d[i + 2] += (lb - d[i + 2]) * wl + (fb - d[i + 2]) * wf;
                }
                ctx.putImageData(imgData, 0, 0);

                canvas.style.cssText = 'width:100%; height:100%; display:block; pointer-events:none;';
                el.innerHTML = '';
                el.appendChild(canvas);
            } catch (err) {
                if (seq !== el._seq) return;
                // 이미지 서버가 CORS를 허용하지 않으면 색 변경은 못 하고 원본만 표시
                const fallback = makeFillImg(url);
                fallback.title = '이 이미지 서버가 CORS를 허용하지 않아 색 변경을 적용할 수 없습니다.';
                fallback.onerror = () => showPlaceholder(el, '이미지 로드 실패', '#ff4757');
                el.innerHTML = '';
                el.appendChild(fallback);
            }
        }

        // 도형: 칸 크기에 맞춰 SVG 를 다시 그린다 (선 두께·점선 간격이 늘어나도 일정하게 유지)
        function renderShapeElement(el) {
            const { w: W, h: H } = boxSize(el);
            const kind = P(el, 'kind', 'rect');
            const isLine = kind === 'line';
            const fillOn = !isLine && P(el, 'fill-on', '1') === '1';
            const strokeOn = isLine || P(el, 'stroke-on', '1') === '1';
            const sw = strokeOn ? clamp(parseFloat(P(el, 'stroke-w', '3')) || 1, 0.5, 80) : 0;
            const dash = P(el, 'dash', 'solid');
            const dl = Math.max(0.5, parseFloat(P(el, 'dash-len', '10')) || 10);
            const dg = Math.max(0, parseFloat(P(el, 'dash-gap', '8')) || 0);

            const i = sw / 2;                                      // 선이 칸 밖으로 나가지 않게 안쪽으로 들여 그림
            const x0 = i, y0 = i, x1 = Math.max(i, W - i), y1 = Math.max(i, H - i);
            const cx = W / 2, cy = H / 2;
            const poly = pts => `<polygon points="${pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ')}"/>`;

            let geo;
            switch (kind) {
                case 'ellipse':
                    geo = `<ellipse cx="${cx}" cy="${cy}" rx="${(x1 - x0) / 2}" ry="${(y1 - y0) / 2}"/>`; break;
                case 'round': {
                    const r = clamp(parseFloat(P(el, 'radius', '16')) || 0, 0, Math.min(x1 - x0, y1 - y0) / 2);
                    geo = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="${r}" ry="${r}"/>`; break;
                }
                case 'diamond':  geo = poly([[cx, y0], [x1, cy], [cx, y1], [x0, cy]]); break;
                case 'triangle': geo = poly([[cx, y0], [x1, y1], [x0, y1]]); break;
                case 'hexagon': {
                    const q = (x1 - x0) / 4;
                    geo = poly([[x0 + q, y0], [x1 - q, y0], [x1, cy], [x1 - q, y1], [x0 + q, y1], [x0, cy]]); break;
                }
                case 'star': {
                    const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2, pts = [];
                    for (let n = 0; n < 10; n++) {
                        const ang = (-90 + n * 36) * Math.PI / 180, r = (n % 2 === 0) ? 1 : 0.382;
                        pts.push([cx + rx * r * Math.cos(ang), cy + ry * r * Math.sin(ang)]);
                    }
                    geo = poly(pts); break;
                }
                case 'line':
                    geo = `<line x1="0" y1="${cy}" x2="${W}" y2="${cy}"/>`; break;
                default:
                    geo = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
            }

            let dashAttr = '', capAttr = 'butt';
            if (dash === 'dashed') dashAttr = `${dl} ${dg}`;
            else if (dash === 'dotted') { dashAttr = `0.01 ${dg + sw}`; capAttr = 'round'; }   // 둥근 점

            el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block; position:absolute; left:0; top:0; pointer-events:none; overflow:visible;">
                <g fill="${fillOn ? esc(P(el, 'fill', '#c9a86a')) : 'none'}" fill-opacity="${clamp(parseFloat(P(el, 'fill-a', '0.25')), 0, 1)}"
                   stroke="${strokeOn ? esc(P(el, 'stroke', '#c9a86a')) : 'none'}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="${capAttr}"
                   ${dashAttr ? `stroke-dasharray="${dashAttr}"` : ''}>${geo}</g></svg>`;
        }

        // 효과: 움직이는 이미지(gif / apng / webp) 또는 영상(mp4 / webm)
        function renderEffectElement(el) {
            const src = P(el, 'src');
            el.style.opacity = P(el, 'opacity', '1');
            el.style.mixBlendMode = P(el, 'blend', 'normal');
            el.style.backgroundColor = 'transparent';
            if (!src) { showPlaceholder(el, '효과 이미지 링크를 입력하세요'); return; }
            const url = normalizeImgUrl(src);

            if (/\.(mp4|webm|ogv)(\?|#|$)/i.test(url)) {
                const v = document.createElement('video');
                v.src = url; v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
                v.style.cssText = 'width:100%; height:100%; object-fit:fill; display:block; pointer-events:none;';
                v.onloadedmetadata = () => setAspect(el, v.videoWidth, v.videoHeight);
                v.onerror = () => showPlaceholder(el, '영상 로드 실패', '#ff4757');
                el.innerHTML = '';
                el.appendChild(v);
                return;
            }
            const img = makeFillImg(url);
            img.onload = () => setAspect(el, img.naturalWidth, img.naturalHeight);
            img.onerror = () => showPlaceholder(el, '이미지 로드 실패', '#ff4757');
            el.innerHTML = '';
            el.appendChild(img);
        }

        function renderDecor(el) {
            const type = el.getAttribute('data-type');
            if (type === 'sticker') renderStickerElement(el);
            else if (type === 'shape') renderShapeElement(el);
            else if (type === 'effect') renderEffectElement(el);
        }
        // 슬라이더·컬러피커처럼 연속으로 들어오는 입력은 프레임당 한 번만 다시 그린다
        function scheduleDecorRender(el) {
            cancelAnimationFrame(el._raf);
            el._raf = requestAnimationFrame(() => renderDecor(el));
            saveState();
        }

        // ── 패널용: RGB 컬러 피커 (색 선택기 + R/G/B 숫자 입력이 서로 동기화) ──
        function rgbPickerHtml(id, hex) {
            const rgb = hexToRgbArr(hex);
            const num = (c, v) => `<input type="number" id="${id}_${c}" min="0" max="255" value="${v}" title="${c}" style="width:100%; min-width:0; padding:3px; text-align:center;">`;
            return `<div style="display:flex; gap:4px; align-items:center; margin:3px 0 8px;">
                <input type="color" id="${id}" value="${hex}" style="width:38px; height:26px; padding:0; flex:none; background:#111; border:1px solid #444; cursor:pointer;">
                <span style="font-size:0.7em; color:#ff6b6b;">R</span>${num('R', rgb[0])}
                <span style="font-size:0.7em; color:#2ed573;">G</span>${num('G', rgb[1])}
                <span style="font-size:0.7em; color:#54a0ff;">B</span>${num('B', rgb[2])}
            </div>`;
        }
        function bindRgbPicker(id, onChange) {
            const picker = document.getElementById(id);
            const nums = ['R', 'G', 'B'].map(c => document.getElementById(`${id}_${c}`));
            picker.addEventListener('input', () => {
                hexToRgbArr(picker.value).forEach((v, n) => { nums[n].value = v; });
                onChange(picker.value);
            });
            nums.forEach(inp => inp.addEventListener('input', () => {
                const hex = '#' + nums.map(x => clamp(parseInt(x.value, 10) || 0, 0, 255).toString(16).padStart(2, '0')).join('');
                picker.value = hex;
                onChange(hex);
            }));
        }

        const DECOR_BOX = 'border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;';
        const DECOR_TITLE = 'font-weight:bold; color:#c9a86a; margin-bottom:6px;';
        const DECOR_SUB = 'font-size:0.8em; margin:0; display:flex; align-items:center; gap:4px; cursor:pointer;';
        const DECOR_HINT = 'font-size:0.72em; color:#9d947e; line-height:1.4; margin-top:6px;';

        function stickerPanelHtml(el) {
            return `
            <div style="${DECOR_BOX}">
                <label style="${DECOR_TITLE}">스티커 이미지</label>
                <div class="panel-group"><input type="text" id="ctrlStickerSrc" value="${esc(P(el, 'src'))}" placeholder="images/파일명.png 또는 https://..." style="padding:4px;"></div>
                <div style="${DECOR_HINT}">배경이 투명한 이미지(png / webp)를 넣으세요.</div>
            </div>
            <div style="${DECOR_BOX}">
                <label style="${DECOR_TITLE}">색 변경</label>
                <label style="${DECOR_SUB}"><input type="checkbox" id="ctrlStickerLineOn" ${P(el, 'line-on', '0') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 이미지 색 (선 · 어두운 부분)</label>
                ${rgbPickerHtml('ctrlStickerLine', P(el, 'line', '#000000'))}
                <label style="${DECOR_SUB}"><input type="checkbox" id="ctrlStickerFillOn" ${P(el, 'fill-on', '0') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 내부 면 색 (밝은 부분)</label>
                ${rgbPickerHtml('ctrlStickerFill', P(el, 'fill', '#ffc83c'))}
                <div class="panel-group" style="margin-top:4px;">
                    <label>선 / 면 구분 기준 (밝기 ${P(el, 'thr', '128')})</label>
                    <input type="range" id="ctrlStickerThr" min="10" max="245" value="${P(el, 'thr', '128')}" style="accent-color:#c9a86a;">
                </div>
                <div style="${DECOR_HINT}">크기 조절: 그냥 끌면 자유롭게(이미지도 같이 변형), Shift를 누르고 끌면 이미지 비율이 유지됩니다.</div>
            </div>`;
        }
        function bindStickerPanel(el) {
            const lineChk = document.getElementById('ctrlStickerLineOn');
            const fillChk = document.getElementById('ctrlStickerFillOn');
            attachGhPicker('ctrlStickerSrc', 'image', el);
            document.getElementById('ctrlStickerSrc').addEventListener('input', e => { setP(el, 'src', e.target.value.trim()); scheduleDecorRender(el); });
            lineChk.addEventListener('change', () => { setP(el, 'line-on', lineChk.checked ? '1' : '0'); scheduleDecorRender(el); });
            fillChk.addEventListener('change', () => { setP(el, 'fill-on', fillChk.checked ? '1' : '0'); scheduleDecorRender(el); });
            bindRgbPicker('ctrlStickerLine', hex => {              // 색을 고르면 자동으로 켜짐
                setP(el, 'line', hex);
                if (!lineChk.checked) { lineChk.checked = true; setP(el, 'line-on', '1'); }
                scheduleDecorRender(el);
            });
            bindRgbPicker('ctrlStickerFill', hex => {
                setP(el, 'fill', hex);
                if (!fillChk.checked) { fillChk.checked = true; setP(el, 'fill-on', '1'); }
                scheduleDecorRender(el);
            });
            const thr = document.getElementById('ctrlStickerThr');
            thr.addEventListener('input', () => {
                setP(el, 'thr', thr.value);
                thr.previousElementSibling.textContent = `선 / 면 구분 기준 (밝기 ${thr.value})`;
                scheduleDecorRender(el);
            });
        }

        const SHAPE_KINDS = [
            ['rect', '네모'], ['round', '둥근 네모'], ['ellipse', '원형 / 타원'], ['diamond', '마름모'],
            ['triangle', '삼각형'], ['hexagon', '육각형'], ['star', '별'], ['line', '직선'], ['dashline', '점선']
        ];
        function shapePanelHtml(el) {
            const kind = P(el, 'kind', 'rect');
            const dash = P(el, 'dash', 'solid');
            const shown = (kind === 'line' && dash !== 'solid') ? 'dashline' : kind;      // 점선 = 직선 + 점선 모양
            const kindOpts = SHAPE_KINDS.map(([v, n]) => `<option value="${v}" ${shown === v ? 'selected' : ''}>${n}</option>`).join('');
            const fillA = P(el, 'fill-a', '0.25');
            return `
            <div style="${DECOR_BOX}">
                <label style="${DECOR_TITLE}">도형 종류</label>
                <select id="ctrlShapeKind" style="padding:4px;">${kindOpts}</select>
                <div id="ctrlShapeRadiusRow" class="panel-group" style="margin-top:6px; ${kind === 'round' ? '' : 'display:none;'}">
                    <label>모서리 둥글기 (px)</label>
                    <input type="number" id="ctrlShapeRadius" min="0" max="500" value="${esc(P(el, 'radius', '16'))}" style="padding:4px;">
                </div>
            </div>
            <div id="ctrlShapeFillBox" style="${DECOR_BOX} ${kind === 'line' ? 'display:none;' : ''}">
                <label style="${DECOR_SUB}"><input type="checkbox" id="ctrlShapeFillOn" ${P(el, 'fill-on', '1') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 채우기</label>
                ${rgbPickerHtml('ctrlShapeFill', P(el, 'fill', '#c9a86a'))}
                <div class="panel-group">
                    <label>채우기 투명도 (<span id="ctrlShapeFillAVal">${fillA}</span>)</label>
                    <input type="range" id="ctrlShapeFillA" min="0" max="1" step="0.05" value="${fillA}" style="accent-color:#c9a86a;">
                </div>
            </div>
            <div style="${DECOR_BOX}">
                <label style="${DECOR_SUB}"><input type="checkbox" id="ctrlShapeStrokeOn" ${P(el, 'stroke-on', '1') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 선 (외곽선)</label>
                ${rgbPickerHtml('ctrlShapeStroke', P(el, 'stroke', '#c9a86a'))}
                <div style="display:flex; gap:6px;">
                    <div class="panel-group" style="flex:1;"><label>두께 (px)</label><input type="number" id="ctrlShapeStrokeW" min="0.5" max="80" step="0.5" value="${esc(P(el, 'stroke-w', '3'))}" style="padding:4px;"></div>
                    <div class="panel-group" style="flex:1.4;"><label>선 모양</label>
                        <select id="ctrlShapeDash" style="padding:4px;">
                            <option value="solid" ${dash === 'solid' ? 'selected' : ''}>실선</option>
                            <option value="dashed" ${dash === 'dashed' ? 'selected' : ''}>점선</option>
                            <option value="dotted" ${dash === 'dotted' ? 'selected' : ''}>도트 (둥근 점)</option>
                        </select>
                    </div>
                </div>
                <div id="ctrlShapeDashRow" style="display:${dash === 'solid' ? 'none' : 'flex'}; gap:6px;">
                    <div class="panel-group" style="flex:1;" id="ctrlShapeDashLenWrap"><label>점선 길이 (px)</label><input type="number" id="ctrlShapeDashLen" min="0.5" max="200" step="0.5" value="${esc(P(el, 'dash-len', '10'))}" style="padding:4px;"></div>
                    <div class="panel-group" style="flex:1;"><label>간격 (px)</label><input type="number" id="ctrlShapeDashGap" min="0" max="200" step="0.5" value="${esc(P(el, 'dash-gap', '8'))}" style="padding:4px;"></div>
                </div>
                <div style="${DECOR_HINT}">크기 조절: 그냥 끌면 자유롭게, Shift를 누르고 끌면 현재 비율이 유지됩니다. 세로선은 회전 90°로 만드세요.</div>
            </div>`;
        }
        function bindShapePanel(el) {
            const $ = id => document.getElementById(id);
            const syncRows = () => {
                const kind = P(el, 'kind', 'rect'), dash = P(el, 'dash', 'solid');
                $('ctrlShapeRadiusRow').style.display = kind === 'round' ? '' : 'none';
                $('ctrlShapeFillBox').style.display = kind === 'line' ? 'none' : '';
                $('ctrlShapeDashRow').style.display = dash === 'solid' ? 'none' : 'flex';
                $('ctrlShapeDashLenWrap').style.display = dash === 'dotted' ? 'none' : '';
            };
            syncRows();

            $('ctrlShapeKind').addEventListener('change', e => {
                const v = e.target.value;
                if (v === 'dashline') { setP(el, 'kind', 'line'); if (P(el, 'dash', 'solid') === 'solid') setP(el, 'dash', 'dashed'); }
                else { setP(el, 'kind', v); if (v === 'line') setP(el, 'dash', 'solid'); }
                $('ctrlShapeDash').value = P(el, 'dash', 'solid');
                syncRows(); scheduleDecorRender(el);
            });
            const bind = (id, key, isCheck) => {
                const n = $(id);
                n.addEventListener(isCheck || n.tagName === 'SELECT' ? 'change' : 'input', () => {
                    setP(el, key, isCheck ? (n.checked ? '1' : '0') : n.value);
                    syncRows(); scheduleDecorRender(el);
                });
            };
            bind('ctrlShapeRadius', 'radius');
            bind('ctrlShapeFillOn', 'fill-on', true);
            bind('ctrlShapeStrokeOn', 'stroke-on', true);
            bind('ctrlShapeStrokeW', 'stroke-w');
            bind('ctrlShapeDash', 'dash');
            bind('ctrlShapeDashLen', 'dash-len');
            bind('ctrlShapeDashGap', 'dash-gap');
            $('ctrlShapeFillA').addEventListener('input', e => {
                setP(el, 'fill-a', e.target.value);
                $('ctrlShapeFillAVal').textContent = e.target.value;
                scheduleDecorRender(el);
            });
            bindRgbPicker('ctrlShapeFill', hex => {
                setP(el, 'fill', hex);
                if (!$('ctrlShapeFillOn').checked) { $('ctrlShapeFillOn').checked = true; setP(el, 'fill-on', '1'); }
                scheduleDecorRender(el);
            });
            bindRgbPicker('ctrlShapeStroke', hex => {
                setP(el, 'stroke', hex);
                if (!$('ctrlShapeStrokeOn').checked) { $('ctrlShapeStrokeOn').checked = true; setP(el, 'stroke-on', '1'); }
                scheduleDecorRender(el);
            });
        }

        function effectPanelHtml(el) {
            const blend = P(el, 'blend', 'normal');
            const op = P(el, 'opacity', '1');
            const opts = [['normal', '기본'], ['screen', '스크린 (검은 배경 제거)'], ['lighten', '밝게'], ['overlay', '오버레이'], ['multiply', '곱하기']]
                .map(([v, n]) => `<option value="${v}" ${blend === v ? 'selected' : ''}>${n}</option>`).join('');
            return `
            <div style="${DECOR_BOX}">
                <label style="${DECOR_TITLE}">효과 이미지 / 영상</label>
                <div class="panel-group"><input type="text" id="ctrlEffectSrc" value="${esc(P(el, 'src'))}" placeholder="images/effect.gif 또는 https://... (gif · apng · webp · mp4 · webm)" style="padding:4px;"></div>
                <div class="panel-group" style="margin-top:8px;">
                    <label>투명도 (<span id="ctrlEffectOpVal">${op}</span>)</label>
                    <input type="range" id="ctrlEffectOp" min="0" max="1" step="0.05" value="${op}" style="accent-color:#c9a86a;">
                </div>
                <div class="panel-group">
                    <label>합성 방식</label>
                    <select id="ctrlEffectBlend" style="padding:4px;">${opts}</select>
                </div>
                <div style="${DECOR_HINT}">크기 조절: 그냥 끌면 자유롭게(이미지도 같이 변형), Shift를 누르고 끌면 원본 비율이 유지됩니다.</div>
            </div>`;
        }
        function bindEffectPanel(el) {
            attachGhPicker('ctrlEffectSrc', 'media', el);
            document.getElementById('ctrlEffectSrc').addEventListener('input', e => { setP(el, 'src', e.target.value.trim()); scheduleDecorRender(el); });
            document.getElementById('ctrlEffectOp').addEventListener('input', e => {
                setP(el, 'opacity', e.target.value);
                document.getElementById('ctrlEffectOpVal').textContent = e.target.value;
                scheduleDecorRender(el);
            });
            document.getElementById('ctrlEffectBlend').addEventListener('change', e => { setP(el, 'blend', e.target.value); scheduleDecorRender(el); });
        }

        if (isAdmin) {
            window.addEventListener('beforeunload', (e) => {
                if (dirty) { e.preventDefault(); e.returnValue = ''; }
            });

            if (editTabA && editTabB) {
                editTabA.addEventListener('click', () => {
                    currentEditingTarget = 'A';
                    editTabA.style.background = '#c9a86a'; editTabA.style.color = '#111';
                    editTabB.style.background = '#1f1f2a'; editTabB.style.color = '#ece5d3';
                    loadModalData();
                });
                editTabB.addEventListener('click', () => {
                    currentEditingTarget = 'B';
                    editTabB.style.background = '#c9a86a'; editTabB.style.color = '#111';
                    editTabA.style.background = '#1f1f2a'; editTabA.style.color = '#ece5d3';
                    loadModalData();
                });
            }

            let isDraggingImg = false;
            let startDragX = 0, startDragY = 0;
            let startOffX = 0, startOffY = 0;
            let imgOffsetX = 0, imgOffsetY = 0;

            function loadModalData() {
                if (!editingImageElement) return;
                const s = getImgState(editingImageElement, currentEditingTarget);
                imgOffsetX = s.x;
                imgOffsetY = s.y;
                modalTargetImg.style.objectFit = 'contain';
                modalTargetImg.style.left = '0';
                modalTargetImg.style.top = '0';
                modalTargetImg.style.transformOrigin = 'center center';
                if (s.src) MZ.setImgSrc(modalTargetImg, normalizeImgUrl(s.src)); else modalTargetImg.removeAttribute('src');
                modalImgScale.value = s.scale;
                updateModalImageTransform(s.scale, imgOffsetX, imgOffsetY);
            }

            function updateModalImageTransform(scale, x, y) {
                modalTargetImg.style.transform = `translate(${x}%, ${y}%) scale(${scale})`;
            }

            if (closeImgModal) closeImgModal.addEventListener('click', () => { imageEditModal.style.display = 'none'; });

            if (modalImgScale) {
                modalImgScale.addEventListener('input', (e) => {
                    const scale = parseFloat(e.target.value);
                    updateModalImageTransform(scale, imgOffsetX, imgOffsetY);
                    const prefix = currentEditingTarget.toLowerCase();
                    editingImageElement.setAttribute(`data-img-scale-${prefix}`, scale);
                    updateImageTransforms(editingImageElement);
                    saveState(editingImageElement);
                });
            }

            if (cropPreviewContainer) {
                cropPreviewContainer.addEventListener('mousedown', (e) => {
                    isDraggingImg = true;
                    startDragX = e.clientX; startDragY = e.clientY;
                    startOffX = imgOffsetX; startOffY = imgOffsetY;
                    cropPreviewContainer.style.cursor = 'grabbing';
                    e.preventDefault();
                });
            }

            window.addEventListener('mousemove', (e) => {
                if (!isDraggingImg) return;
                const frame = document.getElementById('cropInnerBox').getBoundingClientRect();
                const fw = frame.width || 1, fh = frame.height || 1;
                imgOffsetX = Math.round((startOffX + (e.clientX - startDragX) / fw * 100) * 100) / 100;
                imgOffsetY = Math.round((startOffY + (e.clientY - startDragY) / fh * 100) * 100) / 100;

                const scale = parseFloat(modalImgScale.value || '1');
                updateModalImageTransform(scale, imgOffsetX, imgOffsetY);

                const prefix = currentEditingTarget.toLowerCase();
                editingImageElement.setAttribute(`data-img-posx-${prefix}`, imgOffsetX);
                editingImageElement.setAttribute(`data-img-posy-${prefix}`, imgOffsetY);
                updateImageTransforms(editingImageElement);
                saveState(editingImageElement);
            });

            window.addEventListener('mouseup', () => {
                if (isDraggingImg) {
                    isDraggingImg = false;
                    cropPreviewContainer.style.cursor = 'grab';
                }
            });

            if (applyImgModal) applyImgModal.addEventListener('click', () => { imageEditModal.style.display = 'none'; });

            // [수정 포인트 1] 페이지 스케일(확대/축소) 비율 정밀 계산
            function getScale() {
                const rect = gallery.getBoundingClientRect();
                const unscaledWidth = gallery.offsetWidth || 1;
                return rect.width / unscaledWidth || 1;
            }

            function toLocalPoint(el, cx, cy) {
                const r = el.getBoundingClientRect();
                const s = getScale();
                const dx = (cx - (r.left + r.width / 2)) / s;
                const dy = (cy - (r.top + r.height / 2)) / s;
                const a = -(parseFloat(el.getAttribute('data-rotate')) || 0) * Math.PI / 180;
                return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
            }

            function rotatedTopLeft(l, t, w, h, a) {
                const cx = l + w / 2, cy = t + h / 2;
                const vx = -w / 2, vy = -h / 2;
                return { x: cx + vx * Math.cos(a) - vy * Math.sin(a), y: cy + vx * Math.sin(a) + vy * Math.cos(a) };
            }

            function showGuide(line, axis, pos) {
                if (!line) return;
                // 메인 페이지와 동일하게 갤러리 컨테이너 내부의 정확한 중심좌표(중앙선 기준)를 반영하도록 수정
                if (axis === 'v') {
                    const centerX = gallery.offsetWidth / 2;
                    line.style.left = centerX + 'px';
                } else {
                    const centerY = gallery.offsetHeight / 2;
                    line.style.top = centerY + 'px';
                }
                line.style.display = 'block';
            }
            function hideGuides() {
                [lineV, lineH, elemLineV, elemLineH].forEach(l => { if (l) l.style.display = 'none'; });
            }

            gallery.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                const el = e.target.closest('.editable-element');
                const scale = getScale();

                if (!el) {
                    if (!e.shiftKey) clearSelection();
                    const win = gallery.offsetParent || gallery;
                    const winRect = win.getBoundingClientRect();
                    const toWin = (cx, cy) => ({
                        x: (cx - winRect.left) / scale - (win.clientLeft || 0),
                        y: (cy - winRect.top) / scale - (win.clientTop || 0)
                    });
                    const s0 = toWin(e.clientX, e.clientY);

                    if (selectionMarquee) {
                        selectionMarquee.style.left = s0.x + 'px';
                        selectionMarquee.style.top = s0.y + 'px';
                        selectionMarquee.style.width = '0px';
                        selectionMarquee.style.height = '0px';
                        selectionMarquee.style.display = 'block';
                    }

                    function onMarqueeMove(ev) {
                        const c = toWin(ev.clientX, ev.clientY);
                        if (selectionMarquee) {
                            selectionMarquee.style.left = Math.min(s0.x, c.x) + 'px';
                            selectionMarquee.style.top = Math.min(s0.y, c.y) + 'px';
                            selectionMarquee.style.width = Math.abs(c.x - s0.x) + 'px';
                            selectionMarquee.style.height = Math.abs(c.y - s0.y) + 'px';
                        }
                    }

                    function onMarqueeUp() {
                        window.removeEventListener('mousemove', onMarqueeMove);
                        window.removeEventListener('mouseup', onMarqueeUp);
                        if (selectionMarquee) {
                            const mRect = selectionMarquee.getBoundingClientRect();
                            selectionMarquee.style.display = 'none';
                            gallery.querySelectorAll('.editable-element').forEach(elem => {
                                const eRect = elem.getBoundingClientRect();
                                if (!(eRect.right < mRect.left || eRect.left > mRect.right || eRect.bottom < mRect.top || eRect.top > mRect.bottom)) {
                                    addToSelection(elem);
                                }
                            });
                        }
                    }

                    window.addEventListener('mousemove', onMarqueeMove);
                    window.addEventListener('mouseup', onMarqueeUp);
                    return;
                }

                if (!selectedElements.has(el)) {
                    if (!e.shiftKey) clearSelection();
                    selectElement(el);
                }

                const p0 = toLocalPoint(el, e.clientX, e.clientY);
                const isResizing = (p0.x >= el.offsetWidth / 2 - 25 && p0.y >= el.offsetHeight / 2 - 25);

                const startX = e.clientX;
                const startY = e.clientY;
                const angle = (parseFloat(el.getAttribute('data-rotate')) || 0) * Math.PI / 180;
                
                const initialPositions = new Map();
                selectedElements.forEach(item => {
                    initialPositions.set(item, { left: item.offsetLeft, top: item.offsetTop });
                });

                const startLeft = el.offsetLeft;
                const startTop = el.offsetTop;
                const startWidth = el.offsetWidth;
                const startHeight = el.offsetHeight;
                const type = el.getAttribute('data-type');

                // [수정 포인트 2] 이동 드래그 판단: 텍스트 모드에서도 드래그 시 이동이 가능하도록 개선
                let isDragging = false;

                function onMouseMove(e) {
                    const dx = (e.clientX - startX) / scale;
                    const dy = (e.clientY - startY) / scale;

                    if (!isDragging && Math.hypot(e.clientX - startX, e.clientY - startY) > 3) {
                        isDragging = true;
                    }

                    if (!isDragging) return;

                    if (isResizing) {
                        const ca = Math.cos(-angle), sa = Math.sin(-angle);
                        const ldx = dx * ca - dy * sa;
                        const ldy = dx * sa + dy * ca;
                        const minW = (type === 'calendar') ? 280 : (isDecor(type) ? 8 : 45);
                        const minH = (type === 'calendar') ? 250 : (isDecor(type) ? 8 : 30);
                        let w = startWidth + ldx;
                        let h = startHeight + ldy;
                        if (e.shiftKey) {
                            // Shift: 비율 고정 (스티커·효과는 원본 이미지 비율, 그 외는 끌기 시작할 때의 비율)
                            const ratio = parseFloat(el.getAttribute('data-p-aspect')) || (startWidth / startHeight) || 1;
                            if (Math.abs(ldx / startWidth) >= Math.abs(ldy / startHeight)) h = w / ratio; else w = h * ratio;
                            if (w < minW) { w = minW; h = w / ratio; }
                            if (h < minH) { h = minH; w = h * ratio; }
                        } else {
                            w = Math.max(minW, w);
                            h = Math.max(minH, h);
                        }

                        const tl0 = rotatedTopLeft(startLeft, startTop, startWidth, startHeight, angle);
                        const tl1 = rotatedTopLeft(startLeft, startTop, w, h, angle);
                        el.style.width = w + 'px';
                        el.style.height = h + 'px';
                        el.style.left = (startLeft + tl0.x - tl1.x) + 'px';
                        el.style.top = (startTop + tl0.y - tl1.y) + 'px';
                        updatePanelInputs();
                        return;
                    }

                    let currentX = startLeft + dx;
                    let currentY = startTop + dy;

                    if (snapToggle && snapToggle.checked) {
                        const gw = gallery.offsetWidth, gh = gallery.offsetHeight;
                        const w = el.offsetWidth, h = el.offsetHeight;

                        if (Math.abs(currentX + w / 2 - gw / 2) < 8) {
                            currentX = gw / 2 - w / 2;
                            showGuide(lineV, 'v', gw / 2);
                        } else if (lineV) lineV.style.display = 'none';

                        if (Math.abs(currentY + h / 2 - gh / 2) < 8) {
                            currentY = gh / 2 - h / 2;
                            showGuide(lineH, 'h', gh / 2);
                        } else if (lineH) lineH.style.display = 'none';

                        let snappedX = false, snappedY = false;
                        gallery.querySelectorAll('.editable-element').forEach(other => {
                            if (selectedElements.has(other)) return;
                            const oLeft = other.offsetLeft, oTop = other.offsetTop;
                            const oWidth = other.offsetWidth, oHeight = other.offsetHeight;
                            const oCenterX = oLeft + oWidth / 2, oCenterY = oTop + oHeight / 2;
                            const cX = currentX + w / 2, cY = currentY + h / 2;

                            if (Math.abs(cX - oCenterX) < 6) {
                                currentX = oCenterX - w / 2; showGuide(elemLineV, 'v', oCenterX); snappedX = true;
                            } else if (Math.abs(currentX - oLeft) < 6) {
                                currentX = oLeft; showGuide(elemLineV, 'v', oLeft); snappedX = true;
                            } else if (Math.abs((currentX + w) - (oLeft + oWidth)) < 6) {
                                currentX = (oLeft + oWidth) - w; showGuide(elemLineV, 'v', oLeft + oWidth); snappedX = true;
                            }

                            if (Math.abs(cY - oCenterY) < 6) {
                                currentY = oCenterY - h / 2; showGuide(elemLineH, 'h', oCenterY); snappedY = true;
                            } else if (Math.abs(currentY - oTop) < 6) {
                                currentY = oTop; showGuide(elemLineH, 'h', oTop); snappedY = true;
                            } else if (Math.abs((currentY + h) - (oTop + oHeight)) < 6) {
                                currentY = (oTop + oHeight) - h; showGuide(elemLineH, 'h', oTop + oHeight); snappedY = true;
                            }
                        });

                        if (!snappedX && elemLineV) elemLineV.style.display = 'none';
                        if (!snappedY && elemLineH) elemLineH.style.display = 'none';
                    } else {
                        hideGuides();
                    }

                    selectedElements.forEach(item => {
                        const init = initialPositions.get(item);
                        item.style.left = (init.left + (currentX - startLeft)) + 'px';
                        item.style.top = (init.top + (currentY - startTop)) + 'px';
                    });
                }

                function onMouseUp() {
                    window.removeEventListener('mousemove', onMouseMove);
                    window.removeEventListener('mouseup', onMouseUp);
                    hideGuides();
                    if (isDragging) {
                        selectedElements.forEach(item => saveState(item));
                    }
                }

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
                e.stopPropagation();
            });

            // [수정 포인트 2 추가] 더블 클릭 시 글 수정 편집 모드 진입
            gallery.addEventListener('dblclick', function(e) {
                const el = e.target.closest('.editable-element');
                if (!el) return;
                const t = el.getAttribute('data-type');
                if (t === 'text') {
                    el._editing = true;
                    el.focus();
                } else if (t === 'image' && imageEditModal) {
                    editingImageElement = el;
                    currentEditingTarget = el.getAttribute('data-main-img') || 'A';
                    if (editTabA && editTabB) {
                        const a = currentEditingTarget === 'A';
                        editTabA.style.background = a ? '#c9a86a' : '#1f1f2a'; editTabA.style.color = a ? '#111' : '#ece5d3';
                        editTabB.style.background = a ? '#1f1f2a' : '#c9a86a'; editTabB.style.color = a ? '#ece5d3' : '#111';
                    }
                    loadModalData();
                    imageEditModal.style.display = 'flex';
                }
            });

            const addShapeBtn = document.getElementById('addShapeBtn');
            const addEffectBtn = document.getElementById('addEffectBtn');

            if (addTextBtn) addTextBtn.addEventListener('click', function () {
                createBlock({ id: 'text_' + Date.now(), type: 'text', left: '150px', top: '150px', width: '200px', height: '80px', content: 'TEXT', textAlign: 'left' });
            });
            if (addCalendarBtn) addCalendarBtn.addEventListener('click', function () {
                createBlock({ id: 'calendar_' + Date.now(), type: 'calendar', left: '120px', top: '120px', width: '300px', height: '340px' });
            });
            if (addImageBtn) addImageBtn.addEventListener('click', function () {
                createBlock({ id: 'image_' + Date.now(), type: 'image', left: '150px', top: '150px', width: '220px', height: '250px' });
            });
            if (addStickerBtn) addStickerBtn.addEventListener('click', function () {
                createBlock({ id: 'sticker_' + Date.now(), type: 'sticker', left: '150px', top: '150px', width: '120px', height: '120px',
                    props: { src: '', 'line-on': '0', line: '#000000', 'fill-on': '0', fill: '#ffc83c', thr: '128' } });
            });
            if (addShapeBtn) addShapeBtn.addEventListener('click', function () {
                createBlock({ id: 'shape_' + Date.now(), type: 'shape', left: '150px', top: '150px', width: '160px', height: '100px',
                    props: { kind: 'rect', 'fill-on': '1', fill: '#c9a86a', 'fill-a': '0.25', 'stroke-on': '1', stroke: '#c9a86a', 'stroke-w': '3',
                             dash: 'solid', 'dash-len': '10', 'dash-gap': '8', radius: '16' } });
            });
            if (addEffectBtn) addEffectBtn.addEventListener('click', function () {
                createBlock({ id: 'effect_' + Date.now(), type: 'effect', left: '150px', top: '150px', width: '200px', height: '200px',
                    props: { src: '', opacity: '1', blend: 'normal' } });
            });

            if (saveBtn) saveBtn.addEventListener('click', saveAll);

            if (resetBtn) resetBtn.addEventListener('click', async function () {
                if (!confirm('현재 페이지 및 모드의 모든 레이아웃 설정을 초기화(DB 삭제)하시겠습니까?')) return;
                if (sb) {
                    const { error } = await sb.from(TABLE).delete().eq('page_name', PAGE);
                    if (error) { alert('초기화 실패: ' + error.message); return; }
                }
                dirty = false;
                location.reload();
            });
        }

        gallery.addEventListener('click', function (e) {
            if (!isAdmin) {
                const el = e.target.closest('.editable-element');
                if (el) {
                    const linkUrl = el.getAttribute('data-link-url');
                    if (linkUrl) { window.location.href = linkUrl; return; }
                }
            }

            if (e.target.classList.contains('cal-prev') || e.target.classList.contains('cal-next')) {
                const el = e.target.closest('.editable-element');
                if (!el) return;
                let year = parseInt(el.getAttribute('data-cal-year') || '2026');
                let month = parseInt(el.getAttribute('data-cal-month') || '10');
                if (e.target.classList.contains('cal-prev')) {
                    month--; if (month < 1) { month = 12; year--; }
                } else {
                    month++; if (month > 12) { month = 1; year++; }
                }
                el.setAttribute('data-cal-year', year);
                el.setAttribute('data-cal-month', month);
                el.innerHTML = getCalendarHtml(
                    year, month, 
                    el.getAttribute('data-sch-date') || '', 
                    el.getAttribute('data-sch-text') || '',
                    el.getAttribute('data-sch-date-2') || '', 
                    el.getAttribute('data-sch-text-2') || ''
                );
                if (isAdmin) saveState(el);
            }
        });

        function selectElement(el) {
            if (!isAdmin) return;
            clearSelection();
            addToSelection(el);
        }

        function addToSelection(el) {
            selectedElements.add(el);
            el.classList.add('active-target');
            if (selectedElements.size > 1) el.classList.add('multi-selected');
            activeElement = el;
            updatePanelForActiveElement(el);
        }

        function clearSelection() {
            selectedElements.forEach(el => el.classList.remove('active-target', 'multi-selected'));
            selectedElements.clear();
            activeElement = null;
        }

        function updatePanelInputs() {
            if (!activeElement) return;
            const pw = document.getElementById('ctrlWidth');
            const ph = document.getElementById('ctrlHeight');
            if (pw) pw.value = activeElement.style.width;
            if (ph) ph.value = activeElement.style.height;
        }

        function updatePanelForActiveElement(el) {
            if (!panelContent) return;
            const id = el.getAttribute('data-id');
            const type = el.getAttribute('data-type');
            const decor = isDecor(type);
            const currentWidth = el.style.width || el.offsetWidth + 'px';
            const currentHeight = el.style.height || el.offsetHeight + 'px';

            let currentRot = 0;
            const rawRotate = el.getAttribute('data-rotate');
            if (rawRotate !== null && rawRotate !== '') currentRot = parseInt(rawRotate) || 0;

            const borderStyle = el.style.borderStyle || 'solid';
            const borderWidth = parseInt(el.style.borderWidth) || 1;
            const borderColor = toHexColor(el.style.borderColor, '#c9a86a');
            const hasBorder = (el.style.borderStyle !== 'none' && el.style.borderStyle !== '' && borderWidth > 0);

            const currentBgColor = el.style.backgroundColor || 'transparent';
            const parsedBg = parseRgbaColor(currentBgColor);
            const hasBg = (currentBgColor !== 'transparent' && currentBgColor !== '');

            const borderRadius = parseInt(el.style.borderRadius) || 0;
            const fontFamily = el.style.fontFamily || 'Pretendard';
            const fontColor = toHexColor(el.style.color, '#ece5d3');
            const linkUrl = el.getAttribute('data-link-url') || '';
            const animIntensity = el.getAttribute('data-anim-intensity') || '2';

            const fontSize = el.style.fontSize || '16px';
            const fontWeight = el.style.fontWeight || 'normal';
            const fontStyle = el.style.fontStyle || 'normal';
            const textDecoration = el.style.textDecoration || 'none';
            const textAlign = el.style.textAlign || 'left';

            let currentShape = 'shape-rect';
            for (let cls of el.classList) {
                if (cls.startsWith('shape-')) { currentShape = cls; break; }
            }

            let extraSettingsHtml = '';
            if (type === 'text') {
                extraSettingsHtml = `
                <div style="border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;">
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:6px;">글자 서식 및 정렬</label>
                    <div style="display:flex; gap:6px; margin-bottom:6px;">
                        <div style="flex:1;">
                            <label style="font-size:0.75em;">글자 크기 (px)</label>
                            <input type="number" id="ctrlFontSize" value="${parseInt(fontSize)}" min="8" max="120" style="padding:4px;">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:0.75em;">굵기</label>
                            <select id="ctrlFontWeight" style="padding:4px;">
                                <option value="normal" ${fontWeight === 'normal' ? 'selected' : ''}>일반</option>
                                <option value="bold" ${fontWeight === 'bold' ? 'selected' : ''}>굵게</option>
                                <option value="300" ${fontWeight === '300' ? 'selected' : ''}>가늘게</option>
                            </select>
                        </div>
                    </div>
                    <div class="panel-group" style="margin-bottom:6px;">
                        <label style="font-size:0.75em;">가로 정렬</label>
                        <select id="ctrlTextAlign" style="width:100%; padding:4px; background:#111; color:#ece5d3; border:1px solid #444;">
                            <option value="left" ${textAlign === 'left' ? 'selected' : ''}>왼쪽 정렬</option>
                            <option value="center" ${textAlign === 'center' ? 'selected' : ''}>가운데 정렬</option>
                            <option value="right" ${textAlign === 'right' ? 'selected' : ''}>오른쪽 정렬</option>
                        </select>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; margin-top:4px; font-size:0.85em;">
                        <label style="margin:0; cursor:pointer;"><input type="checkbox" id="ctrlFontItalic" ${fontStyle === 'italic' ? 'checked' : ''} style="accent-color:#c9a86a;"> 기울임 (Italic)</label>
                        <label style="margin:0; cursor:pointer;"><input type="checkbox" id="ctrlFontUnderline" ${textDecoration.includes('underline') ? 'checked' : ''} style="accent-color:#c9a86a;"> 밑줄</label>
                    </div>
                </div>`;
            } else if (type === 'calendar') {
                const schDate1 = el.getAttribute('data-sch-date') || '';
                const schText1 = el.getAttribute('data-sch-text') || '';
                const schDate2 = el.getAttribute('data-sch-date-2') || '';
                const schText2 = el.getAttribute('data-sch-text-2') || '';

                extraSettingsHtml = `
                <div style="border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;">
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px; font-size:0.9em;">일정 1</label>
                    <div style="display:flex; gap:4px; margin-bottom:6px; align-items:center;">
                        <input type="date" id="schDate1" value="${esc(schDate1)}" style="flex:1.2; padding:4px;">
                        <input type="text" id="schText1" value="${esc(schText1)}" placeholder="내용" style="flex:1; padding:4px;">
                        <button type="button" id="delSchBtn1" style="background:#ff4757; border:none; color:#fff; width:28px; height:28px; border-radius:3px; cursor:pointer; font-weight:bold;">✕</button>
                    </div>
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px; font-size:0.9em;">일정 2</label>
                    <div style="display:flex; gap:4px; margin-bottom:6px; align-items:center;">
                        <input type="date" id="schDate2" value="${esc(schDate2)}" style="flex:1.2; padding:4px;">
                        <input type="text" id="schText2" value="${esc(schText2)}" placeholder="내용" style="flex:1; padding:4px;">
                        <button type="button" id="delSchBtn2" style="background:#ff4757; border:none; color:#fff; width:28px; height:28px; border-radius:3px; cursor:pointer; font-weight:bold;">✕</button>
                    </div>
                </div>`;
            } else if (type === 'image') {
                const valA = el.getAttribute('data-val-a') || '';
                const valB = el.getAttribute('data-val-b') || '';
                const mainImgType = el.getAttribute('data-main-img') || 'A';
                const sideHtml = (S, val) => `
                    <div style="background:rgba(255,255,255,0.03); padding:6px; border-radius:4px; margin-bottom:6px;">
                        <div style="margin-bottom:4px;">
                            <label style="font-size:0.8em; color:#ece5d3; margin:0;"><input type="radio" name="mainImgRadio" value="${S}" ${mainImgType === S ? 'checked' : ''} style="accent-color:#c9a86a;"> 이미지 ${S} (메인)</label>
                        </div>
                        <input type="text" id="val${S}Input" value="${esc(val)}" placeholder="images/파일명.png" style="width:100%; padding:3px; font-size:0.85em;">
                    </div>`;
                extraSettingsHtml = `
                <div style="border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;">
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:6px;">이미지 설정 (더블클릭시 구도편집)</label>
                    ${sideHtml('A', valA)}
                    ${sideHtml('B', valB)}
                </div>`;
            }

            if (type === 'sticker') extraSettingsHtml = stickerPanelHtml(el);
            else if (type === 'shape') extraSettingsHtml = shapePanelHtml(el);
            else if (type === 'effect') extraSettingsHtml = effectPanelHtml(el);

            let shapeSelectorHtml = '';
            if (type === 'text' || type === 'image') {
                shapeSelectorHtml = `
                <div class="panel-group" style="margin-top:6px;">
                    <label>블록 모양 (자르기)</label>
                    <select id="ctrlShapeType" style="width:100%; padding:4px;">
                        <option value="shape-rect" ${currentShape === 'shape-rect' ? 'selected' : ''}>직사각형</option>
                        <option value="shape-oval" ${currentShape === 'shape-oval' ? 'selected' : ''}>원형 / 타원</option>
                        <option value="shape-triangle" ${currentShape === 'shape-triangle' ? 'selected' : ''}>삼각형</option>
                        <option value="shape-rt-triangle" ${currentShape === 'shape-rt-triangle' ? 'selected' : ''}>직각삼각형</option>
                        <option value="shape-parallelogram" ${currentShape === 'shape-parallelogram' ? 'selected' : ''}>평행사변형</option>
                        <option value="shape-trapezoid" ${currentShape === 'shape-trapezoid' ? 'selected' : ''}>사다리꼴</option>
                        <option value="shape-diamond" ${currentShape === 'shape-diamond' ? 'selected' : ''}>마름모</option>
                        <option value="shape-pentagon" ${currentShape === 'shape-pentagon' ? 'selected' : ''}>오각형</option>
                        <option value="shape-hexagon" ${currentShape === 'shape-hexagon' ? 'selected' : ''}>육각형</option>
                    </select>
                </div>`;
            }

            const fonts = ['Pretendard', 'Playfair Display', 'Courier Prime', 'Bebas Neue', 'Zen Antique', 'Noto Serif SC', 'Nanum Myeongjo', 'Noto Serif KR', 'Cinzel', 'Montserrat', 'Gowun Batang', 'Black Han Sans'];
            const fontOptions = fonts.map(f => `<option value="${f}" ${fontFamily.includes(f) ? 'selected' : ''}>${f}</option>`).join('');

            panelContent.innerHTML = `
            <div style="font-weight: bold; color: #c9a86a; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">선택: ${esc(id)}</span>
                <div style="display:flex; gap:4px;">
                    <button type="button" id="duplicateBlockBtn" style="background:#706fd3; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.75em;">복제</button>
                    <button type="button" id="deleteBlockBtn" style="background:#ff4757; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.75em;">삭제</button>
                </div>
            </div>
            <div class="panel-group">
                <label>겹침 순서 (같은 종류 안에서)</label>
                <div style="display:flex; gap:4px;">
                    <button type="button" id="layerBackBtn" title="같은 종류 중 맨 뒤로" style="flex:1; background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; font-size:0.75em; padding:4px 2px; border-radius:3px; cursor:pointer;">맨 뒤</button>
                    <button type="button" id="layerDownBtn" title="겹친 블록 하나 뒤로" style="flex:1; background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; font-size:0.75em; padding:4px 2px; border-radius:3px; cursor:pointer;">뒤로</button>
                    <button type="button" id="layerUpBtn" title="겹친 블록 하나 앞으로" style="flex:1; background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; font-size:0.75em; padding:4px 2px; border-radius:3px; cursor:pointer;">앞으로</button>
                    <button type="button" id="layerFrontBtn" title="같은 종류 중 맨 앞으로" style="flex:1; background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; font-size:0.75em; padding:4px 2px; border-radius:3px; cursor:pointer;">맨 앞</button>
                </div>
            </div>
            <div class="panel-group"><label>가로 크기</label><input type="text" id="ctrlWidth" value="${esc(currentWidth)}"></div>
            <div class="panel-group"><label>세로 크기</label><input type="text" id="ctrlHeight" value="${esc(currentHeight)}"></div>

            <div class="panel-group">
                <label>회전 각도 (°)</label>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="range" id="ctrlRotateRange" min="-180" max="180" value="${currentRot}" style="accent-color:#c9a86a; flex:1;">
                    <input type="number" id="ctrlRotateNum" value="${currentRot}" min="-180" max="180" style="width:65px; padding:3px; text-align:center;">
                </div>
            </div>

            ${shapeSelectorHtml}

            <div class="panel-group" style="margin-top:6px;">
                <label>클릭 이동 링크 (URL)</label>
                <input type="text" id="ctrlLinkUrl" value="${esc(linkUrl)}" placeholder="https://..." style="padding:4px;">
            </div>

            <div class="panel-group" style="margin-top:6px;">
                <label>애니메이션 강도</label>
                <select id="ctrlAnimIntensity" style="width:100%; padding:4px;">
                    <option value="0" ${animIntensity === '0' ? 'selected' : ''}>없음 (0)</option>
                    <option value="1" ${animIntensity === '1' ? 'selected' : ''}>약함 (1)</option>
                    <option value="2" ${animIntensity === '2' ? 'selected' : ''}>보통 (2)</option>
                    <option value="3" ${animIntensity === '3' ? 'selected' : ''}>강함 (3)</option>
                </select>
            </div>

            ${decor ? '' : `
            <div style="border-top:1px dashed rgba(201,168,106,0.3); margin-top:10px; padding-top:10px;">
                <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px;">외곽선 설정</label>
                <div style="display:flex; gap:6px; margin-bottom:4px; align-items:center;">
                    <label style="font-size:0.8em; margin:0;"><input type="checkbox" id="ctrlHasBorder" ${hasBorder ? 'checked' : ''}> 외곽선 사용</label>
                    <select id="ctrlBorderType" style="flex:1; padding:3px;">
                        <option value="solid" ${borderStyle === 'solid' ? 'selected' : ''}>실선</option>
                        <option value="dashed" ${borderStyle === 'dashed' ? 'selected' : ''}>점선</option>
                        <option value="dotted" ${borderStyle === 'dotted' ? 'selected' : ''}>도트</option>
                        <option value="double" ${borderStyle === 'double' ? 'selected' : ''}>이중선</option>
                    </select>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <input type="number" id="ctrlBorderWidth" value="${borderWidth}" min="1" max="20" style="width:60px; padding:3px;" placeholder="두께">
                    <input type="color" id="ctrlBorderColor" value="${borderColor}" style="flex:1; height:26px; background:#111; border:1px solid #444; cursor:pointer;">
                </div>
            </div>

            <div style="border-top:1px dashed rgba(201,168,106,0.3); margin-top:10px; padding-top:10px;">
                <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px;">배경 및 모서리 설정</label>
                <div style="display:flex; gap:6px; margin-bottom:6px; align-items:center;">
                    <label style="font-size:0.8em; margin:0;"><input type="checkbox" id="ctrlHasBg" ${hasBg ? 'checked' : ''}> 배경색</label>
                    <input type="color" id="ctrlBgColor" value="${parsedBg.hex}" style="flex:1; height:26px; background:#111; border:1px solid #444; cursor:pointer;">
                </div>
                <div class="panel-group" style="margin-bottom:6px;">
                    <label>배경 투명도 (0 ~ 1)</label>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <input type="range" id="ctrlBgAlphaRange" min="0" max="1" step="0.05" value="${parsedBg.alpha}" style="accent-color:#c9a86a; flex:1;">
                        <input type="number" id="ctrlBgAlphaNum" min="0" max="1" step="0.05" value="${parsedBg.alpha}" style="width:65px; padding:3px; text-align:center;">
                    </div>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <label style="font-size:0.8em; margin:0; flex:1;">모서리 둥글기 (px)</label>
                    <input type="number" id="ctrlBorderRadius" value="${borderRadius}" min="0" max="500" style="width:80px; padding:4px;">
                </div>
            </div>

            <div style="border-top:1px dashed rgba(201,168,106,0.3); margin-top:10px; padding-top:10px;">
                <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px;">폰트 및 글자 색상</label>
                <div style="margin-bottom:6px;"><select id="ctrlFontFamily" style="width:100%; padding:4px;">${fontOptions}</select></div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <label style="font-size:0.8em; margin:0; flex:1;">글자 색상</label>
                    <input type="color" id="ctrlFontColor" value="${fontColor}" style="width:100px; height:26px; background:#111; border:1px solid #444; cursor:pointer;">
                </div>
            </div>

            `}
            ${extraSettingsHtml}
        `;

            document.getElementById('ctrlWidth').addEventListener('input', e => { el.style.width = e.target.value; saveState(el); });
            document.getElementById('ctrlHeight').addEventListener('input', e => { el.style.height = e.target.value; saveState(el); });

            const rotRange = document.getElementById('ctrlRotateRange');
            const rotNum = document.getElementById('ctrlRotateNum');
            function applyRotation(deg) {
                el.setAttribute('data-rotate', deg);
                el.style.transform = `rotate(${deg}deg)`;
                saveState(el);
            }
            rotRange.addEventListener('input', e => { rotNum.value = e.target.value; applyRotation(e.target.value); });
            rotNum.addEventListener('input', e => {
                const val = parseInt(e.target.value) || 0;
                rotRange.value = val;
                applyRotation(val);
            });

            const shapeSelect = document.getElementById('ctrlShapeType');
            if (shapeSelect) {
                shapeSelect.addEventListener('change', e => {
                    el.classList.remove('shape-rect', 'shape-oval', 'shape-triangle', 'shape-rt-triangle', 'shape-parallelogram', 'shape-trapezoid', 'shape-diamond', 'shape-pentagon', 'shape-hexagon');
                    el.classList.add(e.target.value);
                    el.setAttribute('data-shape', e.target.value);
                    saveState(el);
                });
            }

            if (type === 'text') {
                const sizeInput = document.getElementById('ctrlFontSize');
                const weightSelect = document.getElementById('ctrlFontWeight');
                const alignSelect = document.getElementById('ctrlTextAlign');
                const italicCheck = document.getElementById('ctrlFontItalic');
                const underlineCheck = document.getElementById('ctrlFontUnderline');

                function updateTextStyle() {
                    el.style.fontSize = sizeInput.value + 'px';
                    el.style.fontWeight = weightSelect.value;
                    el.style.fontStyle = italicCheck.checked ? 'italic' : 'normal';
                    el.style.textDecoration = underlineCheck.checked ? 'underline' : 'none';
                    if (alignSelect) {
                        el.style.textAlign = alignSelect.value;
                        if (alignSelect.value === 'left') el.style.justifyContent = 'flex-start';
                        else if (alignSelect.value === 'center') el.style.justifyContent = 'center';
                        else if (alignSelect.value === 'right') el.style.justifyContent = 'flex-end';
                    }
                    saveState(el);
                }
                sizeInput.addEventListener('input', updateTextStyle);
                weightSelect.addEventListener('change', updateTextStyle);
                if (alignSelect) alignSelect.addEventListener('change', updateTextStyle);
                italicCheck.addEventListener('change', updateTextStyle);
                underlineCheck.addEventListener('change', updateTextStyle);
            }

            if (type === 'image') {
                document.querySelectorAll('input[name="mainImgRadio"]').forEach(radio => {
                    radio.addEventListener('change', e => {
                        el.setAttribute('data-main-img', e.target.value);
                        renderImageBlock(el);
                        saveState(el);
                    });
                });
                bindImgSide(el, 'A');
                bindImgSide(el, 'B');
            }

            document.getElementById('ctrlLinkUrl').addEventListener('input', e => {
                el.setAttribute('data-link-url', e.target.value);
                saveState(el);
            });

            document.getElementById('duplicateBlockBtn').addEventListener('click', function () {
                const copy = serializeData(el);
                if (!copy) return;
                copy.id = type + '_' + Date.now();
                copy.left = (el.offsetLeft + 20) + 'px';
                copy.top = (el.offsetTop + 20) + 'px';
                delete copy.zOrder;   // 복제본은 같은 종류의 맨 앞에 놓임
                createBlock(copy);
            });

            [['layerBackBtn', 'back'], ['layerDownBtn', 'down'], ['layerUpBtn', 'up'], ['layerFrontBtn', 'front']].forEach(function (p) {
                const b = document.getElementById(p[0]);
                if (b) b.addEventListener('click', function () { moveLayer(p[1]); });
            });

            document.getElementById('ctrlAnimIntensity').addEventListener('change', e => {
                el.setAttribute('data-anim-intensity', e.target.value);
                saveState(el);
            });

            if (!decor) {
            const bgAlphaRange = document.getElementById('ctrlBgAlphaRange');
            const bgAlphaNum = document.getElementById('ctrlBgAlphaNum');

            function updateElementStyle() {
                const hasB = document.getElementById('ctrlHasBorder').checked;
                const bType = document.getElementById('ctrlBorderType').value;
                const bWidth = document.getElementById('ctrlBorderWidth').value;
                const bColor = document.getElementById('ctrlBorderColor').value;
                el.style.border = hasB ? `${bWidth}px ${bType} ${bColor}` : 'none';

                if (document.getElementById('ctrlHasBg').checked) {
                    const alphaVal = parseFloat(bgAlphaRange.value);
                    el.style.backgroundColor = hexToRgba(document.getElementById('ctrlBgColor').value, isNaN(alphaVal) ? 1 : alphaVal);
                } else {
                    el.style.backgroundColor = 'transparent';
                }

                el.style.borderRadius = document.getElementById('ctrlBorderRadius').value + 'px';
                el.style.fontFamily = document.getElementById('ctrlFontFamily').value + ", 'Nanum Myeongjo', 'Noto Serif KR', serif";
                el.style.color = document.getElementById('ctrlFontColor').value;
                saveState(el);
            }

            bgAlphaRange.addEventListener('input', e => { bgAlphaNum.value = e.target.value; updateElementStyle(); });
            bgAlphaNum.addEventListener('input', e => {
                let val = parseFloat(e.target.value);
                if (isNaN(val)) val = 1;
                val = Math.max(0, Math.min(1, val));
                bgAlphaRange.value = val;
                updateElementStyle();
            });

            ['ctrlHasBorder', 'ctrlBorderType', 'ctrlHasBg', 'ctrlFontFamily'].forEach(i => document.getElementById(i).addEventListener('change', updateElementStyle));
            ['ctrlBorderWidth', 'ctrlBorderColor', 'ctrlBgColor', 'ctrlBorderRadius', 'ctrlFontColor'].forEach(i => document.getElementById(i).addEventListener('input', updateElementStyle));
            }

            if (type === 'sticker') bindStickerPanel(el);
            else if (type === 'shape') bindShapePanel(el);
            else if (type === 'effect') bindEffectPanel(el);

            document.getElementById('deleteBlockBtn').addEventListener('click', function () {
                if (confirm('이 블록을 삭제하시겠습니까?')) deleteSelected();
            });

            if (type === 'calendar') {
                const updateCalContent = () => {
                    const d1 = document.getElementById('schDate1').value;
                    const t1 = document.getElementById('schText1').value;
                    const d2 = document.getElementById('schDate2').value;
                    const t2 = document.getElementById('schText2').value;

                    el.setAttribute('data-sch-date', d1);
                    el.setAttribute('data-sch-text', t1);
                    el.setAttribute('data-sch-date-2', d2);
                    el.setAttribute('data-sch-text-2', t2);

                    el.innerHTML = getCalendarHtml(
                        parseInt(el.getAttribute('data-cal-year') || '2026'), 
                        parseInt(el.getAttribute('data-cal-month') || '10'), 
                        d1, t1, d2, t2
                    );
                    saveState(el);
                };

                document.getElementById('schDate1').addEventListener('input', updateCalContent);
                document.getElementById('schText1').addEventListener('input', updateCalContent);
                document.getElementById('schDate2').addEventListener('input', updateCalContent);
                document.getElementById('schText2').addEventListener('input', updateCalContent);

                document.getElementById('delSchBtn1').addEventListener('click', function () {
                    document.getElementById('schDate1').value = '';
                    document.getElementById('schText1').value = '';
                    updateCalContent();
                    selectElement(el);
                });
                document.getElementById('delSchBtn2').addEventListener('click', function () {
                    document.getElementById('schDate2').value = '';
                    document.getElementById('schText2').value = '';
                    updateCalContent();
                    selectElement(el);
                });
            }
        }

        // =================================================================
        //  겹침 순서 (같은 종류 안에서만 바뀜: 종류 사이의 층은 CSS 의 --layer 가 정함)
        //  - 순서 값은 data-order 속성 / CSS 변수 --ord 에 두고, 저장할 때 layout_data.zOrder 로 함께 저장
        // =================================================================
        const layerKeyOf = t => (!t || t === 'default') ? 'text' : t;
        const layerKey = el => layerKeyOf(el.getAttribute('data-type'));
        const getOrder = el => { const n = parseInt(el.getAttribute('data-order')); return isNaN(n) ? -1 : n; };
        function setOrder(el, n) {
            n = clamp(n, 0, 999);
            el.setAttribute('data-order', n);
            el.style.setProperty('--ord', n);
        }
        // 같은 층의 블록을 뒤 → 앞 순서로 (값이 같으면 만든 순서)
        function layerList(key) {
            return Array.from(gallery.querySelectorAll('.editable-element'))
                .map((e, i) => ({ e: e, i: i }))
                .filter(o => layerKey(o.e) === key)
                .sort((a, b) => (getOrder(a.e) - getOrder(b.e)) || (a.i - b.i))
                .map(o => o.e);
        }
        function nextOrder(key) {
            const list = layerList(key);
            let max = -1;
            list.forEach(e => { max = Math.max(max, getOrder(e)); });
            if (max >= 990) { list.forEach((e, i) => setOrder(e, i)); return list.length; }
            return max + 1;
        }
        function overlaps(a, b) {
            const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
            return !(r1.right <= r2.left || r1.left >= r2.right || r1.bottom <= r2.top || r1.top >= r2.bottom);
        }
        // mode: back(맨 뒤) / down(뒤로) / up(앞으로) / front(맨 앞) — 선택된 블록 전체에 적용
        function moveLayer(mode) {
            if (!selectedElements.size) return;
            const isSel = e => selectedElements.has(e);
            const keys = new Set(Array.from(selectedElements).map(layerKey));
            keys.forEach(function (key) {
                let list = layerList(key);
                if (mode === 'front') {
                    list = list.filter(e => !isSel(e)).concat(list.filter(isSel));
                } else if (mode === 'back') {
                    list = list.filter(isSel).concat(list.filter(e => !isSel(e)));
                } else if (mode === 'up') {
                    // 위쪽에서 처음 만나는 "겹치는" 블록 바로 위로 (안 겹치는 블록은 건너뜀)
                    for (let i = list.length - 2; i >= 0; i--) {
                        if (!isSel(list[i]) || isSel(list[i + 1])) continue;
                        let j = -1;
                        for (let k = i + 1; k < list.length; k++) {
                            if (!isSel(list[k]) && overlaps(list[i], list[k])) { j = k; break; }
                        }
                        if (j < 0) continue;
                        const me = list.splice(i, 1)[0];
                        list.splice(j, 0, me);
                    }
                } else if (mode === 'down') {
                    for (let i = 1; i < list.length; i++) {
                        if (!isSel(list[i]) || isSel(list[i - 1])) continue;
                        let j = -1;
                        for (let k = i - 1; k >= 0; k--) {
                            if (!isSel(list[k]) && overlaps(list[i], list[k])) { j = k; break; }
                        }
                        if (j < 0) continue;
                        const me = list.splice(i, 1)[0];
                        list.splice(j, 0, me);
                    }
                }
                list.forEach((e, i) => setOrder(e, i));
            });
            saveState();
        }

        // =================================================================
        //  되돌리기 / 다시 실행 (블록 배치·설정 전체를 스냅샷으로 기록. 배경 설정은 포함 안 함)
        // =================================================================
        const history = [];
        let histIdx = -1, histTimer = null, restoring = false;
        function takeSnapshot() {
            return JSON.stringify(Array.from(gallery.querySelectorAll('.editable-element')).map(serializeData).filter(Boolean));
        }
        function snapNow() {
            if (restoring) return;
            clearTimeout(histTimer); histTimer = null;
            const s = takeSnapshot();
            if (histIdx >= 0 && history[histIdx] === s) return;
            history.splice(histIdx + 1);
            history.push(s);
            if (history.length > 100) history.shift();
            histIdx = history.length - 1;
        }
        function scheduleSnap() {
            if (restoring) return;
            clearTimeout(histTimer);
            histTimer = setTimeout(snapNow, 350);   // 슬라이더·키 연타는 한 번의 변경으로 묶음
        }
        function restoreSnapshot(s) {
            restoring = true;
            const keepIds = Array.from(selectedElements).map(e => e.getAttribute('data-id'));
            try {
                gallery.querySelectorAll('.editable-element').forEach(e => e.remove());
                clearSelection();
                JSON.parse(s).forEach(d => createBlock(Object.assign(d, { silent: true })));
                keepIds.forEach(id => {
                    const e = gallery.querySelector('.editable-element[data-id="' + id + '"]');
                    if (e) addToSelection(e);
                });
                if (!selectedElements.size && panelContent) {
                    panelContent.innerHTML = '<p style="margin: 0; color: #9d947e; font-size: 0.8em;">요소를 클릭하면 상세 편집 옵션이 나타납니다.</p>';
                }
                dirty = true;
            } finally { restoring = false; }
        }
        function undo() {
            snapNow();   // 아직 기록되지 않은 마지막 변경까지 포함
            if (histIdx <= 0) return;
            histIdx--; restoreSnapshot(history[histIdx]);
        }
        function redo() {
            if (histIdx < 0 || histIdx >= history.length - 1) return;
            histIdx++; restoreSnapshot(history[histIdx]);
        }

        function deleteSelected() {
            if (!selectedElements.size) return;
            selectedElements.forEach(item => item.remove());
            clearSelection();
            if (panelContent) panelContent.innerHTML = '<p style="margin: 0; color: #9d947e; font-size: 0.8em;">요소를 클릭하거나 빈 곳을 드래그하여 다중 선택해보세요.</p>';
            saveState();
        }

        // =================================================================
        //  키보드 편집: Delete/Backspace 삭제, 방향키 1px 이동 (Shift = 10px), Ctrl+Z 되돌리기, Ctrl+Shift+Z / Ctrl+Y 다시 실행
        //  - 입력칸이나 글 수정 중(글 블록을 더블클릭한 상태)에는 동작하지 않음
        // =================================================================
        function onEditorKey(e) {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
            if (t && t.isContentEditable && (!t.classList.contains('editable-element') || t._editing)) return;
            if (imageEditModal && imageEditModal.style.display === 'flex') return;
            if (document.getElementById('mzGhPicker')) return;   // GitHub 선택 창이 열려 있을 때

            const mod = e.ctrlKey || e.metaKey;
            const k = e.key;

            if (mod && !e.altKey && (k === 'z' || k === 'Z')) {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
                return;
            }
            if (mod && !e.altKey && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
            if (mod || e.altKey || !selectedElements.size) return;

            if (k === 'Delete' || k === 'Backspace') {
                e.preventDefault();
                deleteSelected();   // 실수로 지워도 Ctrl+Z 로 되돌릴 수 있어 확인창 없음
                return;
            }
            const step = e.shiftKey ? 10 : 1;
            const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[k];
            if (mv) {
                e.preventDefault();
                selectedElements.forEach(item => {
                    item.style.left = (item.offsetLeft + mv[0]) + 'px';
                    item.style.top = (item.offsetTop + mv[1]) + 'px';
                });
                saveState();
            }
        }
        if (isAdmin) {
            if (window.__mzEditorKey) document.removeEventListener('keydown', window.__mzEditorKey);
            window.__mzEditorKey = onEditorKey;
            document.addEventListener('keydown', onEditorKey);
            // 글 블록은 더블클릭해야 "글 수정 중"으로 간주 (그때만 키보드가 글자 편집에 쓰임)
            gallery.addEventListener('focusout', function (ev) { if (ev.target._editing) ev.target._editing = false; });
        }

        function saveState() { if (isAdmin) { dirty = true; scheduleSnap(); } }

        // 저장/복제에 쓰는 블록 데이터 (createBlock 이 그대로 받아 복원)
        function serializeData(el) {
            const id = el.getAttribute('data-id');
            if (!id || id === 'undefined' || id === 'null') return null;

            const type = el.getAttribute('data-type') || 'default';
            const attr = (name, def = '') => el.getAttribute(name) || def;
            const props = {};
            Array.from(el.attributes).forEach(a => { if (a.name.startsWith('data-p-')) props[a.name.slice(7)] = a.value; });

            return {
                id: id,
                type: type,
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                rotate: parseInt(el.getAttribute('data-rotate')) || 0,
                shape: Array.from(el.classList).find(c => c.startsWith('shape-')) || 'shape-rect',
                content: (type === 'text' || type === 'default') ? el.innerHTML : '',
                textAlign: el.style.textAlign || 'left',
                border: el.style.border || 'none',
                backgroundColor: el.style.backgroundColor,
                borderRadius: el.style.borderRadius,
                fontFamily: el.style.fontFamily,
                color: el.style.color,
                fontSize: el.style.fontSize || '',
                fontWeight: el.style.fontWeight || '',
                fontStyle: el.style.fontStyle || '',
                textDecoration: el.style.textDecoration || '',
                linkUrl: attr('data-link-url'),
                animIntensity: attr('data-anim-intensity', '2'),
                zOrder: attr('data-order'),
                schDate: attr('data-sch-date'),
                schText: attr('data-sch-text'),
                schDate2: attr('data-sch-date-2'),
                schText2: attr('data-sch-text-2'),
                calYear: attr('data-cal-year', '2026'),
                calMonth: attr('data-cal-month', '10'),
                srcTypeA: attr('data-srctype-a', 'url'),
                valA: attr('data-val-a'),
                srcTypeB: attr('data-srctype-b', 'url'),
                valB: attr('data-val-b'),
                mainImg: attr('data-main-img', 'A'),
                imgScaleA: attr('data-img-scale-a', '1'),
                imgPosXA: attr('data-img-posx-a', '0'),
                imgPosYA: attr('data-img-posy-a', '0'),
                imgScaleB: attr('data-img-scale-b', '1'),
                imgPosXB: attr('data-img-posx-b', '0'),
                imgPosYB: attr('data-img-posy-b', '0'),
                imgUnit: 'pct',
                props: props          // 스티커·도형·효과 설정값
            };
        }

        function serializeBlock(el) {
            const data = serializeData(el);
            if (!data) return null;
            return {
                id: data.id,
                page_name: PAGE,
                type: data.type,
                left: data.left,
                top: data.top,
                width: data.width,
                height: data.height,
                content: data.content,
                border: data.border,
                backgroundColor: data.backgroundColor,
                borderRadius: data.borderRadius,
                fontFamily: data.fontFamily,
                color: data.color,
                linkUrl: data.linkUrl,
                layout_data: data
            };
        }

        async function saveAll() {
            if (!sb) { alert('Supabase 연결이 되어 있지 않습니다.'); return; }
            if (!loaded) { alert('불러오기에 실패한 상태라 저장을 막았습니다. 새로고침 후 다시 시도하세요.'); return; }

            const rows = Array.from(gallery.querySelectorAll('.editable-element')).map(serializeBlock).filter(Boolean);
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장중'; }
            try {
                if (rows.length) {
                    const { error } = await sb.from(TABLE).upsert(rows);
                    if (error) throw error;
                }
                const { data: existing, error: e2 } = await sb.from(TABLE).select('id').eq('page_name', PAGE);
                if (e2) throw e2;
                const keep = new Set(rows.map(r => r.id));
                const del = (existing || []).map(r => r.id).filter(id => !keep.has(id));
                if (del.length) {
                    const { error: e3 } = await sb.from(TABLE).delete().in('id', del);
                    if (e3) throw e3;
                }
                if (isMainPage) await saveSettingsRow();
                dirty = false;
                alert('레이아웃이 저장되었습니다!');
            } catch (err) {
                alert('저장 실패: ' + (err.message || err));
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
            }
        }

        function mapShape(s) {
            if (s === 'shape-circle') return 'shape-oval';
            if (s === 'shape-skew') return 'shape-parallelogram';
            return s || 'shape-rect';
        }

        async function loadLayout() {
            if (!sb) return;
            const { data, error } = await sb.from(TABLE).select('*').eq('page_name', PAGE);
            if (error || !data) { console.error('레이아웃 불러오기 실패', error); return; }
            loaded = true;

            data.forEach(row => {
                let parsed = {};
                try { if (row.layout_data) parsed = typeof row.layout_data === 'string' ? JSON.parse(row.layout_data) : row.layout_data; } catch (e) { }
                const d = Object.assign({
                    id: row.id, type: row.type, left: row.left, top: row.top, width: row.width, height: row.height,
                    content: row.content, textAlign: row.textAlign, border: row.border, backgroundColor: row.backgroundColor,
                    borderRadius: row.borderRadius, color: row.color, linkUrl: row.linkUrl
                }, parsed);

                if (!d.id || document.querySelector(`[data-id="${d.id}"]`)) return;

                if (d.type === 'image' && !d.valA && d.content) {
                    const m = String(d.content).match(/src="([^"]+)"/);
                    if (m) d.valA = m[1];
                }

                createBlock(Object.assign(d, { silent: true }));
            });
            snapNow();   // 되돌리기 기준점 (불러온 직후 상태)
        }

        function getCalendarHtml(year, month, dateStr1, textStr1, dateStr2, textStr2) {
            const firstDay = new Date(year, month - 1, 1).getDay();
            const lastDate = new Date(year, month, 0).getDate();

            let gridHtml = `
            <div class="cal-day-name" style="color:#ff4757;">일</div>
            <div class="cal-day-name">월</div>
            <div class="cal-day-name">화</div>
            <div class="cal-day-name">수</div>
            <div class="cal-day-name">목</div>
            <div class="cal-day-name">금</div>
            <div class="cal-day-name" style="color:#2e86de;">토</div>`;

            for (let i = 0; i < firstDay; i++) gridHtml += `<div class="cal-date"></div>`;

            for (let d = 1; d <= lastDate; d++) {
                let colorStyle = '';
                const dayOfWeek = (firstDay + d - 1) % 7;
                if (dayOfWeek === 0) colorStyle = 'color:#ff4757;';
                else if (dayOfWeek === 6) colorStyle = 'color:#2e86de;';
                gridHtml += `<div class="cal-date" style="${colorStyle}">${d}</div>`;
            }

            function formatSchedule(dateStr, textStr) {
                if (!dateStr || !textStr) return null;
                const parts = dateStr.split(/[-/]/);
                if (parts.length >= 3) {
                    const schYear = parseInt(parts[0], 10);
                    const schMonth = parseInt(parts[1], 10);
                    const schDay = parts[2].padStart(2, '0');
                    const monthFormatted = String(schMonth).padStart(2, '0');

                    if (schYear === year && schMonth === month) {
                        const monthDayStr = `${monthFormatted}/${schDay}`;
                        return `<div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; background:rgba(201,168,106,0.15); border:1px solid rgba(201,168,106,0.3); padding:2px 4px; border-radius:3px; font-size:0.75em;"><span style="color:#706fd3; font-weight:bold;">${esc(monthDayStr)}</span> ${esc(textStr)}</div>`;
                    }
                }
                return null;
            }

            const item1 = formatSchedule(dateStr1, textStr1);
            const item2 = formatSchedule(dateStr2, textStr2);

            let scheduleBarHtml = '';
            if (item1 || item2) {
                scheduleBarHtml = `
                <div class="cal-schedule-bar" style="display:flex; gap:4px; margin-top:4px;">
                    ${item1 || ''}
                    ${item2 || ''}
                </div>`;
            }

            return `
            <div class="collab-calendar" data-cal-year="${year}" data-cal-month="${month}">
                <div class="cal-header">
                    <span class="cal-prev">&lt;</span>
                    <span>${year}. ${month < 10 ? '0' + month : month}</span>
                    <span class="cal-next">&gt;</span>
                </div>
                <div class="cal-grid">${gridHtml}</div>
                ${scheduleBarHtml}
            </div>`;
        }

        // 블록 생성: 저장 데이터(layout_data)와 같은 키를 그대로 받는다.
        //   → 불러오기 / 복제 / 새로 만들기가 모두 이 함수 하나를 쓴다.
        function createBlock(d) {
            if (!d || !d.id || d.id === 'undefined' || d.id === 'null') return;

            const type = d.type || 'default';
            const decor = isDecor(type);
            const now = new Date();
            const calYear = d.calYear || String(now.getFullYear());
            const calMonth = d.calMonth || String(now.getMonth() + 1);
            const rotateDeg = d.rotate || 0;
            const textAlign = d.textAlign || 'left';

            const el = document.createElement('div');
            el.className = `mh-blk mh-bx-cut editable-element ${mapShape(d.shape)}`;
            el.setAttribute('data-id', d.id);
            el.setAttribute('data-type', type);
            el.setAttribute('data-rotate', rotateDeg);
            el.setAttribute('data-anim-intensity', d.animIntensity || (decor ? '0' : '2'));
            [['data-sch-date', d.schDate], ['data-sch-text', d.schText], ['data-sch-date-2', d.schDate2],
             ['data-sch-text-2', d.schText2], ['data-link-url', d.linkUrl]]
                .forEach(([k, v]) => { if (v) el.setAttribute(k, v); });
            Object.entries(d.props || {}).forEach(([k, v]) => setP(el, k, v));

            if (type === 'calendar') {
                el.setAttribute('data-cal-year', calYear);
                el.setAttribute('data-cal-month', calMonth);
            }
            if (type === 'image') {
                el.setAttribute('data-srctype-a', d.srcTypeA || 'url');
                el.setAttribute('data-val-a', d.valA || '');
                el.setAttribute('data-srctype-b', d.srcTypeB || 'url');
                el.setAttribute('data-val-b', d.valB || '');
                el.setAttribute('data-main-img', d.mainImg || 'A');
                el.setAttribute('data-img-scale-a', d.imgScaleA || '1');
                el.setAttribute('data-img-posx-a', d.imgPosXA || '0');
                el.setAttribute('data-img-posy-a', d.imgPosYA || '0');
                el.setAttribute('data-img-scale-b', d.imgScaleB || '1');
                el.setAttribute('data-img-posx-b', d.imgPosXB || '0');
                el.setAttribute('data-img-posy-b', d.imgPosYB || '0');
            }

            el.style.left = d.left || '100px';
            el.style.top = d.top || '100px';
            el.style.width = d.width || '150px';
            el.style.height = d.height || '150px';
            el.style.transform = `rotate(${rotateDeg}deg)`;
            el.style.textAlign = textAlign;
            el.style.justifyContent = textAlign === 'center' ? 'center' : (textAlign === 'right' ? 'flex-end' : 'flex-start');

            // 스티커·도형·효과는 테두리/배경/안쪽 여백 없이 이미지만 보이게
            el.style.border = d.border || (decor ? 'none' : '1px solid rgba(201,168,106,0.35)');
            el.style.backgroundColor = d.backgroundColor || (decor ? 'transparent' : 'rgba(201,168,106,0.05)');
            el.style.borderRadius = d.borderRadius || (decor ? '0px' : '6px');
            el.style.fontFamily = d.fontFamily || 'Pretendard';
            el.style.color = d.color || '#ece5d3';
            if (decor) el.style.padding = '0';

            // 저장된 글자 서식 복원 (이전에는 저장만 되고 불러올 때 적용이 빠져 있었음)
            if (d.fontSize) el.style.fontSize = d.fontSize;
            if (d.fontWeight) el.style.fontWeight = d.fontWeight;
            if (d.fontStyle) el.style.fontStyle = d.fontStyle;
            if (d.textDecoration) el.style.textDecoration = d.textDecoration;

            if (type === 'text') {
                el.contentEditable = isAdmin ? 'true' : 'false';
                el.innerHTML = d.content || 'TEXT';
                el.addEventListener('input', () => { saveState(el); });
                // 엔터키 입력 시 다음 줄로 정상 개행
                el.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        document.execCommand('insertLineBreak');
                        e.preventDefault();
                    }
                });
            } else if (type === 'image') {
                renderImageBlock(el);
            } else if (type === 'calendar') {
                el.innerHTML = getCalendarHtml(parseInt(calYear), parseInt(calMonth),
                    d.schDate || '', d.schText || '', d.schDate2 || '', d.schText2 || '');
            } else if (!decor) {
                el.innerHTML = d.content || '';
            }

            const ordNum = (d.zOrder === undefined || d.zOrder === null || d.zOrder === '') ? NaN : parseInt(d.zOrder);
            setOrder(el, isNaN(ordNum) ? nextOrder(layerKeyOf(type)) : ordNum);

            gallery.appendChild(el);
            if (decor) {
                renderDecor(el);
                // 도형은 크기가 바뀔 때마다 SVG 를 다시 그림 (드래그·패널 입력 모두)
                if (type === 'shape' && window.ResizeObserver) new ResizeObserver(() => renderShapeElement(el)).observe(el);
            }
            if (isAdmin && !d.silent) {
                saveState(el);
                selectElement(el);
            }
        }

        MZ.fitStage();

        const SETTINGS_ID = 'settings_main';
        const defaultSettings = { 
            darkBgImage: '', darkBgDim: 0.45, 
            lightBgImage: '', lightBgDim: 0.45, 
            winAlpha: 0.88 
        };
        let siteSettings = Object.assign({}, defaultSettings);
        let settingsLoaded = false;

        if (isAdmin && isMainPage) {
            const panel = document.getElementById('layoutControlPanel');
            if (panel) {
                const existingDetails = panel.querySelector('details');
                if (existingDetails) existingDetails.remove();

                const bgDetails = document.createElement('details');
                bgDetails.style.cssText = "margin-bottom: 10px; font-size: 0.85em; background: rgba(201,168,106,0.08); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(201,168,106,0.2);";
                bgDetails.innerHTML = `
                  <summary style="cursor: pointer; color: #c9a86a; font-weight: bold;">🖼️ 페이지 배경 설정</summary>
                  <div style="margin-top: 8px;">
                    <div style="font-weight:bold; color:#c9a86a; margin-bottom:4px; font-size:0.9em;">🌙 다크 모드 배경</div>
                    <label style="display:block; font-size:0.8em; color:#9d947e; margin-bottom:2px;">이미지 경로</label>
                    <input type="text" id="darkBgImageInput" placeholder="https://..." style="width:100%; box-sizing:border-box; background:#111; border:1px solid #444; color:#ece5d3; padding:5px; border-radius:3px; font-size:0.9em; margin-bottom:4px;">
                    <label style="display:flex; justify-content:space-between; font-size:0.8em; color:#9d947e; margin-bottom:2px;"><span>어둡기</span><span id="darkBgDimVal">0.45</span></label>
                    <input type="range" id="darkBgDimRange" min="0" max="0.9" step="0.05" value="0.45" style="width:100%; accent-color:#c9a86a; margin-bottom:8px;">

                    <div style="font-weight:bold; color:#c9a86a; margin-bottom:4px; font-size:0.9em; border-top:1px dashed rgba(201,168,106,0.3); padding-top:6px;">☀️ 라이트 모드 배경</div>
                    <label style="display:block; font-size:0.8em; color:#9d947e; margin-bottom:2px;">이미지 경로</label>
                    <input type="text" id="lightBgImageInput" placeholder="https://..." style="width:100%; box-sizing:border-box; background:#111; border:1px solid #444; color:#ece5d3; padding:5px; border-radius:3px; font-size:0.9em; margin-bottom:4px;">
                    <label style="display:flex; justify-content:space-between; font-size:0.8em; color:#9d947e; margin-bottom:2px;"><span>어둡기</span><span id="lightBgDimVal">0.45</span></label>
                    <input type="range" id="lightBgDimRange" min="0" max="0.9" step="0.05" value="0.45" style="width:100%; accent-color:#c9a86a; margin-bottom:8px;">

                    <div style="border-top:1px dashed rgba(201,168,106,0.3); padding-top:6px;">
                        <label style="display:flex; justify-content:space-between; font-size:0.85em; color:#9d947e; margin-bottom:2px;"><span>메인 창 불투명도</span><span id="winAlphaVal">0.88</span></label>
                        <input type="range" id="winAlphaRange" min="0" max="1" step="0.02" value="0.88" style="width:100%; accent-color:#c9a86a; margin-bottom:8px;">
                    </div>

                    <div id="bgStatus" style="font-size:0.75em; margin-top:3px; line-height:1.4;"></div>
                    <button type="button" id="bgClearBtn" style="background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; font-size:0.78em; padding:4px 8px; border-radius:4px; cursor:pointer; margin-top:4px;">현재 모드 배경 지우기</button>
                  </div>
                `;
                panel.insertBefore(bgDetails, panel.children[1]);
            }
        }

        const darkBgImageInput = document.getElementById('darkBgImageInput');
        const darkBgDimRange = document.getElementById('darkBgDimRange');
        const darkBgDimVal = document.getElementById('darkBgDimVal');
        const lightBgImageInput = document.getElementById('lightBgImageInput');
        const lightBgDimRange = document.getElementById('lightBgDimRange');
        const lightBgDimVal = document.getElementById('lightBgDimVal');
        const winAlphaRange = document.getElementById('winAlphaRange');
        const winAlphaVal = document.getElementById('winAlphaVal');
        const bgClearBtn = document.getElementById('bgClearBtn');

        let bgCheckSeq = 0;
        function checkBgImage(url) {
            const st = document.getElementById('bgStatus');
            if (!st) return;
            if (!url) { st.textContent = ''; return; }
            const seq = ++bgCheckSeq;
            st.style.color = '#9d947e'; st.textContent = '불러오는 중...';
            const t = new Image();
            t.onload = () => { if (seq === bgCheckSeq) { st.style.color = '#2ed573'; st.textContent = '✔ 이미지를 불러왔습니다'; } };
            t.onerror = () => { if (seq === bgCheckSeq) { st.style.color = '#ff4757'; st.textContent = '✖ 불러오기 실패'; } };
            t.src = url;
        }

        function applySettings() {
            const stage = document.getElementById('mh-gpfto');
            if (document.getElementById('pageBg')) {
                const currentUrl = MZ.paintBackground(siteSettings);
                checkBgImage(currentUrl);
            }
            if (stage) stage.style.setProperty('--win-a', siteSettings.winAlpha);
        }

        function syncSettingsPanel() {
            if (darkBgImageInput) darkBgImageInput.value = siteSettings.darkBgImage || '';
            if (darkBgDimRange) darkBgDimRange.value = siteSettings.darkBgDim;
            if (darkBgDimVal) darkBgDimVal.textContent = Number(siteSettings.darkBgDim).toFixed(2);

            if (lightBgImageInput) lightBgImageInput.value = siteSettings.lightBgImage || '';
            if (lightBgDimRange) lightBgDimRange.value = siteSettings.lightBgDim;
            if (lightBgDimVal) lightBgDimVal.textContent = Number(lightBgDimRange.value).toFixed(2);

            if (winAlphaRange) winAlphaRange.value = siteSettings.winAlpha;
            if (winAlphaVal) winAlphaVal.textContent = Number(siteSettings.winAlpha).toFixed(2);
        }

        async function loadSettings() {
            if (!sb) return;
            const { data, error } = await sb.from(TABLE).select('layout_data').eq('id', SETTINGS_ID).maybeSingle();
            if (error) return;
            settingsLoaded = true;
            let d = data && data.layout_data;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            if (d && typeof d === 'object') {
                if (d.bgImage && !d.darkBgImage) d.darkBgImage = d.bgImage;
                if (d.bgDim !== undefined && d.darkBgDim === undefined) d.darkBgDim = d.bgDim;
                siteSettings = Object.assign({}, defaultSettings, d);
            }
            applySettings();
            syncSettingsPanel();
        }

        async function saveSettingsRow() {
            if (!settingsLoaded || !isMainPage) return;
            const row = {
                id: SETTINGS_ID, page_name: '__settings__', type: 'settings',
                left: '', top: '', width: '', height: '', content: '', border: '',
                backgroundColor: '', borderRadius: '', fontFamily: '', color: '', linkUrl: '',
                layout_data: siteSettings
            };
            const { error } = await sb.from(TABLE).upsert([row]);
            if (error) throw error;
        }

        if (isAdmin && isMainPage) {
            if (darkBgImageInput) darkBgImageInput.addEventListener('input', e => {
                siteSettings.darkBgImage = e.target.value.trim();
                applySettings(); dirty = true;
            });
            if (darkBgDimRange) darkBgDimRange.addEventListener('input', e => {
                siteSettings.darkBgDim = parseFloat(e.target.value);
                if (darkBgDimVal) darkBgDimVal.textContent = siteSettings.darkBgDim.toFixed(2);
                applySettings(); dirty = true;
            });
            if (lightBgImageInput) lightBgImageInput.addEventListener('input', e => {
                siteSettings.lightBgImage = e.target.value.trim();
                applySettings(); dirty = true;
            });
            if (lightBgDimRange) lightBgDimRange.addEventListener('input', e => {
                siteSettings.lightBgDim = parseFloat(e.target.value);
                if (lightBgDimVal) lightBgDimVal.textContent = Number(lightBgDimRange.value).toFixed(2);
                applySettings(); dirty = true;
            });
            if (winAlphaRange) winAlphaRange.addEventListener('input', e => {
                siteSettings.winAlpha = parseFloat(e.target.value);
                if (winAlphaVal) winAlphaVal.textContent = siteSettings.winAlpha.toFixed(2);
                applySettings(); dirty = true;
            });
            if (bgClearBtn) bgClearBtn.addEventListener('click', () => {
                const currentTheme = MZ.getTheme();
                if (currentTheme === 'light') siteSettings.lightBgImage = '';
                else siteSettings.darkBgImage = '';
                syncSettingsPanel(); applySettings(); dirty = true;
            });
        }

        applySettings();
        loadSettings();
        loadLayout();
    };
})();