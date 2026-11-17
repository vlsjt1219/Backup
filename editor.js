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
        const cropInnerBox = document.getElementById('cropInnerBox');
        const cropGhostBox = document.getElementById('cropGhostBox');
        const modalGhostImg = document.getElementById('modalGhostImg');
        const cropRatioInfo = document.getElementById('cropRatioInfo');
        const modalFillBtn = document.getElementById('modalFillBtn');
        const modalResetBtn = document.getElementById('modalResetBtn');

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

        // 이미지 블록은 바깥 칸(el)이 눈에 안 보이는 틀이고, 테두리·배경·모양은 뒤집히는 면(.flip-face)이 그린다.
        // 패널에서 바꾼 값(el.style)을 면으로 복사해 주는 함수
        function syncImageCard(el) {
            const shape = Array.from(el.classList).find(c => c.startsWith('shape-')) || 'shape-rect';
            el.querySelectorAll('.flip-face').forEach(f => {
                Array.from(f.classList).filter(c => c.startsWith('shape-')).forEach(c => f.classList.remove(c));
                f.classList.add(shape);
                f.style.border = el.style.border || 'none';
                f.style.backgroundColor = el.style.backgroundColor || 'transparent';
                f.style.borderRadius = el.style.borderRadius || '';
            });
        }

        function renderImageBlock(el) {
            const main = el.getAttribute('data-main-img') || 'A';
            const other = main === 'A' ? 'B' : 'A';
            el.innerHTML = '';
            // 카드 구조: .flip-card(회전축) > 앞면(.flip-front: 메인 이미지) + 뒷면(.flip-back: 오버 이미지)
            const card = document.createElement('div');
            card.className = 'flip-card';
            const front = document.createElement('div');
            front.className = 'flip-face flip-front';
            front.appendChild(makeBlockImg('main-img', '메인', getImgState(el, main)));
            const back = document.createElement('div');
            back.className = 'flip-face flip-back';
            back.appendChild(makeBlockImg('hover-img', '오버', getImgState(el, other)));
            card.appendChild(front);
            card.appendChild(back);
            // 프레임(블록 바깥 장식선): 앞·뒷면 각각 따로 두어 블록과 함께 뒤집힘
            const frameFront = document.createElement('div');
            frameFront.className = 'flip-frame';
            const frameBack = document.createElement('div');
            frameBack.className = 'flip-frame flip-frame-back';
            card.appendChild(frameFront);
            card.appendChild(frameBack);
            el.appendChild(card);
            syncImageCard(el);
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


        // ── 글/이미지 블록용 프레임(장식 외곽선): 선 + 반짝이/마름모를 SVG 로 만들어 블록 위에 덮어 그린다 ──
        const FRAME_KINDS = [
            ['fr-round', '둥근 프레임 + 반짝이'], ['fr-double', '이중선 둥근 프레임 + 반짝이'],
            ['fr-orbit', '둥근 프레임 + 타원 궤도'], ['fr-bottom', '둥근 프레임 + 아래 반짝이 3개'],
            ['fr-arch', '아치 프레임'], ['fr-arch2', '이중선 아치 프레임 + 반짝이'],
            ['fr-pill', '이중선 타원(알약) 프레임'], ['fr-leaf', '대각선 둥근 이중선 프레임'],
            ['fr-chamfer', '모서리 깎은 이중선 + 마름모'], ['fr-ticks', '네모 프레임 + 사방 반짝이'],
            ['fr-ovalrect', '네모 안에 타원']
        ];
        // 이중선은 종류별 기본값이 있고, 패널의 체크박스로 직접 켜고 끌 수 있음 (frame-dbl: '' = 기본값 / '1' / '0')
        const FRAME_DBL_DEFAULT = ['fr-double', 'fr-arch2', 'fr-pill', 'fr-leaf', 'fr-chamfer'];
        const frameDblOf = el => {
            const v = P(el, 'frame-dbl', '');
            return v === '' ? FRAME_DBL_DEFAULT.indexOf(el.getAttribute('data-p-frame') || '') >= 0 : v === '1';
        };

        function frameSvg(kind, W, H, cfg) {
            const sw = cfg.sw, color = cfg.color;
            const i = sw / 2;                                   // 선 굵기의 절반
            // 프레임은 블록 '바깥'에 두른다: W, H 는 블록 크기이고, 여백(pad)을 더한 만큼 SVG 를 키워 그린다
            const BW = W, BH = H;
            const u0 = clamp(Math.min(BW, BH) * 0.05, 5, 22);   // 장식 기본 크기
            const m0 = cfg.orn ? u0 * 2 : 0;                    // 장식이 들어갈 바깥 여백
            const g0 = Math.max(5, sw * 2.2);                   // 이중선 간격
            const dbl = !!cfg.dbl;                              // 이중선 (cfg 로 받음)
            const e = Math.max(0, cfg.gap || 0) + i + (dbl ? g0 : 0);   // 블록 가장자리에서 가장 바깥 선 중심까지의 거리
            const pad = i + m0 + e;                             // SVG 가장자리 ~ 블록 가장자리
            // 평행사변형: 직사각형으로 그린 프레임 전체를 같은 기울기로 기울여 블록 모양을 따라가게 함
            const SK = cfg.shape === 'shape-parallelogram' ? 0.25 : 0;      // editor.css 의 polygon(25% 0, ...) 과 같은 값
            const kshear = SK ? (SK * BW) / BH : 0;                          // 높이 1px 당 가로로 밀리는 양
            const padX = pad * (1 + kshear);                                 // 기울인 만큼 가로 바깥 여백이 더 필요
            W = BW * (1 - SK) + 2 * pad; H = BH + 2 * pad;                   // (기울이기 전) 그리는 영역
            const x0 = i, y0 = i, x1 = Math.max(i + 10, W - i), y1 = Math.max(i + 10, H - i);
            let orn = '';
            let outerD = '', innerD = '';                       // 바깥/안쪽 윤곽선 경로 (이미지 자르기 마스크용)
            const geo = (function () {
                const f = n => +n.toFixed(2);
                const ornOn = cfg.orn;
                const u = u0;
                const m = m0;
                const fx0 = x0 + m, fy0 = y0 + m, fx1 = Math.max(fx0 + 10, x1 - m), fy1 = Math.max(fy0 + 10, y1 - m);
                const fw = fx1 - fx0, fh = fy1 - fy0, fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2;
                const g = g0;
                // 모서리 둥글기: 꺼져 있으면 0(각지게), 값을 비워 두면 종류별 기본값, 값을 넣으면 그 값(px)
                const rndOn = cfg.rnd !== false;
                const rv = (cfg.radius === null || cfg.radius === undefined || isNaN(cfg.radius)) ? null : Math.max(0, cfg.radius);
                const half = Math.min(fw, fh) / 2;
                const RR = def => rndOn ? clamp(rv === null ? def : rv, 0, half) : 0;
                const D = s => dbl ? s : '';                                      // 이중선일 때만 안쪽 선을 그림

                // 4개 모서리 반지름을 따로 줄 수 있는 둥근 사각형 경로 (CSS 처럼 넘치면 비례해서 줄임)
                const rrPath = (x, y, w, h, tl, tr, br, bl) => {
                    const s = Math.min(1, w / ((tl + tr) || 1), w / ((bl + br) || 1), h / ((tl + bl) || 1), h / ((tr + br) || 1));
                    tl *= s; tr *= s; br *= s; bl *= s;
                    return `M${f(x + tl)},${f(y)} H${f(x + w - tr)} A${f(tr)},${f(tr)} 0 0 1 ${f(x + w)},${f(y + tr)} V${f(y + h - br)} ` +
                           `A${f(br)},${f(br)} 0 0 1 ${f(x + w - br)},${f(y + h)} H${f(x + bl)} A${f(bl)},${f(bl)} 0 0 1 ${f(x)},${f(y + h - bl)} ` +
                           `V${f(y + tl)} A${f(tl)},${f(tl)} 0 0 1 ${f(x + tl)},${f(y)} Z`;
                };
                const outer = r4 => { outerD = rrPath(fx0, fy0, fw, fh, ...r4); return `<path d="${outerD}"/>`; };
                const inner = r4 => { innerD = rrPath(fx0 + g, fy0 + g, fw - 2 * g, fh - 2 * g, ...r4.map(r => Math.max(0, r - g))); return `<path fill="none" d="${innerD}"/>`; };
                const oct = (x, y, w, h, c) => `M${f(x + c)},${f(y)} H${f(x + w - c)} L${f(x + w)},${f(y + c)} V${f(y + h - c)} L${f(x + w - c)},${f(y + h)} H${f(x + c)} L${f(x)},${f(y + h - c)} V${f(y + c)} Z`;
                // 반짝이(안쪽으로 오목한 네 꼭짓점 별) / 마름모
                const sp = (cx, cy, r) => { const k = r * 0.17; return `M${f(cx)},${f(cy - r)} Q${f(cx + k)},${f(cy - k)} ${f(cx + r)},${f(cy)} Q${f(cx + k)},${f(cy + k)} ${f(cx)},${f(cy + r)} Q${f(cx - k)},${f(cy + k)} ${f(cx - r)},${f(cy)} Q${f(cx - k)},${f(cy - k)} ${f(cx)},${f(cy - r)} Z `; };
                const dm = (cx, cy, r) => `M${f(cx)},${f(cy - r)} L${f(cx + r)},${f(cy)} L${f(cx)},${f(cy + r)} L${f(cx - r)},${f(cy)} Z `;
                let geo = '', o = '';

                switch (kind) {
                    case 'fr-round': {
                        const R = RR(18);
                        geo = outer([R, R, R, R]) + D(inner([R, R, R, R]));
                        o = sp(fx0, fy0, 1.7 * u) + sp(fx1, fy1, 1.2 * u) + sp(fx0 + 2.2 * u, fy0 + 1.2 * u, 0.6 * u);
                        break;
                    }
                    case 'fr-double': {
                        const R = RR(18);
                        geo = outer([R, R, R, R]) + D(inner([R, R, R, R]));
                        o = sp(fx0, fy0 + fh * 0.2, 1.7 * u) + sp(fx0 + 1.9 * u, fy0 + fh * 0.2 + 1.8 * u, 0.8 * u) + sp(fx1, fy1 - fh * 0.12, 1.1 * u);
                        break;
                    }
                    case 'fr-orbit': {
                        const R = RR(18);
                        geo = outer([R, R, R, R]) + D(inner([R, R, R, R]));
                        const ecx = fcx, ecy = fcy + fh * 0.08, rx = fw / 2 + m * 0.9, ry = Math.max(8, fh * 0.12), th = -16 * Math.PI / 180;
                        geo += `<ellipse fill="none" cx="${f(ecx)}" cy="${f(ecy)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(-16 ${f(ecx)} ${f(ecy)})"/>`;
                        const t = 0.45, lx = rx * Math.cos(t), ly = ry * Math.sin(t);
                        o = sp(ecx + lx * Math.cos(th) - ly * Math.sin(th), ecy + lx * Math.sin(th) + ly * Math.cos(th), 1.5 * u);
                        break;
                    }
                    case 'fr-bottom': {
                        const R = RR(18);
                        geo = outer([R, R, R, R]) + D(inner([R, R, R, R]));
                        o = sp(fcx - 2.8 * u, fy1, 0.9 * u) + sp(fcx, fy1, 1.7 * u) + sp(fcx + 2.8 * u, fy1, 0.9 * u);
                        break;
                    }
                    case 'fr-arch': case 'fr-arch2': {
                        const rw = Math.min(fw / 2, fh);
                        const Rt = rndOn ? clamp(rv === null ? rw : rv, 0, rw) : 0;           // 위쪽 모서리 (기본 = 반원)
                        geo = outer([Rt, Rt, 0, 0]) + D(inner([Rt, Rt, 0, 0]));
                        const a = 38 * Math.PI / 180, cy0 = fy0 + Rt;
                        o = sp(fcx, fy0, 1.7 * u);
                        if (Rt >= 6) o += sp(fcx - Rt * Math.sin(a), cy0 - Rt * Math.cos(a), 0.9 * u) + sp(fcx + Rt * Math.sin(a), cy0 - Rt * Math.cos(a), 0.9 * u);
                        break;
                    }
                    case 'fr-pill': {
                        const r = RR(half);                                                    // 기본 = 양끝 반원
                        geo = outer([r, r, r, r]) + D(inner([r, r, r, r]));
                        o = sp(fcx, fy0, 1.7 * u) + sp(fcx, fy1, 1.7 * u);
                        break;
                    }
                    case 'fr-leaf': {
                        const Rb = RR(Math.min(fw, fh) * 0.32), sm = (rndOn && Rb > 0) ? Math.min(6, Rb) : 0;
                        geo = outer([sm, Rb, sm, Rb]) + D(inner([sm, Rb, sm, Rb]));
                        o = sp(fx1, fy0 + Rb + 2.6 * u, 1.5 * u) + sp(fx1, fy0 + Rb + 5.2 * u, 0.7 * u) +
                            sp(fx0, fy1 - Rb - 2.6 * u, 1.5 * u) + sp(fx0, fy1 - Rb - 5.2 * u, 0.7 * u);
                        break;
                    }
                    case 'fr-chamfer': {
                        const c = rndOn ? clamp(rv === null ? Math.max(8, Math.min(fw, fh) * 0.08) : rv, 0, half) : 0;   // 모서리를 깎는 크기
                        outerD = oct(fx0, fy0, fw, fh, c);
                        innerD = oct(fx0 + g, fy0 + g, fw - 2 * g, fh - 2 * g, c * 0.9);
                        geo = `<path d="${outerD}"/>` + D(`<path fill="none" d="${innerD}"/>`);
                        for (const [cx, cy, vx, vy] of [[fcx, fy0, 1, 0], [fcx, fy1, 1, 0], [fx0, fcy, 0, 1], [fx1, fcy, 0, 1]])
                            o += dm(cx, cy, 1.4 * u) + dm(cx - vx * 3.4 * u, cy - vy * 3.4 * u, 0.7 * u) + dm(cx + vx * 3.4 * u, cy + vy * 3.4 * u, 0.7 * u);
                        break;
                    }
                    case 'fr-ticks': {
                        const R = RR(0);
                        geo = outer([R, R, R, R]) + D(inner([R, R, R, R]));
                        for (const [cx, cy, vx, vy] of [[fcx, fy0, 1, 0], [fcx, fy1, 1, 0], [fx0, fcy, 0, 1], [fx1, fcy, 0, 1]])
                            o += sp(cx, cy, 1.6 * u) + sp(cx - vx * 3.2 * u, cy - vy * 3.2 * u, 0.7 * u) + sp(cx + vx * 3.2 * u, cy + vy * 3.2 * u, 0.7 * u);
                        break;
                    }
                    case 'fr-ovalrect': {
                        const R = RR(0);
                        geo = outer([R, R, R, R]) + D(inner([R, R, R, R])) + `<ellipse fill="none" cx="${f(fcx)}" cy="${f(fcy)}" rx="${f(fw / 2)}" ry="${f(fh / 2)}"/>`;
                        o = sp(fcx, fy0, u) + sp(fcx, fy1, u) + sp(fx0, fcy, u) + sp(fx1, fcy, u);
                        break;
                    }
                }
                if (cfg.poly || cfg.ellipse) {
                    // 삼각형·마름모·육각형·타원 등: 블록 모양 그대로의 선으로 두름 (꼭짓점에 반짝이)
                    const bcx = pad + BW / 2, bcy = pad + BH / 2, e1 = e, e2 = Math.max(0, e - g);
                    const mk = ex => cfg.ellipse
                        ? `<ellipse fill="none" cx="${f(bcx)}" cy="${f(bcy)}" rx="${f(BW / 2 + ex)}" ry="${f(BH / 2 + ex)}"/>`
                        : `<polygon fill="none" points="${cfg.poly.map(p => f(bcx + (p[0] - 0.5) * (BW + 2 * ex)) + ',' + f(bcy + (p[1] - 0.5) * (BH + 2 * ex))).join(' ')}"/>`;
                    geo = mk(e1) + (dbl ? mk(e2) : '');
                    o = '';
                    if (cfg.poly) {
                        [0, Math.floor(cfg.poly.length / 2)].forEach((vi, n) => {
                            const p = cfg.poly[vi];
                            o += sp(bcx + (p[0] - 0.5) * (BW + 2 * e1), bcy + (p[1] - 0.5) * (BH + 2 * e1), (n ? 1.0 : 1.7) * u);
                        });
                    } else {
                        o = sp(bcx, bcy - (BH / 2 + e1), 1.7 * u) + sp(bcx, bcy + (BH / 2 + e1), 1.0 * u);
                    }
                }
                orn = ornOn ? o : '';
                return geo;
            })();
            if (cfg.clip) {
                // 프레임 윤곽선을 블록 크기 그대로 칠한 마스크 이미지 (평행사변형이면 같은 기울기 적용)
                const tfc = SK ? ` transform="matrix(1 0 ${(-kshear).toFixed(5)} 1 ${(kshear * BH).toFixed(3)} 0)"` : '';
                const cd = (dbl && innerD) ? innerD : outerD;
                return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${BW}" height="${BH}" viewBox="0 0 ${BW} ${BH}"><g${tfc}><g transform="translate(${-pad.toFixed(3)} ${-pad.toFixed(3)})"><path d="${cd}" fill="#000"/></g></g></svg>` };
            }
            let dashAttr = '', cap = 'butt';
            if (cfg.dash === 'dashed') dashAttr = `stroke-dasharray="${cfg.dl} ${cfg.dg}"`;
            else if (cfg.dash === 'dotted') { dashAttr = `stroke-dasharray="0.01 ${cfg.dg + sw}"`; cap = 'round'; }
            const SW = Math.round((BW + 2 * padX) * 100) / 100;
            const tf = SK ? ` transform="matrix(1 0 ${(-kshear).toFixed(5)} 1 ${(kshear * (2 * pad + BH)).toFixed(3)} 0)"` : '';
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SW}" height="${H}" viewBox="0 0 ${SW} ${H}"><g${tf}>` +
                   `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="${cap}" ${dashAttr}>${geo}</g>` +
                   (orn ? `<path d="${orn}" fill="${color}" stroke="none"/>` : '') + `</g></svg>`;
            return { svg: svg, padX: padX, padY: pad };
        }

        // 블록(글/이미지)의 프레임 설정을 읽어 --frame-img 로 반영 (CSS 의 ::after 가 그려줌)
        // 자르기 모양(clip-path)별 꼭짓점 (editor.css 의 .shape-* 와 같은 값, 0~1 비율)
        const FRAME_POLY = {
            'shape-triangle': [[.5, 0], [0, 1], [1, 1]],
            'shape-rt-triangle': [[0, 0], [0, 1], [1, 1]],
            'shape-trapezoid': [[.25, 0], [.75, 0], [1, 1], [0, 1]],
            'shape-diamond': [[.5, 0], [1, .5], [.5, 1], [0, .5]],
            'shape-pentagon': [[.5, 0], [1, .38], [.82, 1], [.18, 1], [0, .38]],
            'shape-hexagon': [[.25, 0], [.75, 0], [1, .5], [.75, 1], [.25, 1], [0, .5]]
        };

        function applyFrame(el) {
            const kind = el.getAttribute('data-p-frame') || '';
            if (!kind) { ['--frame-img', '--frame-pad-x', '--frame-pad-y', '--frame-mask'].forEach(k => el.style.removeProperty(k)); return; }
            const shape = Array.from(el.classList).find(c => c.startsWith('shape-')) || 'shape-rect';
            const { w, h } = boxSize(el);
            const rvRaw = P(el, 'frame-r', '');
            const cfg = {
                sw: clamp(parseFloat(P(el, 'frame-w', '2')) || 1, 0.5, 30),
                color: /^#[0-9a-f]{6}$/i.test(P(el, 'frame-c', '#c9a86a')) ? P(el, 'frame-c', '#c9a86a') : '#c9a86a',
                dash: P(el, 'frame-dash', 'solid'),
                dl: Math.max(0.5, parseFloat(P(el, 'frame-dl', '10')) || 10),
                dg: Math.max(0, parseFloat(P(el, 'frame-dg', '8')) || 0),
                orn: P(el, 'frame-orn', '1') === '1',
                dbl: frameDblOf(el),
                rnd: P(el, 'frame-rnd', '1') === '1',
                radius: rvRaw === '' ? null : parseFloat(rvRaw),
                gap: clamp(parseFloat(P(el, 'frame-gap', '0')) || 0, 0, 100),
                shape: shape,
                poly: FRAME_POLY[shape] || null,
                ellipse: shape === 'shape-oval'
            };
            const r = frameSvg(kind, Math.round(w), Math.round(h), cfg);
            el.style.setProperty('--frame-img', `url("data:image/svg+xml,${encodeURIComponent(r.svg)}")`);
            el.style.setProperty('--frame-pad-x', r.padX.toFixed(2) + 'px');   // CSS 가 이만큼 블록 바깥으로 프레임을 내보냄
            el.style.setProperty('--frame-pad-y', r.padY.toFixed(2) + 'px');

            // 프레임 모양으로 이미지 자르기 (이미지 블록만. 삼각형·육각형·원형 등은 블록 모양이 이미 프레임 모양이라 필요 없음)
            const clipOn = el.getAttribute('data-type') === 'image' && P(el, 'clip', '0') === '1' && !cfg.poly && !cfg.ellipse;
            if (clipOn) {
                const c = frameSvg(kind, Math.round(w), Math.round(h), Object.assign({}, cfg, { sw: 0, orn: false, gap: 0, clip: true, poly: null, ellipse: false }));
                el.style.setProperty('--frame-mask', `url("data:image/svg+xml,${encodeURIComponent(c.svg)}")`);
            } else el.style.removeProperty('--frame-mask');
        }

        // 글/이미지 블록의 모양(자르기) 목록 — CSS 는 editor.css 의 .shape-* 와 짝입니다
        const BLOCK_SHAPES = [
            ['shape-rect', '직사각형'], ['shape-round', '둥근 사각형'], ['shape-pill', '알약형 (양끝 반원)'],
            ['shape-arch', '아치형 (위쪽 반원)'], ['shape-arch-soft', '아치형 (아래 모서리 살짝 둥글게)'],
            ['shape-leaf-a', '대각선 둥근 모서리 A'], ['shape-leaf-b', '대각선 둥근 모서리 B'], ['shape-corner', '한쪽 모서리만 크게 둥글게'],
            ['shape-chamfer', '모서리 깎은 사각형'],
            ['shape-oval', '원형 / 타원'], ['shape-triangle', '삼각형'], ['shape-rt-triangle', '직각삼각형'],
            ['shape-parallelogram', '평행사변형'], ['shape-trapezoid', '사다리꼴'], ['shape-diamond', '마름모'],
            ['shape-pentagon', '오각형'], ['shape-hexagon', '육각형']
        ];

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
                <div id="ctrlShapeLineTitle" style="${DECOR_SUB} font-weight:bold; ${kind === 'line' ? '' : 'display:none;'}">선 설정 (굵기 · 모양 · 점선 길이/간격)</div>
                <label id="ctrlShapeStrokeLbl" style="${DECOR_SUB} ${kind === 'line' ? 'display:none;' : ''}"><input type="checkbox" id="ctrlShapeStrokeOn" ${P(el, 'stroke-on', '1') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 선 (외곽선)</label>
                ${rgbPickerHtml('ctrlShapeStroke', P(el, 'stroke', '#c9a86a'))}
                <div class="panel-group" style="margin-bottom:4px;"><label>굵기 조절</label>
                    <input type="range" id="ctrlShapeStrokeWR" min="0.5" max="40" step="0.5" value="${esc(P(el, 'stroke-w', '3'))}" style="accent-color:#c9a86a; padding:0;"></div>
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
                <div id="ctrlShapeDashRow" style="display:${(kind === 'line' || dash !== 'solid') ? 'flex' : 'none'}; gap:6px;">
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
                $('ctrlShapeDashRow').style.display = (kind === 'line' || dash !== 'solid') ? 'flex' : 'none';
                $('ctrlShapeStrokeLbl').style.display = kind === 'line' ? 'none' : '';
                $('ctrlShapeLineTitle').style.display = kind === 'line' ? '' : 'none';
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
            // 굵기 슬라이더 ↔ 숫자칸 동기화
            $('ctrlShapeStrokeWR').addEventListener('input', e => {
                $('ctrlShapeStrokeW').value = e.target.value;
                setP(el, 'stroke-w', e.target.value); scheduleDecorRender(el);
            });
            $('ctrlShapeStrokeW').addEventListener('input', e => { $('ctrlShapeStrokeWR').value = e.target.value; });
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

            // 편집 창의 "보이는 부분" 틀을 이미지 블록과 같은 비율·같은 모양으로 맞춘다
            function fitCropBox() {
                if (!editingImageElement || !cropInnerBox) return;
                const w = editingImageElement.offsetWidth || 1, h = editingImageElement.offsetHeight || 1;
                const maxW = Math.max(40, cropPreviewContainer.clientWidth - 28);
                const maxH = Math.max(40, cropPreviewContainer.clientHeight - 28);
                const k = Math.min(maxW / w, maxH / h);
                const bw = Math.max(20, Math.round(w * k)), bh = Math.max(20, Math.round(h * k));
                [cropInnerBox, cropGhostBox].forEach(b => { if (b) { b.style.width = bw + 'px'; b.style.height = bh + 'px'; } });

                const shapeCls = Array.from(editingImageElement.classList).find(c => c.startsWith('shape-')) || 'shape-rect';
                cropInnerBox.className = shapeCls;                       // editor.css 의 .shape-* 가 #cropInnerBox 에도 적용됨
                const bg = editingImageElement.style.backgroundColor;
                cropInnerBox.style.background = (bg && bg !== 'transparent') ? `linear-gradient(${bg}, ${bg}), #0a0a10` : '#0a0a10';
                const fm = editingImageElement.style.getPropertyValue('--frame-mask');   // 프레임 모양 자르기 미리보기
                const fmv = (editingImageElement.getAttribute('data-p-clip') === '1' && fm) ? fm + ' center / 100% 100% no-repeat' : '';
                cropInnerBox.style.webkitMask = fmv; cropInnerBox.style.mask = fmv;

                if (cropRatioInfo) {
                    const name = (BLOCK_SHAPES.find(x => x[0] === shapeCls) || [0, '직사각형'])[1];
                    cropRatioInfo.textContent = `블록 ${Math.round(w)} × ${Math.round(h)}px (${(w / h).toFixed(2)} : 1) · ${name} — 밝은 부분이 실제로 보이는 영역`;
                }
            }

            function loadModalData() {
                if (!editingImageElement) return;
                const s = getImgState(editingImageElement, currentEditingTarget);
                imgOffsetX = s.x;
                imgOffsetY = s.y;
                [modalTargetImg, modalGhostImg].forEach(im => {
                    if (!im) return;
                    im.style.objectFit = 'contain';
                    im.style.left = '0';
                    im.style.top = '0';
                    im.style.transformOrigin = 'center center';
                    if (s.src) MZ.setImgSrc(im, normalizeImgUrl(s.src)); else im.removeAttribute('src');
                });
                modalImgScale.value = s.scale;
                fitCropBox();
                updateModalImageTransform(s.scale, imgOffsetX, imgOffsetY);
            }

            function updateModalImageTransform(scale, x, y) {
                const t = `translate(${x}%, ${y}%) scale(${scale})`;
                modalTargetImg.style.transform = t;
                if (modalGhostImg) modalGhostImg.style.transform = t;   // 틀 바깥은 흐리게 같이 움직임
            }

            // 확대/축소·위치를 블록에 반영
            function applyModalState(scale, x, y) {
                scale = clamp(Math.round(scale * 100) / 100, 0.5, 8);
                imgOffsetX = x; imgOffsetY = y;
                modalImgScale.value = scale;
                updateModalImageTransform(scale, x, y);
                const p = currentEditingTarget.toLowerCase();
                editingImageElement.setAttribute(`data-img-scale-${p}`, scale);
                editingImageElement.setAttribute(`data-img-posx-${p}`, x);
                editingImageElement.setAttribute(`data-img-posy-${p}`, y);
                updateImageTransforms(editingImageElement);
                saveState(editingImageElement);
            }

            // 꽉 채우기: 틀 안이 빈틈없이 차도록 확대 (이미지 비율과 틀 비율 차이만큼)
            if (modalFillBtn) modalFillBtn.addEventListener('click', () => {
                const iw = modalTargetImg.naturalWidth, ih = modalTargetImg.naturalHeight;
                if (!iw || !ih || !editingImageElement) return;
                const r = (iw / ih) / (cropInnerBox.clientWidth / cropInnerBox.clientHeight);
                applyModalState(Math.max(r, 1 / r), 0, 0);
            });
            if (modalResetBtn) modalResetBtn.addEventListener('click', () => { if (editingImageElement) applyModalState(1, 0, 0); });

            if (closeImgModal) closeImgModal.addEventListener('click', () => { imageEditModal.style.display = 'none'; });

            if (modalImgScale) {
                modalImgScale.addEventListener('input', (e) => {
                    applyModalState(parseFloat(e.target.value), imgOffsetX, imgOffsetY);
                });
            }

            if (cropPreviewContainer) {
                // 마우스 휠로 확대/축소
                cropPreviewContainer.addEventListener('wheel', (e) => {
                    if (!editingImageElement) return;
                    e.preventDefault();
                    applyModalState(parseFloat(modalImgScale.value || '1') + (e.deltaY < 0 ? 0.1 : -0.1), imgOffsetX, imgOffsetY);
                }, { passive: false });
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
                const frame = cropInnerBox.getBoundingClientRect();
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
                    imageEditModal.style.display = 'flex';
                    loadModalData();
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

            if (saveBtn) saveBtn.addEventListener('click', openSaveDialog);

            if (resetBtn) resetBtn.addEventListener('click', openResetDialog);
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
            const frameKind = el.getAttribute('data-p-frame') || '';

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
                        ${BLOCK_SHAPES.map(([v, n]) => `<option value="${v}" ${currentShape === v ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                </div>`;
            }

            let flipSelectorHtml = '';
            if (type === 'image') {
                const fd = P(el, 'flip', 'y');
                flipSelectorHtml = `
                <div class="panel-group" style="margin-top:6px;">
                    <label>마우스 오버 카드 뒤집기 방향</label>
                    <select id="ctrlFlipDir" style="width:100%; padding:4px;">
                        <option value="y" ${fd === 'y' ? 'selected' : ''}>좌우로 뒤집기 (기본)</option>
                        <option value="x" ${fd === 'x' ? 'selected' : ''}>위아래로 뒤집기</option>
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

            ${shapeSelectorHtml}${flipSelectorHtml}

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

                <div style="border-top:1px dotted rgba(201,168,106,0.3); margin-top:8px; padding-top:8px;">
                    <label style="font-size:0.85em; color:#c9a86a; display:block; margin-bottom:3px;">프레임 선모양 (장식 외곽선)</label>
                    <select id="ctrlFrameKind" style="width:100%; padding:3px;">
                        <option value="">없음</option>
                        ${FRAME_KINDS.map(([v, n]) => `<option value="${v}" ${frameKind === v ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                    <div id="ctrlFrameBox" style="${frameKind ? '' : 'display:none;'} margin-top:6px;">
                        <div style="display:flex; gap:6px; align-items:center; margin-bottom:4px;">
                            <input type="range" id="ctrlFrameWR" min="0.5" max="12" step="0.5" value="${esc(P(el, 'frame-w', '2'))}" style="accent-color:#c9a86a; flex:1; padding:0;" title="굵기">
                            <input type="number" id="ctrlFrameW" min="0.5" max="30" step="0.5" value="${esc(P(el, 'frame-w', '2'))}" style="width:58px; padding:3px; text-align:center;" title="굵기(px)">
                            <input type="color" id="ctrlFrameC" value="${esc(P(el, 'frame-c', '#c9a86a'))}" style="width:38px; height:26px; padding:0; background:#111; border:1px solid #444; cursor:pointer;">
                        </div>
                        <select id="ctrlFrameDash" style="width:100%; padding:3px; margin-bottom:4px;">
                            <option value="solid" ${P(el, 'frame-dash', 'solid') === 'solid' ? 'selected' : ''}>실선</option>
                            <option value="dashed" ${P(el, 'frame-dash', 'solid') === 'dashed' ? 'selected' : ''}>점선</option>
                            <option value="dotted" ${P(el, 'frame-dash', 'solid') === 'dotted' ? 'selected' : ''}>도트</option>
                        </select>
                        <div id="ctrlFrameDashRow" style="display:${P(el, 'frame-dash', 'solid') === 'solid' ? 'none' : 'flex'}; gap:6px; margin-bottom:4px;">
                            <div class="panel-group" style="flex:1; margin:0;" id="ctrlFrameDlWrap"><label>점선 길이</label><input type="number" id="ctrlFrameDl" min="0.5" max="200" step="0.5" value="${esc(P(el, 'frame-dl', '10'))}" style="padding:3px;"></div>
                            <div class="panel-group" style="flex:1; margin:0;"><label>간격</label><input type="number" id="ctrlFrameDg" min="0" max="200" step="0.5" value="${esc(P(el, 'frame-dg', '8'))}" style="padding:3px;"></div>
                        </div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px 8px; margin:2px 0 4px;">
                            <label style="font-size:0.8em; margin:0; display:block; cursor:pointer;"><input type="checkbox" id="ctrlFrameDbl" ${frameDblOf(el) ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 이중선</label>
                            <label style="font-size:0.8em; margin:0; display:block; cursor:pointer;"><input type="checkbox" id="ctrlFrameOrn" ${P(el, 'frame-orn', '1') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 반짝이 장식</label>
                            <label style="font-size:0.8em; margin:0; display:block; cursor:pointer;"><input type="checkbox" id="ctrlFrameRnd" ${P(el, 'frame-rnd', '1') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 모서리 둥글게</label>
                            ${type === 'image' ? `<label style="font-size:0.8em; margin:0; display:block; cursor:pointer;" title="프레임 안쪽 모양대로 이미지를 잘라냅니다"><input type="checkbox" id="ctrlFrameClip" ${P(el, 'clip', '0') === '1' ? 'checked' : ''} style="width:auto; accent-color:#c9a86a;"> 이미지 자르기</label>` : ''}
                        </div>
                        <div id="ctrlFrameRadiusRow" class="panel-group" style="margin-top:4px; ${P(el, 'frame-rnd', '1') === '1' ? '' : 'display:none;'}"><label>모서리 둥글기 (px, 비우면 자동)</label><input type="number" id="ctrlFrameR" min="0" max="500" value="${esc(P(el, 'frame-r', ''))}" placeholder="자동" style="padding:3px;"></div>
                        <div class="panel-group" style="margin-top:4px;"><label>블록과의 간격 (px)</label><input type="number" id="ctrlFrameGap" min="0" max="100" value="${esc(P(el, 'frame-gap', '0'))}" style="padding:3px;"></div>
                        <div style="font-size:0.7em; color:#9d947e; line-height:1.4; margin-top:4px;">프레임은 블록 바깥쪽에 둘러 그려져요(이미지 블록은 블록과 함께 뒤집힘). '이미지 자르기'를 켜면 프레임 안쪽 모양대로 이미지가 잘려요 (이때 블록 외곽선은 끄는 게 깔끔해요). 프레임만 쓰려면 위의 '외곽선 사용'을 끄세요.</div>
                    </div>
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
                    Array.from(el.classList).filter(c => c.startsWith('shape-')).forEach(c => el.classList.remove(c));
                    el.classList.add(e.target.value);
                    el.setAttribute('data-shape', e.target.value);
                    if (type === 'image') syncImageCard(el);
                    applyFrame(el);
                    saveState(el);
                });
            }

            const flipSelect = document.getElementById('ctrlFlipDir');
            if (flipSelect) flipSelect.addEventListener('change', e => {
                if (e.target.value === 'y') el.removeAttribute('data-p-flip'); else setP(el, 'flip', e.target.value);
                saveState(el);
            });

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
                if (type === 'image') syncImageCard(el);
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

            if (!decor) {
                const $f = id => document.getElementById(id);
                const frameSync = () => {
                    const k = el.getAttribute('data-p-frame') || '';
                    $f('ctrlFrameBox').style.display = k ? '' : 'none';
                    $f('ctrlFrameRadiusRow').style.display = P(el, 'frame-rnd', '1') === '1' ? '' : 'none';
                    $f('ctrlFrameDbl').checked = frameDblOf(el);
                    $f('ctrlFrameR').value = P(el, 'frame-r', '');
                    const d = P(el, 'frame-dash', 'solid');
                    $f('ctrlFrameDashRow').style.display = d === 'solid' ? 'none' : 'flex';
                    $f('ctrlFrameDlWrap').style.display = d === 'dotted' ? 'none' : '';
                };
                const frameSet = (key, v) => { setP(el, key, v); applyFrame(el); saveState(el); };
                $f('ctrlFrameKind').addEventListener('change', e => {
                    // 종류를 바꾸면 이중선·모서리 값은 새 종류의 기본값으로 되돌림
                    el.removeAttribute('data-p-frame-dbl'); el.removeAttribute('data-p-frame-r');
                    if (e.target.value) setP(el, 'frame', e.target.value); else el.removeAttribute('data-p-frame');
                    frameSync(); applyFrame(el); saveState(el);
                });
                $f('ctrlFrameWR').addEventListener('input', e => { $f('ctrlFrameW').value = e.target.value; frameSet('frame-w', e.target.value); });
                $f('ctrlFrameW').addEventListener('input', e => { $f('ctrlFrameWR').value = e.target.value; frameSet('frame-w', e.target.value); });
                $f('ctrlFrameC').addEventListener('input', e => frameSet('frame-c', e.target.value));
                $f('ctrlFrameDash').addEventListener('change', e => { frameSet('frame-dash', e.target.value); frameSync(); });
                $f('ctrlFrameDl').addEventListener('input', e => frameSet('frame-dl', e.target.value));
                $f('ctrlFrameDg').addEventListener('input', e => frameSet('frame-dg', e.target.value));
                $f('ctrlFrameOrn').addEventListener('change', e => frameSet('frame-orn', e.target.checked ? '1' : '0'));
                $f('ctrlFrameR').addEventListener('input', e => frameSet('frame-r', e.target.value));
                $f('ctrlFrameGap').addEventListener('input', e => frameSet('frame-gap', e.target.value));
                $f('ctrlFrameDbl').addEventListener('change', e => frameSet('frame-dbl', e.target.checked ? '1' : '0'));
                $f('ctrlFrameRnd').addEventListener('change', e => { frameSet('frame-rnd', e.target.checked ? '1' : '0'); frameSync(); });
                if ($f('ctrlFrameClip')) $f('ctrlFrameClip').addEventListener('change', e => frameSet('clip', e.target.checked ? '1' : '0'));
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
            if (document.getElementById('mzGhPicker') || document.getElementById('mzResetModal') || document.getElementById('mzSaveModal')) return;   // 창이 열려 있을 때

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

// =================================================================
        //  초기화 창 (요소 종류별로 골라서 지우기) / 저장 창 (사이트 저장 + 템플릿 슬롯)
        // =================================================================
        function openMzModal(id, title) {
            const old = document.getElementById(id);
            if (old) old.remove();
            const ov = document.createElement('div');
            ov.id = id;
            ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:1000003; display:flex; align-items:center; justify-content:center; font-family:"Nanum Myeongjo",serif; color:#ece5d3;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#14101e; border:1px solid #c9a86a; border-radius:8px; width:min(460px, 94vw); max-height:90vh; overflow-y:auto; padding:16px; box-sizing:border-box; box-shadow:0 15px 40px rgba(0,0,0,0.7); font-size:0.9em;';
            box.innerHTML = '<div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; color:#c9a86a; border-bottom:1px solid rgba(201,168,106,0.3); padding-bottom:8px; margin-bottom:12px;"><span>' + title + '</span><button type="button" data-close style="background:none; border:none; color:#ff4757; font-size:1.1em; cursor:pointer;">✕</button></div>';
            ov.appendChild(box);
            document.body.appendChild(ov);
            function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
            function close() { document.removeEventListener('keydown', onKey, true); ov.remove(); }
            document.addEventListener('keydown', onKey, true);
            box.querySelector('[data-close]').addEventListener('click', close);
            ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
            return { box: box, close: close };
        }
        const MZ_BTN = 'border:1px solid #c9a86a; background:#1f1f2a; color:#ece5d3; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.9em;';
        const modeLabel = isMainPage ? (MZ.getTheme() === 'light' ? '라이트' : '다크') + ' 모드' : '';

        // ── 초기화 ──
        const RESET_GROUPS = [
            { label: '글', types: ['text', 'default'] },
            { label: '달력', types: ['calendar'] },
            { label: '이미지', types: ['image'] },
            { label: '스티커', types: ['sticker'] },
            { label: '도형', types: ['shape'] },
            { label: '효과', types: ['effect'] }
        ];
        function removeBlocks(list) {
            snapNow();   // 직전까지의 변경을 먼저 한 단계로 확정 (그래야 Ctrl+Z 가 지우기 직전 상태로 돌아감)
            list.forEach(function (e) { e.remove(); });
            clearSelection();
            if (panelContent) panelContent.innerHTML = '<p style="margin: 0; color: #9d947e; font-size: 0.8em;">요소를 클릭하면 상세 편집 옵션이 나타납니다.</p>';
            saveState();
            snapNow();   // 되돌리기(Ctrl+Z) 한 단계로 기록
        }
        function openResetDialog() {
            if (!loaded) { alert('아직 불러오는 중이거나 불러오기에 실패했습니다. 새로고침 후 다시 시도하세요.'); return; }
            const all = Array.from(gallery.querySelectorAll('.editable-element'));
            const typeOf = e => e.getAttribute('data-type') || 'default';
            const m = openMzModal('mzResetModal', '🧹 초기화' + (modeLabel ? ' <span style="font-weight:normal; font-size:0.85em; color:#9d947e;">(' + modeLabel + ')</span>' : ''));
            const box = m.box;
            box.insertAdjacentHTML('beforeend', '<div style="color:#9d947e; font-size:0.85em; line-height:1.5; margin-bottom:10px;">지울 요소 종류를 고르세요. 여러 개를 고르면 고른 것만 지워지고 나머지는 그대로 남습니다.<br>지운 뒤 <b>저장</b>을 눌러야 사이트에 반영되며, 그 전에는 Ctrl+Z로 되돌릴 수 있습니다.</div>');
            const list = document.createElement('div');
            list.style.cssText = 'display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:12px;';
            const checks = [];
            RESET_GROUPS.forEach(function (g) {
                const n = all.filter(e => g.types.indexOf(typeOf(e)) >= 0).length;
                const lab = document.createElement('label');
                lab.style.cssText = 'display:flex; align-items:center; gap:6px; padding:7px 9px; border:1px solid rgba(201,168,106,0.3); border-radius:4px; cursor:' + (n ? 'pointer' : 'default') + '; opacity:' + (n ? '1' : '0.4') + ';';
                lab.innerHTML = '<input type="checkbox" ' + (n ? '' : 'disabled') + ' style="accent-color:#c9a86a;"><span>' + g.label + '</span><span style="margin-left:auto; color:#9d947e; font-size:0.85em;">' + n + '개</span>';
                const cb = lab.querySelector('input');
                checks.push({ cb: cb, g: g, n: n });
                list.appendChild(lab);
            });
            box.appendChild(list);

            const row = document.createElement('div');
            row.style.cssText = 'display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;';
            const partBtn = document.createElement('button');
            partBtn.type = 'button'; partBtn.textContent = '선택한 것만 초기화'; partBtn.style.cssText = MZ_BTN;
            const allBtn = document.createElement('button');
            allBtn.type = 'button'; allBtn.textContent = '전체 초기화'; allBtn.style.cssText = 'border:none; background:#ff4757; color:#fff; font-weight:bold; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.9em;';
            row.appendChild(partBtn); row.appendChild(allBtn);
            box.appendChild(row);

            partBtn.addEventListener('click', function () {
                const picked = checks.filter(c => c.cb.checked);
                if (!picked.length) { alert('지울 요소 종류를 하나 이상 선택해주세요.'); return; }
                const types = [].concat.apply([], picked.map(c => c.g.types));
                const targets = all.filter(e => types.indexOf(typeOf(e)) >= 0);
                const names = picked.map(c => c.g.label + ' ' + c.n + '개').join(', ');
                if (!confirm('다음 요소를 지웁니다.\n' + names + '\n\n계속할까요?')) return;
                removeBlocks(targets);
                m.close();
                alert(targets.length + '개 요소를 지웠습니다.\n저장을 눌러야 사이트에 반영됩니다. (Ctrl+Z로 되돌리기)');
            });
            allBtn.addEventListener('click', function () {
                if (!all.length) { alert('지울 요소가 없습니다.'); return; }
                if (!confirm('현재 페이지' + (modeLabel ? '(' + modeLabel + ')' : '') + '의 모든 요소 ' + all.length + '개를 지웁니다.\n\n계속할까요?')) return;
                removeBlocks(all);
                m.close();
                alert('모든 요소를 지웠습니다.\n저장을 눌러야 사이트에 반영됩니다. (Ctrl+Z로 되돌리기)');
            });
        }

        // ── 템플릿 슬롯 (현재 페이지 / 현재 모드의 배치와 설정 전체를 Supabase 에 5칸까지 보관) ──
        // 이미지 파일 자체는 저장하지 않고 주소와 설정값만 저장하므로 슬롯 하나는 블록 수 × 1~2KB 정도입니다.
        const SLOT_COUNT = 5;
        const slotId = n => 'slot_' + PAGE + '_' + n;
        async function listSlots() {
            const ids = [];
            for (let i = 1; i <= SLOT_COUNT; i++) ids.push(slotId(i));
            const res = await sb.from(TABLE).select('id,content').in('id', ids);
            if (res.error) throw res.error;
            const map = {};
            (res.data || []).forEach(function (r) {
                let meta = null;
                try { meta = JSON.parse(r.content || 'null'); } catch (e) { }
                map[r.id] = meta || { name: '', count: 0, savedAt: '' };
            });
            return map;
        }
        async function saveSlot(n, name) {
            const blocks = Array.from(gallery.querySelectorAll('.editable-element')).map(serializeData).filter(Boolean);
            const meta = { name: name || ('슬롯 ' + n), savedAt: new Date().toISOString(), count: blocks.length };
            const res = await sb.from(TABLE).upsert([{
                id: slotId(n), page_name: '__slot__', type: 'slot',
                content: JSON.stringify(meta), layout_data: { v: 1, page: PAGE, blocks: blocks }
            }]);
            if (res.error) throw res.error;
            return meta;
        }
        async function fetchSlotBlocks(n) {
            const res = await sb.from(TABLE).select('layout_data').eq('id', slotId(n)).maybeSingle();
            if (res.error) throw res.error;
            let d = res.data && res.data.layout_data;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            return (d && Array.isArray(d.blocks)) ? d.blocks : null;
        }
        function applySlotBlocks(blocks) {
            snapNow();
            restoreSnapshot(JSON.stringify(blocks));   // 현재 화면을 슬롯 내용으로 교체 (되돌리기 지원)
            dirty = true;
            snapNow();
        }
        const fmtDate = iso => { try { const d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); } catch (e) { return ''; } };

        async function openSaveDialog() {
            if (!sb) { alert('Supabase 연결이 되어 있지 않습니다.'); return; }
            if (!loaded) { alert('불러오기에 실패한 상태라 저장을 막았습니다. 새로고침 후 다시 시도하세요.'); return; }
            const m = openMzModal('mzSaveModal', '💾 저장' + (modeLabel ? ' <span style="font-weight:normal; font-size:0.85em; color:#9d947e;">(' + modeLabel + ')</span>' : ''));
            const box = m.box;
            box.insertAdjacentHTML('beforeend', '<div style="color:#9d947e; font-size:0.85em; line-height:1.5; margin-bottom:10px;">현재 화면을 사이트에 저장합니다. 템플릿 슬롯을 고르면 같은 배치를 그 슬롯에도 보관해 두고, 나중에 [불러오기]로 되돌릴 수 있습니다. (슬롯은 이 페이지' + (modeLabel ? '의 ' + modeLabel : '') + ' 전용)</div>');
            const listEl = document.createElement('div');
            listEl.innerHTML = '<div style="color:#9d947e; padding:8px 0;">슬롯 목록을 불러오는 중...</div>';
            box.appendChild(listEl);

            const nameWrap = document.createElement('div');
            nameWrap.style.cssText = 'margin:10px 0; display:none;';
            nameWrap.innerHTML = '<input type="text" data-slot-name maxlength="30" placeholder="슬롯 이름 (선택)" style="width:100%; background:#111; border:1px solid #444; color:#ece5d3; padding:6px; border-radius:3px; box-sizing:border-box; font-size:0.9em;">';
            box.appendChild(nameWrap);
            const nameInput = nameWrap.querySelector('input');

            const foot = document.createElement('div');
            foot.style.cssText = 'display:flex; gap:6px; justify-content:flex-end; margin-top:10px;';
            const okBtn = document.createElement('button');
            okBtn.type = 'button'; okBtn.textContent = '저장'; okBtn.style.cssText = 'border:none; background:#2ed573; color:#111; font-weight:bold; padding:6px 18px; border-radius:4px; cursor:pointer; font-size:0.9em;';
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button'; cancelBtn.textContent = '취소'; cancelBtn.style.cssText = MZ_BTN;
            foot.appendChild(okBtn); foot.appendChild(cancelBtn);
            box.appendChild(foot);
            cancelBtn.addEventListener('click', m.close);

            let metas = {};
            let slotsOk = true;
            try { metas = await listSlots(); } catch (e) { slotsOk = false; console.error('슬롯 목록 실패', e); }

            const rowStyle = 'display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid rgba(201,168,106,0.3); border-radius:4px; margin-bottom:6px;';
            function redraw() {
                listEl.innerHTML = '';
                if (!slotsOk) {
                    listEl.innerHTML = '<div style="color:#ff8a94; font-size:0.85em; padding:6px 0;">템플릿 슬롯을 불러오지 못했습니다. (사이트에만 저장할 수 있습니다)</div>';
                    return;
                }
                const mk = (value, html, checked) => {
                    const lab = document.createElement('label');
                    lab.style.cssText = rowStyle + 'cursor:pointer;';
                    lab.innerHTML = '<input type="radio" name="mzSlot" value="' + value + '" ' + (checked ? 'checked' : '') + ' style="accent-color:#c9a86a;">' + html;
                    listEl.appendChild(lab);
                    return lab;
                };
                mk(0, '<span>슬롯에는 저장하지 않음 (사이트에만 저장)</span>', true);
                for (let i = 1; i <= SLOT_COUNT; i++) {
                    const meta = metas[slotId(i)];
                    const info = meta
                        ? '<span style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">' + esc(meta.name || ('슬롯 ' + i)) + ' <span style="color:#9d947e; font-size:0.8em;">· ' + (meta.count || 0) + '개 · ' + esc(fmtDate(meta.savedAt)) + '</span></span>'
                        : '<span style="flex:1; color:#9d947e;">슬롯 ' + i + ' · 비어 있음</span>';
                    const lab = mk(i, info, false);
                    if (meta) {
                        const loadB = document.createElement('button');
                        loadB.type = 'button'; loadB.textContent = '불러오기'; loadB.style.cssText = MZ_BTN + 'padding:3px 8px; font-size:0.8em;';
                        const delB = document.createElement('button');
                        delB.type = 'button'; delB.textContent = '삭제'; delB.style.cssText = 'border:1px solid #ff4757; background:none; color:#ff4757; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:0.8em;';
                        loadB.addEventListener('click', async function (ev) {
                            ev.preventDefault(); ev.stopPropagation();
                            if (!confirm('현재 화면을 슬롯 ' + i + ' 의 내용으로 교체합니다.\n(저장을 누르기 전까지 사이트에는 반영되지 않고, Ctrl+Z로 되돌릴 수 있습니다)\n\n계속할까요?')) return;
                            try {
                                const blocks = await fetchSlotBlocks(i);
                                if (!blocks) { alert('슬롯 내용을 읽지 못했습니다.'); return; }
                                applySlotBlocks(blocks);
                                m.close();
                                alert('슬롯 ' + i + ' 을(를) 불러왔습니다.\n마음에 들면 저장을 눌러 사이트에 반영하세요.');
                            } catch (e) { alert('불러오기 실패: ' + (e.message || e)); }
                        });
                        delB.addEventListener('click', async function (ev) {
                            ev.preventDefault(); ev.stopPropagation();
                            if (!confirm('슬롯 ' + i + ' 을(를) 삭제할까요? (되돌릴 수 없습니다)')) return;
                            const r = await sb.from(TABLE).delete().eq('id', slotId(i));
                            if (r.error) { alert('삭제 실패: ' + r.error.message); return; }
                            delete metas[slotId(i)];
                            redraw();
                        });
                        lab.appendChild(loadB); lab.appendChild(delB);
                    }
                }
                listEl.querySelectorAll('input[name="mzSlot"]').forEach(function (r) {
                    r.addEventListener('change', function () {
                        const v = parseInt(r.value, 10);
                        nameWrap.style.display = v ? 'block' : 'none';
                        if (v) { const meta = metas[slotId(v)]; nameInput.value = meta ? (meta.name || '') : ''; nameInput.placeholder = '슬롯 이름 (비우면 "슬롯 ' + v + '")'; }
                    });
                });
            }
            redraw();

            okBtn.addEventListener('click', async function () {
                const sel = listEl.querySelector('input[name="mzSlot"]:checked');
                const n = sel ? parseInt(sel.value, 10) : 0;
                if (n && metas[slotId(n)] && !confirm('슬롯 ' + n + ' 에 이미 저장된 템플릿이 있습니다. 덮어쓸까요?')) return;
                okBtn.disabled = true; cancelBtn.disabled = true;
                const ok = await saveAll(true);
                if (!ok) { okBtn.disabled = false; cancelBtn.disabled = false; return; }
                if (n) {
                    try {
                        await saveSlot(n, nameInput.value.trim());
                    } catch (e) {
                        alert('사이트에는 저장했지만 슬롯 저장에 실패했습니다: ' + (e.message || e));
                        m.close();
                        return;
                    }
                }
                m.close();
                alert(n ? '레이아웃을 저장했고, 슬롯 ' + n + ' 에도 보관했습니다.' : '레이아웃이 저장되었습니다!');
            });
        }

        async function saveAll(silent) {
            if (!sb) { alert('Supabase 연결이 되어 있지 않습니다.'); return false; }
            if (!loaded) { alert('불러오기에 실패한 상태라 저장을 막았습니다. 새로고침 후 다시 시도하세요.'); return false; }

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
                if (silent !== true) alert('레이아웃이 저장되었습니다!');
                return true;
            } catch (err) {
                alert('저장 실패: ' + (err.message || err));
                return false;
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
            if (!decor) {
                applyFrame(el);   // 저장된 프레임 설정 복원 (칸 크기가 바뀌면 다시 그림)
                if (window.ResizeObserver) new ResizeObserver(() => applyFrame(el)).observe(el);
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