/* =====================================================================
   MAFIAZ 공통 스크립트 (메인 / Character / Gallery 가 함께 사용)
   ===================================================================== */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://hkwarwmmkzubqvwwyazp.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd2Fyd21ta3p1YnF2d3d5YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI0ODYsImV4cCI6MjEwNzgwODQ4Nn0.vInox6kk9Md6t2eayA05G8Lax2oP92SBl6HF_2XdJA8';

    const ADMIN_ID = 'admin';
    const ADMIN_PW = '1111';
    const ADMIN_KEY = 'mafiaz_admin_login';

    const cs = document.currentScript;
    const ROOT = (cs && cs.src) ? new URL('./', cs.src).href : location.href;

    const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
    window.mafiazSb = sb;

    const esc = s => String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    function hexToRgba(hex, alpha) {
        let c = String(hex || '#000000').replace('#', '');
        if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
        const num = parseInt(c, 16);
        return 'rgba(' + ((num >> 16) & 255) + ', ' + ((num >> 8) & 255) + ', ' + (num & 255) + ', ' + alpha + ')';
    }

    function imgUrlBase(u) {
        u = String(u || '').trim();
        if (!u) return '';
        const m = u.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|raw)\/([^?#]+)/i);
        if (m) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3];
        if (/^https?:\/\//i.test(u) || u.charAt(0) === '/') return u;
        return new URL(u.replace(/^\.\//, ''), ROOT).href;
    }
    // 주소 뒤의 "#crop=x,y,w,h" (이미지 일부만 쓰는 영역, 0~1 비율)는 그대로 보존
    function imgUrl(u) {
        u = String(u || '').trim();
        const i = u.indexOf('#crop=');
        if (i < 0) return imgUrlBase(u);
        const base = imgUrlBase(u.slice(0, i));
        return base ? base + u.slice(i) : '';
    }

    // ── 이미지 일부 자르기: 파일을 따로 만들지 않고, 원본을 한 번만 받아 필요한 영역만 canvas 로 잘라 쓴다 ──
    const imgLoadCache = new Map();
    const cropCache = new Map();
    function loadImgCors(url) {
        if (!imgLoadCache.has(url)) {
            imgLoadCache.set(url, new Promise((res, rej) => {
                const im = new Image();
                im.crossOrigin = 'anonymous';
                im.onload = () => res(im);
                im.onerror = () => { imgLoadCache.delete(url); rej(new Error('load')); };
                im.src = url;
            }));
        }
        return imgLoadCache.get(url);
    }
    // 화면에 쓸 수 있는 주소로 바꿔 줌 (자르기 영역이 있으면 잘린 조각의 blob 주소, 실패하면 원본 전체)
    function resolveImgSrc(url) {
        url = String(url || '');
        const m = url.match(/^(.*)#crop=([\d.]+),([\d.]+),([\d.]+),([\d.]+)$/);
        if (!m) return Promise.resolve(url);
        if (cropCache.has(url)) return cropCache.get(url);
        const p = loadImgCors(m[1]).then(im => {
            const nw = im.naturalWidth, nh = im.naturalHeight;
            const sx = Math.min(nw - 1, Math.max(0, Math.round(+m[2] * nw)));
            const sy = Math.min(nh - 1, Math.max(0, Math.round(+m[3] * nh)));
            const sw = Math.max(1, Math.min(nw - sx, Math.round(+m[4] * nw)));
            const sh = Math.max(1, Math.min(nh - sy, Math.round(+m[5] * nh)));
            const cv = document.createElement('canvas');
            cv.width = sw; cv.height = sh;
            cv.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
            return new Promise((res, rej) => cv.toBlob(b => b ? res(URL.createObjectURL(b)) : rej(new Error('blob')), 'image/png'));
        }).catch(() => m[1]);
        cropCache.set(url, p);
        return p;
    }
    function setImgSrc(img, url) {
        img._want = url;
        if (!/#crop=/.test(url)) { img.src = url; return; }
        resolveImgSrc(url).then(r => { if (img._want === url) img.src = r; });
    }

    // =====================================================================
    //  GitHub 이미지 선택 창 (스티커 / 효과 / 이미지 블록의 "GitHub에서 선택" 버튼이 사용)
    //  - 저장소 폴더를 직접 보고 파일을 고르면 raw.githubusercontent.com 주소를 돌려준다.
    //  - 저장소는 아래 GH_DEFAULT.repo 에 'owner/repo' 로 적어 두거나, 비워 두면
    //    github.io 주소에서 자동으로 알아낸다. 그래도 모르면 창에서 한 번 입력하면 기억한다.
    //  - 공개 저장소만 불러올 수 있다 (GitHub API 비로그인 한도: 시간당 60회, 폴더 열 때마다 1회)
    // =====================================================================
    const GH_DEFAULT = { repo: '', branch: '', path: '' };
    const GH_KEY = 'mafiaz_gh_cfg';
    const GH_IMG = /\.(png|jpe?g|gif|webp|apng|svg|avif|bmp)$/i;
    const GH_VID = /\.(mp4|webm)$/i;
    const ghCache = {};
    const ghBranch = {};

    function ghLoadCfg() {
        let c = {};
        try { c = JSON.parse(localStorage.getItem(GH_KEY) || '{}') || {}; } catch (e) { }
        return { size: c.size, bg: c.bg, fmt: c.fmt, repo: c.repo || GH_DEFAULT.repo || ghDetectRepo(), branch: c.branch || GH_DEFAULT.branch || '', path: (c.path !== undefined ? c.path : GH_DEFAULT.path) || '' };
    }
    function ghSaveCfg(c) { try { localStorage.setItem(GH_KEY, JSON.stringify(c)); } catch (e) { } }
    function ghDetectRepo() {
        const h = location.hostname;
        if (!/\.github\.io$/i.test(h)) return '';
        const owner = h.split('.')[0];
        const seg = location.pathname.split('/').filter(Boolean)[0];
        const repo = (seg && !/\.[a-z0-9]+$/i.test(seg)) ? seg : owner + '.github.io';
        return owner + '/' + repo;
    }
    const ghEnc = p => String(p || '').split('/').filter(Boolean).map(encodeURIComponent).join('/');

    async function ghList(repo, branch, path) {
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('저장소는 owner/repo 형식으로 입력하세요. (예: myname/mafiaz)');
        if (!branch) {
            if (!ghBranch[repo]) {
                const r0 = await fetch('https://api.github.com/repos/' + repo);
                if (r0.status === 404) throw new Error('저장소를 찾을 수 없습니다. 이름을 확인하세요. (비공개 저장소는 불러올 수 없습니다)');
                if (r0.status === 403) throw new Error('GitHub 요청 한도(시간당 60회)를 넘었습니다. 잠시 후 다시 시도하세요.');
                const j0 = await r0.json();
                ghBranch[repo] = j0.default_branch || 'main';
            }
            branch = ghBranch[repo];
        }
        const key = repo + '@' + branch + ':' + path;
        if (ghCache[key]) return ghCache[key];
        const url = 'https://api.github.com/repos/' + repo + '/contents/' + ghEnc(path) + '?ref=' + encodeURIComponent(branch);
        const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
        if (r.status === 404) throw new Error('폴더를 찾을 수 없습니다: /' + path);
        if (r.status === 403) throw new Error('GitHub 요청 한도(시간당 60회)를 넘었습니다. 잠시 후 다시 시도하세요.');
        if (!r.ok) throw new Error('불러오기 실패 (' + r.status + ')');
        const arr = await r.json();
        if (!Array.isArray(arr)) throw new Error('폴더가 아니라 파일입니다.');
        const items = arr.map(it => ({ name: it.name, type: it.type === 'dir' ? 'dir' : 'file', path: it.path }))
            .sort((a, b) => (a.type === b.type ? 0 : (a.type === 'dir' ? -1 : 1)) || a.name.localeCompare(b.name, 'ko', { numeric: true }));
        return (ghCache[key] = { branch: branch, items: items });
    }

    // 저장소의 Pages 주소 (project: owner.github.io/repo/ , user: owner.github.io/)
    function ghPagesBase(repo) {
        const p = repo.split('/');
        return (p[1].toLowerCase() === p[0].toLowerCase() + '.github.io') ? 'https://' + p[0] + '.github.io/' : 'https://' + p[0] + '.github.io/' + p[1] + '/';
    }
    // 이 사이트가 같은 저장소의 Pages 에서 돌아가면 common.js 위치 기준 상대 경로를 돌려줌 (아니면 null)
    function ghRelPath(repo, path) {
        const base = ghPagesBase(repo);
        if (ROOT.toLowerCase().indexOf(base.toLowerCase()) !== 0) return null;
        const ups = ROOT.slice(base.length).split('/').filter(Boolean).length;
        return new Array(ups + 1).join('../') + ghEnc(path);
    }
    async function ghHeadOk(url) {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 5000);
        try { const r = await fetch(url, { method: 'HEAD', signal: ctl.signal, cache: 'no-store' }); return r.ok; }
        catch (e) { return false; } finally { clearTimeout(t); }
    }
    // 고른 파일이 실제로 열리는 가장 빠른 주소를 정한다 (상대 경로 → Pages → raw 순으로 확인)
    async function ghFinalUrl(repo, branch, path, fmt) {
        const raw = 'https://raw.githubusercontent.com/' + repo + '/' + branch + '/' + ghEnc(path);
        if (fmt === 'raw') return { url: raw };
        const pages = ghPagesBase(repo) + ghEnc(path);
        const cand = (fmt === 'auto' && ghRelPath(repo, path)) || pages;
        if (await ghHeadOk(new URL(cand, ROOT).href)) return { url: cand };
        return { url: raw, fallback: true };
    }
    function mzToast(msg) {
        const d = document.createElement('div');
        d.textContent = msg;
        d.style.cssText = 'position:fixed; left:50%; bottom:40px; transform:translateX(-50%); background:rgba(20,16,30,0.95); color:#ece5d3; border:1px solid #c9a86a; padding:10px 16px; border-radius:6px; z-index:1000002; font-size:0.85em; font-family:"Nanum Myeongjo",serif; max-width:90vw; box-shadow:0 8px 24px rgba(0,0,0,0.5);';
        document.body.appendChild(d);
        setTimeout(() => d.remove(), 6000);
    }

    // opts: { accept: 'image' | 'media', onPick(url, name, { ratio }) }  — 자르기를 했으면 url 끝에 #crop=x,y,w,h, ratio = 잘린 조각의 가로/세로
    function pickGithubImage(opts) {
        opts = opts || {};
        const media = opts.accept === 'media';
        const old = document.getElementById('mzGhPicker');
        if (old) old.remove();

        const cfg = ghLoadCfg();
        let curPath = cfg.path;
        let seq = 0;

        const ov = document.createElement('div');
        ov.id = 'mzGhPicker';
        ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000001; display:flex; align-items:center; justify-content:center; font-family:"Nanum Myeongjo",serif; color:#ece5d3;';
        ov.innerHTML =
            '<div style="background:#14101e; border:1px solid #c9a86a; border-radius:8px; width:min(1000px, 96vw); height:min(780px, 92vh); display:flex; flex-direction:column; box-shadow:0 15px 40px rgba(0,0,0,0.7); box-sizing:border-box; padding:14px; gap:8px;">' +
              '<div style="display:flex; align-items:center; justify-content:space-between;">' +
                '<span style="font-weight:bold; color:#c9a86a;">GitHub 이미지 선택</span>' +
                '<button type="button" id="ghClose" style="background:none; border:none; color:#9d947e; font-size:1.2em; cursor:pointer;">✕</button>' +
              '</div>' +
              '<div style="display:flex; gap:6px;">' +
                '<input type="text" id="ghRepo" placeholder="저장소 (owner/repo)" style="flex:2; min-width:0; background:#111; border:1px solid #444; color:#ece5d3; padding:5px; border-radius:3px; font-size:0.85em;">' +
                '<input type="text" id="ghBranch" placeholder="브랜치 (비우면 기본)" style="flex:1; min-width:0; background:#111; border:1px solid #444; color:#ece5d3; padding:5px; border-radius:3px; font-size:0.85em;">' +
                '<button type="button" id="ghGo" style="background:#c9a86a; border:none; color:#111; font-weight:bold; padding:0 12px; border-radius:3px; cursor:pointer; font-size:0.85em;">열기</button>' +
              '</div>' +
              '<div style="display:flex; gap:6px; align-items:center;">' +
                '<button type="button" id="ghUp" style="background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; padding:4px 10px; border-radius:3px; cursor:pointer; font-size:0.8em;">⬆ 상위 폴더</button>' +
                '<span id="ghPath" style="flex:1; min-width:0; font-size:0.8em; color:#9d947e; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>' +
                '<input type="text" id="ghSearch" placeholder="파일 이름 검색" style="width:140px; background:#111; border:1px solid #444; color:#ece5d3; padding:4px 6px; border-radius:3px; font-size:0.8em;">' +
              '</div>' +
              '<div style="display:flex; gap:8px; align-items:center; font-size:0.8em; color:#9d947e;">' +
                '<span>주소 형식</span><select id="ghFmt" style="background:#111; border:1px solid #444; color:#ece5d3; padding:3px; border-radius:3px; font-size:0.95em;"><option value="auto">자동 (상대 경로 우선)</option><option value="pages">GitHub Pages 주소</option><option value="raw">raw 주소</option></select>' +
                '<span style="margin-left:6px;">크기</span><input type="range" id="ghSize" min="90" max="320" step="10" style="flex:1; max-width:260px; accent-color:#c9a86a;">' +
                '<button type="button" id="ghBg" style="background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; padding:3px 10px; border-radius:3px; cursor:pointer; font-size:0.95em;"></button>' +
              '</div>' +
              '<div id="ghStatus" style="font-size:0.8em; color:#9d947e; min-height:1.2em;"></div>' +
              '<div id="ghGrid" style="flex:1 1 0; min-height:0; overflow-y:auto; overflow-x:hidden; display:grid; gap:10px; align-content:start; padding:2px 6px 2px 2px;"></div>' +
            '</div>';
        document.body.appendChild(ov);

        const $ = id => ov.querySelector('#' + id);
        const repoIn = $('ghRepo'), branchIn = $('ghBranch'), grid = $('ghGrid'), status = $('ghStatus'), search = $('ghSearch');
        repoIn.value = cfg.repo; branchIn.value = cfg.branch;

        // 썸네일 크기 / 배경 (투명 PNG 의 검정·흰색 선화가 모두 보이도록 배경을 바꿀 수 있음)
        const sizeIn = $('ghSize'), bgBtn = $('ghBg'), fmtSel = $('ghFmt');
        fmtSel.value = cfg.fmt || 'auto';
        let thumb = parseInt(cfg.size) || 160;
        let bgMode = parseInt(cfg.bg) || 0;
        const BG_NAMES = ['배경: 격자', '배경: 밝게', '배경: 어둡게'];
        const BG_CSS = [
            'background-color:#9a9a9a; background-image:conic-gradient(#b5b5b5 25%, #8a8a8a 0 50%, #b5b5b5 0 75%, #8a8a8a 0); background-size:16px 16px;',
            'background:#ececec;',
            'background:#0d0d14;'
        ];
        sizeIn.value = thumb; bgBtn.textContent = BG_NAMES[bgMode];
        function layoutGrid() {
            const boxH = Math.round(thumb * 0.85);
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(' + thumb + 'px, 1fr))';
            grid.style.gridAutoRows = (boxH + 36) + 'px';
            return boxH;
        }
        function saveView() { const c0 = ghLoadCfg(); ghSaveCfg(Object.assign(c0, { repo: repoIn.value.trim(), branch: branchIn.value.trim(), path: curPath, size: thumb, bg: bgMode, fmt: fmtSel.value })); }

        function close() { document.removeEventListener('keydown', onKey, true); ov.remove(); }
        function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
        document.addEventListener('keydown', onKey, true);
        $('ghClose').addEventListener('click', close);
        ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });

        let current = null;   // { branch, items }
        let busy = false;
        const canCrop = name => !/\.(gif|apng|svg)$/i.test(name) && !(media && /\.webp$/i.test(name));   // 움직이는 이미지는 자르면 멈추므로 제외

        async function finish(it, crop, nat) {
            if (busy) return;
            busy = true;
            status.style.color = '#9d947e';
            status.textContent = '주소 확인 중...';
            const repo = repoIn.value.trim();
            const r = await ghFinalUrl(repo, current.branch, it.path, fmtSel.value);
            let url = r.url, ratio = 0;
            if (crop) {
                url += '#crop=' + [crop.x, crop.y, crop.w, crop.h].map(v => v.toFixed(4)).join(',');
                ratio = (crop.w * nat.w) / (crop.h * nat.h);
            }
            close();
            if (r.fallback) mzToast('Pages 주소로 아직 열리지 않아 raw 주소로 넣었습니다. (방금 올린 파일은 Pages 반영까지 1~2분 걸립니다)');
            if (opts.onPick) opts.onPick(url, it.name, { ratio: ratio });
        }

        // 이미지에서 쓸 영역을 드래그로 지정 → 영역(비율)만 저장되고 파일은 만들어지지 않는다
        function showCrop(it) {
            const repo = repoIn.value.trim();
            const rawUrl = 'https://raw.githubusercontent.com/' + repo + '/' + current.branch + '/' + ghEnc(it.path);
            grid.style.display = 'none';
            const wrap = document.createElement('div');
            wrap.style.cssText = 'flex:1 1 0; min-height:0; display:flex; flex-direction:column; gap:8px;';
            const bs = 'background:#1f1f2a; border:1px solid #c9a86a; color:#ece5d3; padding:4px 10px; border-radius:3px; cursor:pointer; font-size:0.8em;';
            wrap.innerHTML =
                '<div style="flex:none; display:flex; gap:6px; flex-wrap:wrap; align-items:center;">' +
                  '<button type="button" id="ghCBack" style="' + bs + '">← 목록</button>' +
                  '<span id="ghCInfo" style="flex:1; min-width:120px; font-size:0.8em; color:#9d947e;"></span>' +
                  '<button type="button" id="ghCBg" style="' + bs + '"></button>' +
                  '<button type="button" id="ghCClear" style="' + bs + '">영역 지우기</button>' +
                  '<button type="button" id="ghCFull" style="' + bs + '">그대로 사용</button>' +
                  '<button type="button" id="ghCUse" style="background:#c9a86a; border:none; color:#111; font-weight:bold; padding:4px 12px; border-radius:3px; cursor:pointer; font-size:0.8em; opacity:0.4;" disabled>이 영역 사용</button>' +
                '</div>' +
                '<div id="ghCStage" style="flex:1 1 0; min-height:0; display:flex; align-items:center; justify-content:center; overflow:hidden; border-radius:4px;"></div>';
            ov.firstElementChild.appendChild(wrap);
            const w$ = id => wrap.querySelector('#' + id);
            const stage = w$('ghCStage'), info = w$('ghCInfo'), useBtn = w$('ghCUse');
            status.textContent = '이미지 위에서 드래그해서 쓸 부분을 지정하세요. 선택 영역은 끌어서 옮기고, 모서리로 크기를 바꿀 수 있습니다.';
            let cbg = bgMode;
            function paintBg() { stage.style.cssText = stage.style.cssText.replace(/background[^;]*;?/g, ''); stage.style.cssText += ';' + BG_CSS[cbg]; w$('ghCBg').textContent = BG_NAMES[cbg]; }
            w$('ghCBg').addEventListener('click', () => { cbg = (cbg + 1) % 3; paintBg(); });
            paintBg();

            const im = document.createElement('img');
            im.crossOrigin = 'anonymous';
            im.draggable = false;
            im.style.cssText = 'display:block; width:100%; height:100%; user-select:none; -webkit-user-drag:none; pointer-events:none;';
            const box = document.createElement('div');
            box.style.cssText = 'position:relative; overflow:hidden; touch-action:none; cursor:crosshair; flex:none;';
            const sel = document.createElement('div');
            sel.style.cssText = 'position:absolute; display:none; border:2px dashed #c9a86a; box-sizing:border-box; box-shadow:0 0 0 9999px rgba(0,0,0,0.55); cursor:move;';
            ['nw', 'ne', 'sw', 'se'].forEach(k => {
                const h = document.createElement('div');
                h.dataset.h = k;
                h.style.cssText = 'position:absolute; width:12px; height:12px; background:#c9a86a; border:1px solid #111; box-sizing:border-box; ' +
                    (k[0] === 'n' ? 'top:-7px;' : 'bottom:-7px;') + (k[1] === 'w' ? 'left:-7px;' : 'right:-7px;') + 'cursor:' + (k === 'nw' || k === 'se' ? 'nwse-resize' : 'nesw-resize') + ';';
                sel.appendChild(h);
            });
            box.appendChild(im); box.appendChild(sel);
            stage.appendChild(box);

            let nw = 0, nh = 0, W = 0, H = 0, rect = null;   // rect: 화면(px) 기준 {x,y,w,h}
            function fit() {
                const sw = stage.clientWidth - 8, sh = stage.clientHeight - 8;
                const k = Math.min(sw / nw, sh / nh, 4);
                const nW = Math.max(40, Math.round(nw * k)), nH = Math.max(40, Math.round(nh * k));
                if (rect && W) { rect = { x: rect.x * nW / W, y: rect.y * nH / H, w: rect.w * nW / W, h: rect.h * nH / H }; }
                W = nW; H = nH;
                box.style.width = W + 'px'; box.style.height = H + 'px';
                draw();
            }
            function draw() {
                if (!rect || rect.w < 2 || rect.h < 2) { sel.style.display = 'none'; useBtn.disabled = true; useBtn.style.opacity = '0.4'; info.textContent = '원본 ' + nw + ' × ' + nh + 'px'; return; }
                sel.style.display = 'block';
                sel.style.left = rect.x + 'px'; sel.style.top = rect.y + 'px'; sel.style.width = rect.w + 'px'; sel.style.height = rect.h + 'px';
                const ok = rect.w >= 6 && rect.h >= 6;
                useBtn.disabled = !ok; useBtn.style.opacity = ok ? '1' : '0.4';
                info.textContent = '원본 ' + nw + ' × ' + nh + 'px  →  선택 ' + Math.round(rect.w / W * nw) + ' × ' + Math.round(rect.h / H * nh) + 'px';
            }
            im.onload = () => { nw = im.naturalWidth; nh = im.naturalHeight; fit(); };
            im.onerror = () => { info.textContent = '이미지를 불러오지 못했습니다.'; };
            im.src = rawUrl;
            window.addEventListener('resize', onWinResize);
            function onWinResize() { if (nw) fit(); }

            const clampX = v => Math.min(W, Math.max(0, v)), clampY = v => Math.min(H, Math.max(0, v));
            let drag = null;
            box.addEventListener('pointerdown', e => {
                e.preventDefault();
                const b = box.getBoundingClientRect();
                const px = clampX(e.clientX - b.left), py = clampY(e.clientY - b.top);
                const hk = e.target.dataset && e.target.dataset.h;
                if (hk && rect) {
                    const ax = (hk[1] === 'w') ? rect.x + rect.w : rect.x;      // 반대쪽 모서리가 고정점
                    const ay = (hk[0] === 'n') ? rect.y + rect.h : rect.y;
                    drag = { mode: 'new', ax: ax, ay: ay };
                } else if (rect && e.target === sel) {
                    drag = { mode: 'move', ox: px - rect.x, oy: py - rect.y };
                } else {
                    drag = { mode: 'new', ax: px, ay: py };
                    rect = { x: px, y: py, w: 0, h: 0 };
                }
                box.setPointerCapture(e.pointerId);
            });
            box.addEventListener('pointermove', e => {
                if (!drag) return;
                const b = box.getBoundingClientRect();
                const px = clampX(e.clientX - b.left), py = clampY(e.clientY - b.top);
                if (drag.mode === 'move') {
                    rect.x = Math.min(W - rect.w, Math.max(0, px - drag.ox));
                    rect.y = Math.min(H - rect.h, Math.max(0, py - drag.oy));
                } else {
                    rect = { x: Math.min(drag.ax, px), y: Math.min(drag.ay, py), w: Math.abs(px - drag.ax), h: Math.abs(py - drag.ay) };
                }
                draw();
            });
            const endDrag = () => { drag = null; if (rect && (rect.w < 6 || rect.h < 6)) { rect = null; draw(); } };
            box.addEventListener('pointerup', endDrag);
            box.addEventListener('pointercancel', endDrag);

            function leave() { window.removeEventListener('resize', onWinResize); wrap.remove(); grid.style.display = 'grid'; render(); }
            w$('ghCBack').addEventListener('click', leave);
            w$('ghCClear').addEventListener('click', () => { rect = null; draw(); });
            w$('ghCFull').addEventListener('click', () => finish(it, null, null));
            useBtn.addEventListener('click', () => {
                if (!rect || !nw) return;
                finish(it, { x: rect.x / W, y: rect.y / H, w: rect.w / W, h: rect.h / H }, { w: nw, h: nh });
            });
        }
        function render() {
            grid.innerHTML = '';
            if (!current) return;
            const boxH = layoutGrid();
            const q = search.value.trim().toLowerCase();
            const repo = repoIn.value.trim();
            let shown = 0;
            current.items.forEach(it => {
                const isImg = GH_IMG.test(it.name), isVid = media && GH_VID.test(it.name);
                if (it.type === 'file' && !isImg && !isVid) return;
                if (q && it.name.toLowerCase().indexOf(q) < 0) return;
                shown++;
                const tile = document.createElement('div');
                tile.style.cssText = 'cursor:pointer; background:#1f1f2a; border:1px solid rgba(201,168,106,0.25); border-radius:4px; padding:4px; text-align:center; overflow:hidden; box-sizing:border-box; height:100%; display:flex; flex-direction:column; min-height:0;';
                const box = document.createElement('div');
                box.style.cssText = 'flex:none; height:' + boxH + 'px; display:flex; align-items:center; justify-content:center; border-radius:3px; overflow:hidden; font-size:' + Math.round(boxH * 0.4) + 'px; ' + (it.type === 'dir' ? BG_CSS[2] : BG_CSS[bgMode]);
                if (it.type === 'dir') {
                    box.textContent = '📁';
                } else {
                    const src = 'https://raw.githubusercontent.com/' + repo + '/' + current.branch + '/' + ghEnc(it.path);
                    const m = document.createElement(isVid ? 'video' : 'img');
                    m.src = src;
                    if (isVid) { m.muted = true; m.preload = 'metadata'; } else { m.loading = 'lazy'; }
                    m.style.cssText = 'width:100%; height:100%; object-fit:contain;';
                    box.appendChild(m);
                }
                const nm = document.createElement('div');
                nm.textContent = it.name;
                nm.title = it.name;
                nm.style.cssText = 'flex:none; font-size:0.75em; margin-top:4px; line-height:1.4; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
                tile.appendChild(box); tile.appendChild(nm);
                if (it.type === 'file' && isImg && canCrop(it.name)) {
                    const cb = document.createElement('button');
                    cb.type = 'button'; cb.textContent = '✂'; cb.title = '이 이미지에서 일부만 잘라서 사용';
                    cb.style.cssText = 'position:absolute; top:7px; right:7px; background:rgba(20,16,30,0.85); border:1px solid #c9a86a; color:#ece5d3; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.85em;';
                    cb.addEventListener('click', e => { e.stopPropagation(); showCrop(it); });
                    tile.style.position = 'relative';
                    tile.appendChild(cb);
                }
                tile.addEventListener('mouseenter', () => { tile.style.borderColor = '#c9a86a'; });
                tile.addEventListener('mouseleave', () => { tile.style.borderColor = 'rgba(201,168,106,0.25)'; });
                tile.addEventListener('click', () => {
                    if (it.type === 'dir') { curPath = it.path; load(); return; }
                    finish(it, null, null);
                });
                grid.appendChild(tile);
            });
            status.textContent = shown ? (shown + '개 항목') : (q ? '검색 결과가 없습니다.' : '이 폴더에는 선택할 수 있는 ' + (media ? '이미지/영상' : '이미지') + ' 파일이 없습니다.');
        }
        async function load() {
            const my = ++seq;
            const repo = repoIn.value.trim(), branch = branchIn.value.trim();
            $('ghPath').textContent = '/' + curPath;
            status.textContent = '불러오는 중...';
            grid.innerHTML = '';
            try {
                const res = await ghList(repo, branch, curPath);
                if (my !== seq) return;
                current = res;
                saveView();
                render();
            } catch (err) {
                if (my !== seq) return;
                current = null;
                status.style.color = '#ff6b78';
                status.textContent = err.message || String(err);
                setTimeout(() => { status.style.color = '#9d947e'; }, 0);
            }
        }
        $('ghUp').addEventListener('click', () => { curPath = curPath.split('/').filter(Boolean).slice(0, -1).join('/'); load(); });
        $('ghGo').addEventListener('click', () => { curPath = ''; load(); });
        [repoIn, branchIn].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { curPath = ''; load(); } }));
        search.addEventListener('input', render);
        sizeIn.addEventListener('input', () => { thumb = parseInt(sizeIn.value) || 160; render(); });
        sizeIn.addEventListener('change', saveView);
        fmtSel.addEventListener('change', saveView);
        bgBtn.addEventListener('click', () => { bgMode = (bgMode + 1) % 3; bgBtn.textContent = BG_NAMES[bgMode]; render(); saveView(); });

        if (repoIn.value) load();
        else { status.textContent = '저장소를 owner/repo 형식으로 입력하고 [열기]를 누르세요. (한 번 입력하면 기억합니다)'; repoIn.focus(); }
    }

    function isAdmin() {
        try { return localStorage.getItem(ADMIN_KEY) === '1'; } catch (e) { return false; }
    }

    function initLogin(opts) {
        opts = opts || {};
        const admin = isAdmin();

        let btn = document.getElementById('adminEntryBtn');
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button'; btn.id = 'adminEntryBtn';
            btn.innerHTML = '<i class="fa fa-cog"></i> 관리자';
            document.body.appendChild(btn);
        }
        let overlay = document.getElementById('loginOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loginOverlay';
            overlay.innerHTML =
                '<form id="loginForm">' +
                '<button type="button" class="close-login-btn">✕</button>' +
                '<div class="login-title">MAFIAZ 관리자 로그인</div>' +
                '<input type="text" id="loginEmail" placeholder="아이디" autocomplete="username" required>' +
                '<input type="password" id="loginPw" placeholder="비밀번호" autocomplete="current-password" required>' +
                '<button type="submit">로그인</button>' +
                '<div id="loginMsg"></div></form>';
            document.body.appendChild(overlay);
        }
        const form = overlay.querySelector('#loginForm');
        const msg = overlay.querySelector('#loginMsg');

        function setBtn() { btn.style.display = isAdmin() ? 'none' : 'block'; }
        setBtn();

        btn.addEventListener('click', () => { overlay.style.display = 'flex'; overlay.querySelector('#loginEmail').focus(); });
        overlay.querySelector('.close-login-btn').addEventListener('click', () => { overlay.style.display = 'none'; msg.textContent = ''; });

        form.addEventListener('submit', e => {
            e.preventDefault();
            const id = overlay.querySelector('#loginEmail').value.trim();
            const pw = overlay.querySelector('#loginPw').value;
            if (id === ADMIN_ID && pw === ADMIN_PW) {
                try { localStorage.setItem(ADMIN_KEY, '1'); } catch (err) { }
                if (opts.onLogin) { overlay.style.display = 'none'; msg.textContent = ''; setBtn(); opts.onLogin(); }
                else location.reload();
            } else {
                msg.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
            }
        });

        const out = document.getElementById('logoutBtn');
        if (out) out.addEventListener('click', () => {
            try { localStorage.removeItem(ADMIN_KEY); } catch (err) { }
            if (opts.onLogout) { setBtn(); opts.onLogout(); }
            else location.reload();
        });

        if (admin) {
            let panel = document.getElementById('layoutControlPanel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'layoutControlPanel';
                panel.style.cssText = `
                    position: fixed; top: 20px; right: 20px; 
                    background: rgba(20,16,30,0.95); color: #ece5d3; 
                    padding: 15px; border-radius: 8px; border: 1px solid #c9a86a; 
                    z-index: 100000; font-family: 'Nanum Myeongjo', serif; 
                    box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 300px; 
                    max-height: 85vh; overflow-y: auto; box-sizing: border-box;
                    cursor: move; user-select: none;
                `;
                panel.innerHTML = `
                    <div style="font-weight: bold; margin-bottom: 10px; font-size: 0.95em; border-bottom: 1px solid rgba(201,168,106,0.3); padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center; color: #c9a86a;">
                      <span style="font-size:0.9em;">🛠️ 관리자 패널</span>
                      <div style="display:flex; gap:4px;">
                        <button type="button" id="saveLayoutBtn" style="white-space: nowrap; background: #2ed573; border: none; color: #111; font-size: 0.75em; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">저장</button>
                        <button type="button" id="resetLayoutBtn" style="white-space: nowrap; background: #ff4757; border: none; color: #fff; font-size: 0.75em; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">초기화</button>
                        <button type="button" id="logoutBtn" style="white-space: nowrap; background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.75em; padding: 3px 8px; border-radius: 4px; cursor: pointer;">로그아웃</button>
                      </div>
                    </div>

                    <div style="margin-bottom: 10px; font-size: 0.85em; display: flex; align-items: center; justify-content: space-between; background: rgba(201,168,106,0.08); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(201,168,106,0.2);">
                      <span>중앙선 및 요소 스냅</span>
                      <input type="checkbox" id="snapToggle" checked style="cursor: pointer; accent-color: #c9a86a;">
                    </div>

                    <div style="margin-bottom: 6px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;">
                      <button type="button" id="addTextBtn" style="background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 글</button>
                      <button type="button" id="addCalendarBtn" style="background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 달력</button>
                      <button type="button" id="addImageBtn" style="background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 이미지</button>
                      <button type="button" id="addStickerBtn" style="background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 스티커</button>
                      <button type="button" id="addShapeBtn" style="background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 도형</button>
                      <button type="button" id="addEffectBtn" style="background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 효과</button>
                    </div>
                    <div style="margin-bottom: 12px; color: #9d947e; font-size: 0.7em; line-height: 1.5;">Del 삭제 · 방향키 이동(Shift 10px) · Ctrl+Z 되돌리기 · Ctrl+Shift+Z 다시 실행</div>

                    <div id="panelContent" style="border-top: 1px solid rgba(201,168,106,0.3); padding-top: 10px;">
                      <p style="margin: 0; color: #9d947e; font-size: 0.8em;">요소를 클릭하면 상세 편집 옵션이 나타납니다.</p>
                    </div>
                `;
                document.body.appendChild(panel);
            }

            let isDragging = false, offsetX = 0, offsetY = 0;
            panel.addEventListener('mousedown', (e) => {
                const ignoreTags = ['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'SUMMARY', 'I', 'LABEL'];
                if (ignoreTags.includes(e.target.tagName) || e.target.closest('details')) return;
                isDragging = true;
                offsetX = e.clientX - panel.offsetLeft;
                offsetY = e.clientY - panel.offsetTop;
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                panel.style.left = (e.clientX - offsetX) + 'px';
                panel.style.top = (e.clientY - offsetY) + 'px';
                panel.style.right = 'auto';
            });

            window.addEventListener('mouseup', () => { isDragging = false; });

            const panelLogout = panel.querySelector('#logoutBtn');
            if (panelLogout) {
                panelLogout.addEventListener('click', () => {
                    try { localStorage.removeItem(ADMIN_KEY); } catch (err) { }
                    if (opts.onLogout) { setBtn(); opts.onLogout(); }
                    else location.reload();
                });
            }
        }

        return admin;
    }

    function fitStage() {
        const area = document.getElementById('stageArea');
        const frame = document.getElementById('stageFrame');
        const stage = document.getElementById('mh-gpfto');
        if (!area || !frame || !stage) return;
        
        const st = getComputedStyle(area);
        const availW = area.clientWidth - (parseFloat(st.paddingLeft) || 0) - (parseFloat(st.paddingRight) || 0);
        const availH = window.innerHeight - (parseFloat(st.paddingTop) || 0) - (parseFloat(st.paddingBottom) || 0);
        
        const bw = stage.offsetWidth || 1500;
        const bh = stage.offsetHeight || 900;
        
        const sc = Math.max(0.25, Math.min(availW / bw, availH / bh));
        
        stage.style.transform = 'scale(' + sc + ')';
        
        frame.style.width = Math.round(bw * sc) + 'px';
        frame.style.height = Math.round(bh * sc) + 'px';
    }
    window.addEventListener('resize', fitStage);

    async function fetchSettings(id) {
        if (!sb) return null;
        const { data, error } = await sb.from('layouts').select('layout_data').eq('id', id || 'settings_main').maybeSingle();
        if (error) return null;
        let d = data && data.layout_data;
        if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
        return (d && typeof d === 'object') ? d : null;
    }

    const THEME_KEY = 'mafiaz_theme';
    function getTheme() {
        try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
    }

    function paintBackground(s) {
        const bg = document.getElementById('pageBg');
        if (!bg || !s) return '';
        const currentTheme = getTheme();
        
        const targetImg = currentTheme === 'light' ? s.lightBgImage : s.darkBgImage;
        const targetDim = currentTheme === 'light' ? s.lightBgDim : s.darkBgDim;

        const url = imgUrl(targetImg);
        bg.style.backgroundImage = url ? 'url("' + url.replace(/"/g, '%22') + '")' : 'none';
        if (targetDim !== undefined) bg.style.setProperty('--bg-dim', targetDim);
        return url;
    }

    async function applyBackground() {
        try { paintBackground(await fetchSettings('settings_main')); } catch (e) { }
    }

    function setTheme(t, reloadFlag = false) {
        if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
        try { localStorage.setItem(THEME_KEY, t); } catch (e) { }
        const b = document.getElementById('themeToggle');
        if (b) b.textContent = (t === 'light') ? '☾ 다크 모드' : '☀ 라이트 모드';
        
        if (reloadFlag && document.getElementById('draggableGallery') && (location.pathname.endsWith('index.html') || location.pathname.endsWith('index_5.html') || location.pathname.endsWith('/'))) {
            location.reload();
        } else {
            applyBackground();
        }
    }

    function initTheme() {
        setTheme(getTheme(), false);
        const nav = document.getElementById('siteNav');
        if (!nav || document.getElementById('themeToggle')) return;
        const b = document.createElement('button');
        b.type = 'button'; b.id = 'themeToggle';
        b.addEventListener('click', () => {
            const nextTheme = getTheme() === 'light' ? 'dark' : 'light';
            setTheme(nextTheme, true);
        });
        nav.appendChild(b);
        setTheme(getTheme(), false);
    }
    initTheme();

    window.MZ = { sb, getTheme, setTheme, TABLE: 'layouts', esc, hexToRgba, imgUrl, isAdmin, initLogin, pickGithubImage, resolveImgSrc, setImgSrc, fitStage, fetchSettings, paintBackground, applyBackground };
})();