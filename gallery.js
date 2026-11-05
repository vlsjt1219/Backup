/* =====================================================================
   MAFIAZ Gallery 페이지
   - 그림 목록은 GitHub 저장소 Image 폴더의 파일명에서 읽음 ([분류]제목_내용(#태그))
   - 카드/태그 순서·디자인 설정은 Supabase layouts 테이블(page_name='gallery_data')에 저장
     (page_name='gallery' 는 에디터 블록 전용)
   - 업로드/수정/삭제는 GitHub API 사용 (관리자 토큰은 이 브라우저 localStorage 에 저장)
   - Supabase 연결·로그인·배경 적용은 ../common.js(MZ) 사용
   ===================================================================== */
const GITHUB_REPO = 'vlsjt1219/Backup';
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/Image/`;
// 사이트와 같은 곳(GitHub Pages)에서 불러오는 주소 — raw 보다 빠르고 캐시도 잘 됨. 안 열리면 raw 로 대체
const IMG_BASE = new URL('../Image/', location.href).href;
const THUMB_W = 480;   // 카드용 작은 이미지 가로(px). Image/thumb/ 폴더에 같은 이름(.webp)으로 저장
const thumbName = name => String(name).replace(/\.(webp|gif)$/i, '') + '.webp';

// 순서·태그·디자인 설정 같은 "데이터 행"은 에디터 블록(page_name='gallery')과 분리해서 저장한다.
// (같은 page_name이면 에디터가 이 행들을 블록으로 읽어와 삭제해도 계속 되살아남)
const DATA_PAGE = 'gallery_data';
const DATA_ROW_IDS = ['gallery_design_config', 'gallery_item_order', 'gallery_tag_order', 'gallery_top_img_map'];

// 기존에 page_name='gallery'로 저장된 데이터 행을 한 번 옮겨 준다 (관리자 로그인 시, 중복 실행해도 안전)
async function migrateDataRows() {
    try {
        await sbClient.from('layouts').update({ page_name: DATA_PAGE }).in('id', DATA_ROW_IDS).neq('page_name', DATA_PAGE);
    } catch (e) { console.error('Data Row Migration Error:', e); }
}

const sbClient = MZ.sb;          // Supabase 연결은 common.js
const hexToRgba = MZ.hexToRgba;
const esc = MZ.esc;
let isAdmin = false;

let galleryItems = [];
let filteredItems = [];
let tagList = [];
let topImgMap = {}; // 파일명별 상단 이미지 체크 여부 저장 객체
const AR_CACHE_KEY = 'MAFIAZ_GALLERY_AR';
let arCache = {};
try { arCache = JSON.parse(localStorage.getItem(AR_CACHE_KEY) || '{}') || {}; } catch (e) { arCache = {}; }
let layoutQueued = false;

let currentModalIndex = 0;
let selectedCategory = 'all';
let selectedTag = 'all';

let isEditMode = false;
let currentEditingItem = null;
let convertedWebpBlob = null;

function checkAdminStatus() {
    isAdmin = MZ.isAdmin();
    document.body.classList.toggle('gal-admin', isAdmin);   

    const topImgLabel = document.getElementById('topImgLabel');
    const panelContent = document.getElementById('panelContent');

    if (isAdmin) {
        if (topImgLabel) topImgLabel.style.display = 'inline-flex';
    } else {
        if (topImgLabel) topImgLabel.style.display = 'none';
        if (panelContent) {
            panelContent.innerHTML = `<p style="margin: 0; color: #9d947e; font-size: 0.8em;">요소를 클릭하거나 관리자로 로그인하세요.</p>`;
        }
    }
}

// GIF 파일인지 확인
function isGifFile(fileName) {
    return fileName && fileName.toLowerCase().endsWith('.gif');
}

// GIF의 첫 프레임 정지 이미지를 Canvas로 캡처하여 DataURL 반환
function getStaticFrameUrl(imgElement) {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = imgElement.naturalWidth || imgElement.width;
        canvas.height = imgElement.naturalHeight || imgElement.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
    } catch (e) {
        return imgElement.src;
    }
}

function toggleDesignPanel() {
    const p = document.getElementById('designControlPanel');
    p.style.display = (p.style.display === 'block') ? 'none' : 'block';
}
function closeDesignPanel() { document.getElementById('designControlPanel').style.display = 'none'; }

// 디자인 패널 설정 및 태그 순서 통합 저장 함수
async function saveDesignSettings() {
    const config = {
        tag_border_chk: document.getElementById('p_tag_border_chk').checked,
        tag_border_col: document.getElementById('p_tag_border_col').value,
        tag_bg_alpha: document.getElementById('p_tag_bg_alpha').value,
        tag_bg_col: document.getElementById('p_tag_bg_col').value,
        tag_text_col: document.getElementById('p_tag_text_col').value,
        tag_hover_bg_col: document.getElementById('p_tag_hover_bg_col').value,
        tag_hover_text_col: document.getElementById('p_tag_hover_text_col').value
    };

    try {
        // 1. 디자인 데이터 저장
        const { error: err1 } = await sbClient.from('layouts').upsert({ 
            id: 'gallery_design_config', 
            page_name: DATA_PAGE, 
            layout_data: config 
        });
        if (err1) throw err1;

        // 2. 태그 순서 저장
        const { error: err2 } = await sbClient.from('layouts').upsert({ 
            id: 'gallery_tag_order', 
            page_name: DATA_PAGE, 
            layout_data: tagList 
        });
        if (err2) throw err2;

        applyDesignStyles(config);
        alert('디자인 설정이 저장되었습니다!');
    } catch (err) {
        console.error('Save Error:', err);
        alert('저장 실패: ' + (err.message || JSON.stringify(err)));
    }
}

async function loadDesignSettings() {
    const m = await getBundle(false);
    let c = m.gallery_design_config;
    if (c && typeof c === 'object') {
        document.getElementById('p_tag_border_chk').checked = c.tag_border_chk;
        document.getElementById('p_tag_border_col').value = c.tag_border_col;
        document.getElementById('p_tag_bg_alpha').value = c.tag_bg_alpha;
        document.getElementById('p_tag_bg_col').value = c.tag_bg_col;
        document.getElementById('p_tag_text_col').value = c.tag_text_col;
        document.getElementById('p_tag_hover_bg_col').value = c.tag_hover_bg_col;
        document.getElementById('p_tag_hover_text_col').value = c.tag_hover_text_col;

        applyDesignStyles(c);
    }
}

function applyDesignStyles(c) {
    const root = document.documentElement;
    root.style.setProperty('--tag-border', c.tag_border_chk ? `1px solid ${c.tag_border_col}` : 'none');
    root.style.setProperty('--tag-bg', hexToRgba(c.tag_bg_col, c.tag_bg_alpha));
    root.style.setProperty('--tag-color', c.tag_text_col);
    root.style.setProperty('--tag-hover-bg', c.tag_hover_bg_col);
    root.style.setProperty('--tag-hover-color', c.tag_hover_text_col);
}

const GH_TOKEN_KEY = 'MAFIAZ_GH_TOKEN';
let lastGhStatus = 0;   // 마지막 GitHub 쓰기 요청의 응답 코드 (실패 원인 안내용)

function getGithubToken() {
    let token = localStorage.getItem(GH_TOKEN_KEY);
    if (!token) {
        token = prompt("GitHub Personal Access Token을 입력해주세요:");
        if (token) localStorage.setItem(GH_TOKEN_KEY, token.trim());
    }
    return token;
}

// 저장된 토큰을 새로 입력(또는 비워서 삭제) — 「🔑 토큰 재입력」 버튼
function resetGithubToken() {
    const t = prompt('GitHub Personal Access Token을 새로 입력해주세요.\n(비워 두고 확인하면 저장된 토큰을 삭제합니다)');
    if (t === null) return;
    if (t.trim()) {
        localStorage.setItem(GH_TOKEN_KEY, t.trim());
        alert('토큰을 저장했습니다.');
    } else {
        localStorage.removeItem(GH_TOKEN_KEY);
        alert('저장된 토큰을 삭제했습니다. 다음에 글을 올릴 때 다시 입력창이 뜹니다.');
    }
}

// 쓰기 실패 안내: 토큰이 틀렸으면(401) 저장된 토큰을 지워서 다음 시도에 입력창이 다시 뜨게 함
function ghFailAlert(what) {
    if (lastGhStatus === 401) {
        localStorage.removeItem(GH_TOKEN_KEY);
        alert('토큰이 올바르지 않아 저장된 토큰을 지웠습니다.\n「🔑 토큰 재입력」 버튼을 누르거나, 다시 시도하면 입력창이 뜹니다.');
    } else if (lastGhStatus === 403 || lastGhStatus === 404) {
        alert(what + '에 실패했습니다.\n토큰에 이 저장소의 Contents(읽기/쓰기) 권한이 있는지 확인해주세요.\n토큰을 바꾸려면 「🔑 토큰 재입력」 버튼을 누르세요.');
    } else {
        alert(what + '에 실패했습니다. 네트워크를 확인해주세요.\n토큰을 바꾸려면 「🔑 토큰 재입력」 버튼을 누르세요.');
    }
}

// 상단 이미지 맵 정보 로드
async function loadTopImgMap() {
    const { data } = await sbClient.from('layouts').select('layout_data').eq('id', 'gallery_top_img_map').maybeSingle();
    if (data && data.layout_data) {
        let map = data.layout_data;
        if (typeof map === 'string') { try { map = JSON.parse(map); } catch(e){} }
        if (map && typeof map === 'object') {
            topImgMap = map;
        }
    }
}

// ── 카드 순서(최신 등록이 맨 앞) 저장/불러오기 ──
async function fetchSavedOrder() {
    try {
        const { data, error } = await sbClient.from('layouts').select('layout_data').eq('id', 'gallery_item_order').maybeSingle();
        if (error) throw error;
        let order = data && data.layout_data;
        if (typeof order === 'string') { try { order = JSON.parse(order); } catch (e) { order = []; } }
        return Array.isArray(order) ? order : [];
    } catch (e) {
        console.error('Order Load Error:', e);
        return [];
    }
}

async function saveItemOrder(order) {
    try {
        const { error } = await sbClient.from('layouts').upsert({
            id: 'gallery_item_order',
            page_name: DATA_PAGE,
            layout_data: order
        });
        if (error) throw error;
        return true;
    } catch (e) {
        console.error('Order Save Error:', e);
        return false;
    }
}

// GitHub 커밋 시각 조회 (파일 sha별로 localStorage에 캐시 → 재요청 최소화)
const DATE_CACHE_KEY = 'MAFIAZ_GALLERY_DATES';
let dateCache = {};
try { dateCache = JSON.parse(localStorage.getItem(DATE_CACHE_KEY) || '{}') || {}; } catch (e) { dateCache = {}; }

async function attachCommitTimes(items, headers) {
    const todo = [];
    items.forEach(it => {
        if (dateCache[it.sha]) it._ts = dateCache[it.sha];
        else todo.push(it);
    });

    for (let i = 0; i < todo.length; i += 10) {
        await Promise.all(todo.slice(i, i + 10).map(async it => {
            try {
                const url = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=${encodeURIComponent('Image/' + it.fileName)}&per_page=1`;
                const r = await fetch(url, { headers });
                if (!r.ok) return;
                const arr = await r.json();
                const d = arr && arr[0] && arr[0].commit && (arr[0].commit.committer || arr[0].commit.author);
                if (d && d.date) {
                    it._ts = Date.parse(d.date);
                    dateCache[it.sha] = it._ts;
                }
            } catch (e) { /* 조회 실패한 파일은 맨 뒤 */ }
        }));
    }
    try { localStorage.setItem(DATE_CACHE_KEY, JSON.stringify(dateCache)); } catch (e) {}
}

// ── 목록 불러오기 ──
//  방문자: Supabase 한 번의 조회(순서·태그·디자인·상단이미지)만 사용 → GitHub API 호출 없음
//          (지난 방문 데이터가 있으면 먼저 바로 보여주고, 달라졌을 때만 다시 그림)
//  관리자: GitHub 목록(git trees)을 직접 읽어 Supabase 의 순서와 동기화
const BUNDLE_IDS = ['gallery_design_config', 'gallery_item_order', 'gallery_tag_order', 'gallery_top_img_map'];
const BUNDLE_CACHE_KEY = 'MAFIAZ_GALLERY_BUNDLE_v1';
let bundlePromise = null;

function parseJsonField(v) {
    if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return null; } }
    return v;
}
function getBundle(force) {
    if (!bundlePromise || force) {
        bundlePromise = sbClient.from('layouts').select('id,layout_data').in('id', BUNDLE_IDS)
            .then(({ data, error }) => {
                if (error) throw error;
                const m = {};
                (data || []).forEach(r => { m[r.id] = parseJsonField(r.layout_data); });
                return m;
            })
            .catch(e => { console.error('Bundle Load Error:', e); bundlePromise = null; return {}; });
    }
    return bundlePromise;
}
function readBundleCache() {
    try {
        const c = JSON.parse(localStorage.getItem(BUNDLE_CACHE_KEY) || 'null');
        return (c && Array.isArray(c.gallery_item_order) && c.gallery_item_order.length) ? c : null;
    } catch (e) { return null; }
}
function bundleSig(m) {
    return JSON.stringify([m.gallery_item_order || null, m.gallery_tag_order || null, m.gallery_top_img_map || null]);
}
function writeBundleCache(m) {
    try {
        localStorage.setItem(BUNDLE_CACHE_KEY, JSON.stringify({
            gallery_item_order: m.gallery_item_order, gallery_tag_order: m.gallery_tag_order, gallery_top_img_map: m.gallery_top_img_map
        }));
    } catch (e) {}
}

// GitHub 의 Image 폴더 파일 목록 → [[이름, sha], ...]
// (폴더 목록 API 는 1000개까지만 주므로 git trees 를 먼저 쓰고, 안 되면 예전 방식으로)
async function ghGet(url, headers) {
    let r = await fetch(url, { headers });
    if (r.status === 401 && headers.Authorization) {   // 잘못된 토큰 때문에 읽기까지 막히지 않게: 토큰을 지우고 공개 요청으로 다시
        localStorage.removeItem(GH_TOKEN_KEY);
        delete headers.Authorization;
        r = await fetch(url, { headers });
    }
    return r;
}
async function fetchFilesFromGithub(headers) {
    const isMedia = n => n.endsWith('.webp') || n.endsWith('.gif');
    try {
        const r = await ghGet(`https://api.github.com/repos/${GITHUB_REPO}/git/trees/main:Image?t=${Date.now()}`, headers);
        if (r.ok) {
            const j = await r.json();
            if (Array.isArray(j.tree)) return j.tree.filter(t => t.type === 'blob' && isMedia(t.path)).map(t => [t.path, t.sha]);
        }
    } catch (e) { /* 아래 예전 방식으로 */ }
    const res = await ghGet(`https://api.github.com/repos/${GITHUB_REPO}/contents/Image?t=${Date.now()}`, headers);
    if (!res.ok) throw new Error(`GitHub API Error: ${res.status} ${res.statusText}`);
    const files = await res.json();
    if (!Array.isArray(files)) return [];
    return files.filter(f => isMedia(f.name)).map(f => [f.name, f.sha]);
}

function makeItem(name, sha, idx) {
    const ext = name.endsWith('.gif') ? '.gif' : '.webp';
    const rawTitle = name.replace(ext, '');
    let cate = '마피아즈';
    let title = rawTitle;
    let content = '';

    const cateMatch = rawTitle.match(/^\[(.*?)\]/);
    if (cateMatch) {
        cate = cateMatch[1];
        title = rawTitle.replace(/^\[.*?\]/, '');
    }

    if (title.includes('_')) {
        const parts = title.split('_');
        title = parts[0] || 'Untitled';
        content = parts.slice(1).join('_') || '';
    }

    let decodedContent = content;
    try {
        decodedContent = decodeURIComponent(content);
    } catch (err) {
        decodedContent = content;
    }

    const enc = encodeURIComponent(name);
    return {
        id: idx,
        fileName: name,
        sha: sha || '',
        url: IMG_BASE + enc,
        rawUrl: GITHUB_RAW_BASE + enc,
        thumbUrl: IMG_BASE + 'thumb/' + encodeURIComponent(thumbName(name)),
        title: title,
        category: cate,
        tags: extractTagsFromString(decodedContent || title),
        content: extractPureTextFromString(decodedContent || title),
        rawContent: decodedContent
    };
}

// m: 묶음 조회 결과, ghFiles: GitHub 목록(관리자) 또는 null(방문자: 저장된 순서 배열이 곧 파일 목록)
async function renderFromBundle(m, ghFiles, headers) {
    const top = m.gallery_top_img_map;
    topImgMap = (top && typeof top === 'object' && !Array.isArray(top)) ? top : {};

    const savedOrder = Array.isArray(m.gallery_item_order) ? m.gallery_item_order : [];
    const files = ghFiles || savedOrder.map(n => [n, '']);
    let fetchedItems = files.map((f, idx) => makeItem(f[0], f[1], idx));

    // 💡 최신 등록순 정렬
    //    - Supabase에 저장된 순서 배열(맨 앞 = 최신)을 기준으로 하고
    //    - 그 배열에 없는 파일(직접 GitHub에 올렸거나 수정으로 파일명이 바뀐 것 등)은
    //      GitHub 커밋 시각으로 최신순을 매겨 맨 위에 둔다. (관리자 화면에서만 조회)
    const existingNames = new Set(fetchedItems.map(i => i.fileName));
    const cleanedOrder = savedOrder.filter(fn => existingNames.has(fn));   // 삭제된 파일 제거
    const orderMap = new Map();
    cleanedOrder.forEach((fn, idx) => orderMap.set(fn, idx));

    const known = fetchedItems.filter(i => orderMap.has(i.fileName))
        .sort((a, b) => orderMap.get(a.fileName) - orderMap.get(b.fileName));
    const unknown = fetchedItems.filter(i => !orderMap.has(i.fileName));

    if (unknown.length && ghFiles && isAdmin) {
        await attachCommitTimes(unknown, headers);
        unknown.sort((a, b) => (b._ts || 0) - (a._ts || 0));
    }

    fetchedItems = [...unknown, ...known];

    // 관리자 화면에서 순서가 달라졌으면 Supabase 순서도 바로잡아 저장 (방문자는 이 순서 배열로 목록을 만든다)
    const finalOrder = fetchedItems.map(i => i.fileName);
    if (isAdmin && JSON.stringify(finalOrder) !== JSON.stringify(savedOrder)) {
        saveItemOrder(finalOrder);
    }

    galleryItems = fetchedItems;

    // 태그: 저장된 순서를 따르고, 없는 태그는 뒤로
    const tagSet = new Set();
    galleryItems.forEach(item => item.tags.forEach(t => tagSet.add(t)));
    let fetchedTags = Array.from(tagSet);

    const savedTagOrder = Array.isArray(m.gallery_tag_order) ? m.gallery_tag_order : [];
    if (savedTagOrder.length > 0) {
        const tagMap = new Map();
        savedTagOrder.forEach((tg, idx) => tagMap.set(tg, idx));
        fetchedTags.sort((a, b) => {
            const indexA = tagMap.has(a) ? tagMap.get(a) : 999999;
            const indexB = tagMap.has(b) ? tagMap.get(b) : 999999;
            return indexA - indexB;
        });
    }
    tagList = fetchedTags;

    buildTagFilterButtons();
    applyFilters();
}

// reuse=true: 페이지를 처음 열 때(이미 시작된 묶음 조회를 재사용). 새로고침 버튼·업로드 후에는 항상 새로 조회
async function loadGalleryData(reuse) {
    try {
        if (isAdmin) await migrateDataRows();

        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        const token = localStorage.getItem('MAFIAZ_GH_TOKEN');
        if (token) headers['Authorization'] = `token ${token.trim()}`;

        // 서로 기다릴 필요 없는 요청은 동시에 시작
        const bundleP = getBundle(reuse !== true);
        const filesP = isAdmin ? fetchFilesFromGithub(headers) : null;
        if (filesP) filesP.catch(() => {});

        // 방문자: 지난번 데이터가 있으면 네트워크를 기다리지 않고 먼저 그림
        let shownSig = null;
        if (!isAdmin && reuse === true) {
            const cached = readBundleCache();
            if (cached) { shownSig = bundleSig(cached); await renderFromBundle(cached, null, headers); }
        }

        const m = await bundleP;
        let ghFiles = null;
        if (isAdmin) {
            ghFiles = await filesP;
        } else if (!Array.isArray(m.gallery_item_order) || !m.gallery_item_order.length) {
            ghFiles = await fetchFilesFromGithub(headers);   // 관리자가 아직 한 번도 동기화하지 않은 경우: 예전 방식
        }

        if (!isAdmin && ghFiles === null) {
            writeBundleCache(m);
            if (shownSig !== null && shownSig === bundleSig(m)) return;   // 캐시와 같으면 다시 그리지 않음
        }
        await renderFromBundle(m, ghFiles, headers);
    } catch (e) {
        console.error('Gallery Load Error:', e);
    }
}

// 태그 파싱 함수
function extractTagsFromString(str) {
    if (!str || typeof str !== 'string') return [];
    try {
        const matches = str.match(/(?:#|~)([^\s#~]+)/g);
        if (!matches) return [];
        return matches
            .map(t => t.replace(/^(?:#|~)/, '').trim())
            .filter(t => t.length > 0 && t !== '.');
    } catch (err) {
        return [];
    }
}

function extractPureTextFromString(str) {
    if (!str || typeof str !== 'string') return '';
    try {
        return str.replace(/(?:#|~)([^\s#~]+)/g, '').trim();
    } catch (err) {
        return str;
    }
}

function buildTagFilterButtons() {
    const tagContainer = document.getElementById('tagFilterContainer');
    tagContainer.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = `tag-btn ${selectedTag === 'all' ? 'active' : ''}`;
    allBtn.textContent = '#전체태그';
    allBtn.onclick = function() { filterTag('all', this); };
    tagContainer.appendChild(allBtn);

    tagList.forEach((tag, idx) => {
        const btn = document.createElement('button');
        btn.className = `tag-btn ${selectedTag === tag ? 'active' : ''}`;
        btn.textContent = `#${tag}`;
        btn.dataset.tagIndex = idx;
        btn.dataset.tagName = tag;
        btn.onclick = function() { filterTag(tag, this); };

        if (isAdmin) {
            setupCustomDrag(btn, 'tag');
        }

        tagContainer.appendChild(btn);
    });
}

function applyFilters() {
    filteredItems = galleryItems.filter(item => {
        const matchCategory = (selectedCategory === 'all' || item.category === selectedCategory);
        const matchTag = (selectedTag === 'all' || item.tags.includes(selectedTag));
        return matchCategory && matchTag;
    });
    renderGalleryGrid();
}

function filterCategory(cate, btn) {
    selectedCategory = cate;
    document.querySelectorAll('.cate-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFilters();
}

function filterTag(tag, btnElem) {
    selectedTag = tag;
    
    if (!btnElem) {
        const buttons = document.querySelectorAll('.tag-btn');
        buttons.forEach(b => {
            if ((tag === 'all' && b.textContent === '#전체태그') || b.dataset.tagName === tag) {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
    } else {
        document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
        btnElem.classList.add('active');
    }

    applyFilters();
}

function saveArCache() {
    try { localStorage.setItem(AR_CACHE_KEY, JSON.stringify(arCache)); } catch (e) {}
}

function clampAr(v) { return Math.min(3.5, Math.max(0.3, v)); }

function layoutMasonry() {
    const c = document.getElementById('log_list');
    if (!c) return;
    const W = c.clientWidth;
    if (!W) return;

    const gap = W < 600 ? 8 : 12;
    let minColW = 160; 
    if (W < 768) minColW = 120;
    if (W < 480) minColW = 100;

    const cols = Math.max(2, Math.floor((W + gap) / (minColW + gap)));
    const colW = (W - gap * (cols - 1)) / cols;
    const heights = new Array(cols).fill(0);

    Array.from(c.children).forEach(el => {
        if (el.classList.contains('dragging-float')) return;
        const ar = clampAr(parseFloat(el.dataset.ar) || 1.3);
        const h = colW * ar;
        let k = 0;
        for (let i = 1; i < cols; i++) { if (heights[i] < heights[k] - 0.5) k = i; }
        el.style.width = colW + 'px';
        el.style.height = h + 'px';
        el.style.left = (k * (colW + gap)) + 'px';
        el.style.top = heights[k] + 'px';
        heights[k] += h + gap;
    });

    c.style.height = Math.max(0, ...heights) + 'px';
}

function queueLayout() {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => { layoutQueued = false; layoutMasonry(); });
}

function renderGalleryGrid() {
    const container = document.getElementById('log_list');
    container.classList.remove('ready');
    container.innerHTML = '';

    filteredItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'card-item'; // 💡 카드 드래그 클래스 제거됨
        card.dataset.index = index;
        card.dataset.filename = item.fileName;
        card.dataset.ar = arCache[item.fileName] || 1.3;

        const isPosTop = !!topImgMap[item.fileName];
        const isGif = isGifFile(item.fileName);
        const eager = index < 8;   // 첫 화면 이미지는 바로, 나머지는 스크롤하면서 불러옴

        card.innerHTML = `
            <div class="card-thumb">
                <img src="${esc(item.thumbUrl)}" alt="${esc(item.title)}" class="${isPosTop ? 'pos-top' : ''}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-gif="${isGif ? esc(item.url) : ''}">
                <div class="card-overlay">
                    <span class="card-title">${esc(item.title)}</span>
                </div>
            </div>
        `;

        const img = card.querySelector('img');

        // 작은 썸네일 → Pages 원본 → raw 원본 순으로 시도 (썸네일이 아직 없거나 Pages 반영 전이어도 표시됨)
        const chain = [item.thumbUrl, item.url, item.rawUrl];
        let stage = 0, settled = false;
        img.addEventListener('load', () => { settled = true; }, { once: true });
        img.addEventListener('error', () => { if (!settled && ++stage < chain.length) img.src = chain[stage]; });

        if (isGif) {
            img.addEventListener('load', function onGifFirstLoad() {
                if (img.dataset.staticSrc) return;
                if (stage === 0) { img.dataset.staticSrc = img.src; return; }   // 썸네일은 이미 정지 이미지
                const staticSrc = getStaticFrameUrl(img);
                img.dataset.staticSrc = staticSrc;
                img.src = staticSrc;
            }, { once: true });

            card.addEventListener('mouseenter', () => {
                if (!img.dataset.gif) return;
                img.onerror = () => { img.onerror = null; img.src = item.rawUrl; };
                img.src = img.dataset.gif;   // 마우스를 올렸을 때만 움직이는 원본을 받음
            });

            card.addEventListener('mouseleave', () => {
                if (img.dataset.staticSrc) img.src = img.dataset.staticSrc;
            });
        }

        const applyRatio = () => {
            if (!img.naturalWidth) return;
            const ar = img.naturalHeight / img.naturalWidth;
            if (Math.abs((arCache[item.fileName] || 0) - ar) > 0.004) {
                arCache[item.fileName] = ar;
                saveArCache();
            }
            card.dataset.ar = ar;
            queueLayout();
        };
        img.addEventListener('load', applyRatio);

        card.onclick = () => {
            openPolaroidModal(index);
        };

        container.appendChild(card);
        if (img.complete) applyRatio();
    });

    layoutMasonry();
    requestAnimationFrame(() => container.classList.add('ready'));
}

// 💡 태그 드래그 정렬 (놓을 때 즉시 Supabase 자동 저장)
function setupCustomDrag(element, type) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let offsetX = 0, offsetY = 0;
    let placeholder = document.createElement('div');
    placeholder.className = 'tag-placeholder';

    element.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;

        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        const initialWidth = rect.width;
        const initialHeight = rect.height;

        const onPointerMove = (moveEv) => {
            const dist = Math.hypot(moveEv.clientX - startX, moveEv.clientY - startY);
            if (!isDragging && dist > 5) {
                isDragging = true;

                element.style.width = `${initialWidth}px`;
                element.style.height = `${initialHeight}px`;

                placeholder.style.width = `${initialWidth}px`;
                placeholder.style.height = `${initialHeight}px`;

                element.classList.add('dragging-float');

                const container = document.getElementById('tagFilterContainer');
                container.insertBefore(placeholder, element);

                try { element.setPointerCapture(e.pointerId); } catch(err){}
            }

            if (isDragging) {
                element.style.left = `${moveEv.clientX - offsetX}px`;
                element.style.top = `${moveEv.clientY - offsetY}px`;

                const container = document.getElementById('tagFilterContainer');
                const targets = Array.from(container.querySelectorAll('.tag-btn:not(.dragging-float)'));

                let closestTarget = null;
                let insertAfter = false;

                for (let t of targets) {
                    const r = t.getBoundingClientRect();
                    const centerX = r.left + r.width / 2;

                    if (moveEv.clientY >= r.top && moveEv.clientY <= r.bottom) {
                        if (moveEv.clientX > centerX) {
                            closestTarget = t;
                            insertAfter = true;
                        } else {
                            closestTarget = t;
                            insertAfter = false;
                            break;
                        }
                    }
                }

                if (closestTarget) {
                    if (insertAfter) {
                        container.insertBefore(placeholder, closestTarget.nextSibling);
                    } else {
                        container.insertBefore(placeholder, closestTarget);
                    }
                }
            }
        };

        const onPointerUp = async (upEv) => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);

            try { element.releasePointerCapture(e.pointerId); } catch(err){}

            if (isDragging) {
                element.classList.remove('dragging-float');
                element.style.left = '';
                element.style.top = '';
                element.style.width = '';
                element.style.height = '';

                if (placeholder.parentNode) {
                    const container = document.getElementById('tagFilterContainer');
                    container.insertBefore(element, placeholder);
                    placeholder.remove();

                    // 새로운 태그 순서 추출
                    const newTags = Array.from(container.querySelectorAll('.tag-btn[data-tag-index]')).map(el => tagList[parseInt(el.dataset.tagIndex)]);
                    tagList = newTags;
                    buildTagFilterButtons();

                    // 💡 태그 위치 이동 즉시 Supabase 자동 저장
                    try {
                        await sbClient.from('layouts').upsert({ 
                            id: 'gallery_tag_order', 
                            page_name: DATA_PAGE, 
                            layout_data: tagList 
                        });
                    } catch (err) {
                        console.error('Tag Order Auto-Save Error:', err);
                    }
                }

                setTimeout(() => { isDragging = false; }, 50);
            }
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    });

    element.addEventListener('click', (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

(function () {
    const c = document.getElementById('log_list');
    if (window.ResizeObserver) {
        new ResizeObserver(() => queueLayout()).observe(c);
    }
    window.addEventListener('resize', queueLayout);
})();

function openPolaroidModal(index) {
    currentModalIndex = index;
    const item = filteredItems[currentModalIndex];
    if (!item) return;

    const modalImg = document.getElementById('modalImg');
    // 작은 이미지를 먼저 보여주고, 원본이 준비되면 바꿔 끼움
    modalImg.onerror = () => { modalImg.onerror = null; modalImg.src = item.url; };
    modalImg.src = item.thumbUrl;
    const fullImg = new Image();
    const swapFull = src => { if (filteredItems[currentModalIndex] === item) { modalImg.onerror = null; modalImg.src = src; } };
    fullImg.onload = () => swapFull(item.url);
    fullImg.onerror = () => { const r = new Image(); r.onload = () => swapFull(item.rawUrl); r.src = item.rawUrl; };
    fullImg.src = item.url;
    document.getElementById('modalTitle').textContent = item.title;
    document.getElementById('modalDesc').textContent = item.content;

    const isPosTop = !!topImgMap[item.fileName];
    if (isPosTop) {
        modalImg.classList.add('pos-top');
    } else {
        modalImg.classList.remove('pos-top');
    }

    const topImgChk = document.getElementById('topImgChk');
    if (topImgChk) {
        topImgChk.checked = isPosTop;
    }

    const tagsContainer = document.getElementById('modalTags');
    tagsContainer.innerHTML = '';

    if (item.tags && item.tags.length > 0) {
        item.tags.forEach(t => {
            const badge = document.createElement('span');
            badge.className = 'polaroid-tag-badge';
            badge.textContent = `#${t}`;
            badge.onclick = (e) => {
                e.stopPropagation();
                document.getElementById('polaroidModal').style.display = 'none';
                filterTag(t, null);
            };
            tagsContainer.appendChild(badge);
        });
    }

    document.getElementById('polaroidModal').style.display = 'flex';
}

async function toggleTopImagePosition(chkElem) {
    const item = filteredItems[currentModalIndex];
    if (!item) return;

    topImgMap[item.fileName] = chkElem.checked;

    const modalImg = document.getElementById('modalImg');
    if (chkElem.checked) {
        modalImg.classList.add('pos-top');
    } else {
        modalImg.classList.remove('pos-top');
    }

    try {
        await sbClient.from('layouts').upsert({
            id: 'gallery_top_img_map',
            page_name: DATA_PAGE,
            layout_data: topImgMap
        });
    } catch (e) {
        console.error('Save topImgMap Error:', e);
    }

    renderGalleryGrid();
}

function closePolaroidModal(e) {
    if (e.target.id === 'polaroidModal') {
        document.getElementById('polaroidModal').style.display = 'none';
    }
}

function navigateModal(dir, e) {
    e.stopPropagation();
    currentModalIndex += dir;
    if (currentModalIndex < 0) currentModalIndex = filteredItems.length - 1;
    if (currentModalIndex >= filteredItems.length) currentModalIndex = 0;
    openPolaroidModal(currentModalIndex);
}

function openFullImageModal() {
    const item = filteredItems[currentModalIndex];
    if (!item) return;
    const fullTarget = document.getElementById('fullImgTarget');
    fullTarget.onerror = () => { fullTarget.onerror = null; fullTarget.src = item.rawUrl; };
    fullTarget.src = item.url;
    document.getElementById('fullImageModal').style.display = 'flex';
}
function closeFullImageModal() { document.getElementById('fullImageModal').style.display = 'none'; }

// ── 글쓰기/수정 모달 공통 ──

// 첨부파일 상태 초기화 (이전 글에서 고른 파일이 다음 글에 남지 않도록)
function resetFileInput() {
    convertedWebpBlob = null;
    const fi = document.getElementById('imgFileInput');
    try { fi.value = ''; } catch (e) {}
    document.getElementById('compressSizeInfo').textContent = '';
}

// 제목 비교용 정규화 (공백·대소문자 무시, 파일명 규칙상 '_' 뒤는 내용이므로 제외)
function normTitle(t) { return String(t || '').split('_')[0].trim().toLowerCase(); }

// 같은 제목의 기존 게시글 찾기 (수정 중인 글 자신은 제외)
function findDuplicateTitle(title) {
    const key = normTitle(title);
    if (!key) return null;
    return galleryItems.find(it =>
        normTitle(it.title) === key &&
        !(isEditMode && currentEditingItem && it.fileName === currentEditingItem.fileName)
    ) || null;
}

// 제목 입력 시 비슷한 기존 제목을 입력칸 아래에 표시
function hideTitleSuggest() {
    const box = document.getElementById('titleSuggest');
    if (box) box.style.display = 'none';
}

(function setupTitleSuggest() {
    const input = document.getElementById('wr_subject');
    if (!input) return;
    const wrap = input.parentElement;
    wrap.style.position = 'relative';

    const box = document.createElement('div');
    box.id = 'titleSuggest';
    box.style.cssText = 'display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;z-index:5;' +
        'background:#2c3345;border:1px solid #3f475d;border-radius:8px;overflow:hidden;text-align:left;' +
        'box-shadow:0 8px 20px rgba(0,0,0,.45);';
    wrap.appendChild(box);

    function update() {
        const key = normTitle(input.value);
        box.innerHTML = '';
        if (!key) { box.style.display = 'none'; return; }

        const seen = new Set();
        const matches = [];
        galleryItems.forEach(it => {
            if (isEditMode && currentEditingItem && it.fileName === currentEditingItem.fileName) return;
            const t = normTitle(it.title);
            if (!t || seen.has(t)) return;
            if (t.includes(key) || key.includes(t)) { seen.add(t); matches.push({ it, t }); }
        });
        // galleryItems 는 최신 등록순이므로 matches 도 최신순.
        // 단, 제목이 완전히 같은 글(중복 경고 대상)만 맨 위에 고정한다.
        matches.sort((a, b) => (b.t === key) - (a.t === key));

        if (!matches.length) { box.style.display = 'none'; return; }

        matches.slice(0, 6).forEach(m => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:8px 14px;font-size:13px;color:#e8e8e8;border-top:1px solid rgba(255,255,255,.06);';
            const name = document.createElement('span');
            name.textContent = m.it.title;
            const tag = document.createElement('span');
            const exact = m.t === key;
            tag.textContent = exact ? '동일한 제목이 이미 있어요' : m.it.category;
            tag.style.cssText = 'font-size:11px;white-space:nowrap;color:' + (exact ? '#ff6b7a' : '#8a93a8') + ';' + (exact ? 'font-weight:bold;' : '');
            row.appendChild(name);
            row.appendChild(tag);
            box.appendChild(row);
        });
        box.firstChild.style.borderTop = 'none';
        box.style.display = 'block';
    }

    input.addEventListener('input', update);
    input.addEventListener('focus', update);
    input.addEventListener('blur', () => setTimeout(hideTitleSuggest, 150));
})();

function openWriteModal() {
    isEditMode = false;
    currentEditingItem = null;
    document.getElementById('wr_subject').value = '';
    document.getElementById('ca_name').value = '마피아즈';
    document.getElementById('wr_content').value = '';
    document.getElementById('submitBtn').textContent = '등록하기';
    resetFileInput();            // 새 글은 항상 첨부파일 공란으로 시작
    hideTitleSuggest();
    document.getElementById('writeModal').style.display = 'flex';
}

function openEditModal() {
    const item = filteredItems[currentModalIndex];
    if (!item) return;

    isEditMode = true;
    currentEditingItem = item;

    document.getElementById('wr_subject').value = item.title;
    document.getElementById('ca_name').value = item.category;
    document.getElementById('wr_content').value = item.rawContent || item.content;
    document.getElementById('submitBtn').textContent = '수정완료';
    resetFileInput();            // 이전에 고른 파일이 이 글에 덮어씌워지지 않게 비움
    hideTitleSuggest();
    showExistingImageInFileInput(item);

    document.getElementById('polaroidModal').style.display = 'none';
    document.getElementById('writeModal').style.display = 'flex';
}

// 수정 시 이 게시글의 기존 이미지를 파일란에 채워 보여준다.
// (표시용일 뿐, 새 파일을 직접 고르기 전까지는 업로드 대상이 아님 = convertedWebpBlob 은 null 유지)
async function showExistingImageInFileInput(item) {
    const info = document.getElementById('compressSizeInfo');
    info.textContent = '기존 이미지 불러오는 중...';
    try {
        const res = await fetch(`${item.rawUrl}?t=${Date.now()}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        // 그 사이 모달이 닫혔거나 다른 글/새 파일로 바뀌었으면 무시
        if (!isEditMode || currentEditingItem !== item || convertedWebpBlob) return;
        const file = new File([blob], item.fileName, { type: blob.type });
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('imgFileInput').files = dt.files;
        info.textContent = `${(blob.size / 1024).toFixed(0)}KB · 기존 이미지 (바꿀 때만 교체)`;
    } catch (e) {
        if (isEditMode && currentEditingItem === item && !convertedWebpBlob) info.textContent = '기존 이미지 유지';
    }
}

function closeWriteModal() {
    document.getElementById('writeModal').style.display = 'none';
    hideTitleSuggest();
    resetFileInput();
}

document.getElementById('imgFileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) {
        convertedWebpBlob = null;
        document.getElementById('compressSizeInfo').textContent = isEditMode ? '기존 이미지 유지' : '';
        return;
    }

    if (file.type === 'image/gif' || file.name.endsWith('.gif')) {
        convertedWebpBlob = file;
        const sizeStr = (file.size / 1024).toFixed(0) + 'KB';
        document.getElementById('compressSizeInfo').textContent = `${sizeStr} (GIF 원본)`;
        return;
    }

    const origStr = (file.size / 1024).toFixed(0) + 'KB';
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(function(blob) {
            convertedWebpBlob = blob;
            const newStr = (blob.size / 1024).toFixed(0) + 'KB';
            document.getElementById('compressSizeInfo').textContent = `${origStr} → ${newStr}`;
        }, 'image/webp', 0.90);
    };
});

async function submitPostToGithub() {
    const cate = document.getElementById('ca_name').value;
    const title = document.getElementById('wr_subject').value.trim() || 'Untitled';
    const content = document.getElementById('wr_content').value.trim();

    // 같은 제목의 게시글이 이미 있으면 알리고 작성을 취소
    const dup = findDuplicateTitle(title);
    if (dup) {
        alert(`"${dup.title}" 제목의 게시글이 이미 등록되어 있습니다.\n${isEditMode ? '수정' : '등록'}을 취소합니다.`);
        closeWriteModal();
        return;
    }

    const token = getGithubToken();
    if (!token) { alert('토큰이 설정되지 않았습니다.'); return; }

    const safeContentForFileName = content.replace(/#/g, '~');
    const isGifUpload = convertedWebpBlob && (convertedWebpBlob.type === 'image/gif' || (convertedWebpBlob.name && convertedWebpBlob.name.endsWith('.gif')));
    let ext = isGifUpload ? '.gif' : '.webp';
    // 수정 중 이미지를 바꾸지 않았다면 기존 파일 확장자를 유지
    if (!convertedWebpBlob && isEditMode && currentEditingItem) {
        ext = currentEditingItem.fileName.toLowerCase().endsWith('.gif') ? '.gif' : '.webp';
    }
    const newFileName = `[${cate}]${title}_${safeContentForFileName}${ext}`;

    if (isEditMode && currentEditingItem) {
        const cur = currentEditingItem;

        // 제목·분류·내용·이미지 중 아무것도 바뀌지 않았으면 반영하지 않음
        if (newFileName === cur.fileName && !convertedWebpBlob) {
            alert('변경된 내용이 없습니다.');
            closeWriteModal();
            return;
        }

        // 새 이미지를 고르지 않았다면 기존 이미지를 그대로 사용
        let blob = convertedWebpBlob;
        if (!blob) {
            try {
                const res = await fetch(`${cur.rawUrl}?t=${Date.now()}`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                blob = await res.blob();
            } catch (e) {
                alert('기존 이미지를 불러오지 못해 수정하지 못했습니다.');
                return;
            }
        }

        const latestSha = await fetchLatestSha(cur.fileName) || cur.sha;
        let ok;
        if (newFileName === cur.fileName) {
            ok = await uploadGithubFile(newFileName, blob, token, latestSha);       // 같은 이름: 이미지만 교체
        } else {
            ok = await uploadGithubFile(newFileName, blob, token);                  // 새 이름으로 먼저 올리고
            if (ok) await deleteGithubFile(cur.fileName, latestSha, token);         // 성공하면 옛 파일 삭제
        }
        if (!ok) { ghFailAlert('수정'); return; }
        await putThumb(newFileName, blob, token);
        if (newFileName !== cur.fileName) await deleteThumb(cur.fileName, token);

        // 수정으로 파일명이 바뀌어도 카드 위치(순서)는 그대로 유지
        try {
            const order = await fetchSavedOrder();
            const idx = order.indexOf(cur.fileName);
            if (idx >= 0) order[idx] = newFileName;
            else order.unshift(newFileName);
            const saved = await saveItemOrder(order.filter((fn, i) => order.indexOf(fn) === i));
            if (!saved) alert('수정은 되었지만 순서 저장에 실패했습니다. (콘솔 확인)');
        } catch (e) {
            console.error('Order Update Error:', e);
        }
        alert('수정 완료!');
    } else {
        if (!convertedWebpBlob) { alert('이미지를 선택해주세요.'); return; }
        const ok = await uploadGithubFile(newFileName, convertedWebpBlob, token);
        if (!ok) { ghFailAlert('등록'); return; }
        await putThumb(newFileName, convertedWebpBlob, token);

        try {
            // 새 글은 순서 배열의 맨 앞(= 최신)에 추가
            const savedOrder = await fetchSavedOrder();
            const saved = await saveItemOrder([newFileName, ...savedOrder.filter(fn => fn !== newFileName)]);
            if (!saved) alert('등록은 되었지만 순서 저장에 실패했습니다. (콘솔 확인)');
        } catch(e) {
            console.error('Order Update Error:', e);
        }

        alert('등록 성공!');
    }

    closeWriteModal();      // 첨부파일 상태도 함께 초기화
    loadGalleryData();
}

// sha를 넘기면 같은 이름의 기존 파일을 덮어쓴다. 성공 여부(true/false)를 반환.
async function uploadGithubFile(fileName, blob, token, sha) {
    const reader = new FileReader();
    return new Promise((resolve) => {
        reader.readAsDataURL(blob);
        reader.onloadend = async function() {
            try {
                const base64Content = reader.result.split(',')[1];
                const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/Image/${fileName.split('/').map(encodeURIComponent).join('/')}`;
                const body = { message: `Upload ${fileName}`, content: base64Content };
                if (sha) body.sha = sha;

                const res = await fetch(apiUrl, {
                    method: 'PUT',
                    headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                lastGhStatus = res.status;
                resolve(res.ok);
            } catch (e) {
                console.error('Upload Error:', e);
                resolve(false);
            }
        };
    });
}

async function fetchLatestSha(fileName) {
    try {
        const t = localStorage.getItem('MAFIAZ_GH_TOKEN');
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/Image/${fileName.split('/').map(encodeURIComponent).join('/')}?t=${Date.now()}`, t ? { headers: { 'Authorization': `token ${t.trim()}` } } : undefined);
        const data = await res.json();
        return data.sha;
    } catch(e) { return null; }
}

async function deleteGithubFile(fileName, sha, token) {
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/Image/${fileName.split('/').map(encodeURIComponent).join('/')}`;
    const res = await fetch(apiUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Delete ${fileName}`, sha: sha })
    });
    lastGhStatus = res.status;
    return res.ok;
}

// 카드용 작은 이미지(가로 THUMB_W, webp)를 만들어 Image/thumb/ 에 올림 (움직이는 gif 는 첫 장면)
async function makeThumbBlob(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch (e) { return null; }
    const sc = Math.min(1, THUMB_W / bmp.width);
    const cw = Math.max(1, Math.round(bmp.width * sc)), ch = Math.max(1, Math.round(bmp.height * sc));
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    cv.getContext('2d').drawImage(bmp, 0, 0, cw, ch);
    return await new Promise(res => cv.toBlob(res, 'image/webp', 0.78));
}
async function putThumb(fileName, blob, token) {
    try {
        const tb = await makeThumbBlob(blob);
        if (!tb) return;
        const path = 'thumb/' + thumbName(fileName);
        const sha = await fetchLatestSha(path);
        await uploadGithubFile(path, tb, token, sha || undefined);
    } catch (e) { console.error('Thumb Upload Error:', e); }
}
async function deleteThumb(fileName, token) {
    try {
        const path = 'thumb/' + thumbName(fileName);
        const sha = await fetchLatestSha(path);
        if (sha) await deleteGithubFile(path, sha, token);
    } catch (e) { console.error('Thumb Delete Error:', e); }
}

// 이미 올라간 이미지 중 썸네일이 없는 것을 한꺼번에 만들어 올림 (컴퓨터에 파일이 없어도 됨)
// 40개씩 묶어서 커밋 1번 → Pages 빌드가 여러 번 돌지 않음
async function generateMissingThumbs() {
    if (!isAdmin) return;
    const btn = document.getElementById('thumbBtn');
    const label = btn ? btn.textContent : '';
    const setLabel = t => { if (btn) btn.textContent = t; };
    if (btn && btn.dataset.busy) return;

    const token = getGithubToken();
    if (!token) return;
    const H = { 'Authorization': `token ${token.trim()}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const api = p => `https://api.github.com/repos/${GITHUB_REPO}${p}`;
    const call = async (method, p, body) => {
        const r = await fetch(api(p), { method, headers: H, body: body ? JSON.stringify(body) : undefined });
        lastGhStatus = r.status;
        if (!r.ok) throw new Error(method + ' ' + p + ' → ' + r.status);
        return r.json();
    };
    const toB64 = blob => new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onloadend = () => res(String(fr.result).split(',')[1]);
        fr.onerror = rej;
        fr.readAsDataURL(blob);
    });
    const getBlob = async it => {
        for (const u of [it.url, it.rawUrl]) {
            try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) return await r.blob(); } catch (e) {}
        }
        return null;
    };

    try {
        if (btn) btn.dataset.busy = '1';
        setLabel('확인 중...');
        const have = new Set();
        const tr = await fetch(api('/git/trees/main:Image/thumb?t=' + Date.now()), { headers: H });
        if (tr.status === 401) { lastGhStatus = 401; ghFailAlert('썸네일 생성'); return; }
        if (tr.ok) { const j = await tr.json(); (j.tree || []).forEach(t => have.add(t.path)); }

        const missing = galleryItems.filter(it => !have.has(thumbName(it.fileName)));
        if (!missing.length) { alert('모든 이미지에 썸네일이 이미 있습니다.'); return; }
        if (!confirm(`썸네일이 없는 이미지 ${missing.length}개의 작은 이미지를 만들어 올립니다.\n(이미지 수에 따라 몇 분 걸릴 수 있으니 창을 닫지 마세요) 계속할까요?`)) return;

        const BATCH = 40;
        let made = 0, failed = 0;
        for (let i = 0; i < missing.length; i += BATCH) {
            const part = missing.slice(i, i + BATCH);
            const entries = [];
            for (let k = 0; k < part.length; k += 4) {          // 4개씩 동시에
                await Promise.all(part.slice(k, k + 4).map(async it => {
                    try {
                        const blob = await getBlob(it);
                        const tb = blob && await makeThumbBlob(blob);
                        if (!tb) { failed++; return; }
                        const b = await call('POST', '/git/blobs', { content: await toB64(tb), encoding: 'base64' });
                        entries.push({ path: 'Image/thumb/' + thumbName(it.fileName), mode: '100644', type: 'blob', sha: b.sha });
                    } catch (e) {
                        if (lastGhStatus === 401 || lastGhStatus === 403 || lastGhStatus === 404) throw e;
                        failed++;
                    }
                }));
                setLabel(`썸네일 ${Math.min(i + k + 4, missing.length)}/${missing.length}`);
            }
            if (!entries.length) continue;
            const ref = await call('GET', '/git/ref/heads/main');
            const parentSha = ref.object.sha;
            const parent = await call('GET', '/git/commits/' + parentSha);
            const tree = await call('POST', '/git/trees', { base_tree: parent.tree.sha, tree: entries });
            const commit = await call('POST', '/git/commits', { message: `Add thumbnails (${entries.length})`, tree: tree.sha, parents: [parentSha] });
            await call('PATCH', '/git/refs/heads/main', { sha: commit.sha });
            made += entries.length;
        }
        alert(`썸네일 ${made}개를 올렸습니다.${failed ? `\n(${failed}개는 만들지 못했습니다)` : ''}\nGitHub Pages 반영까지 1~2분 걸릴 수 있습니다.`);
    } catch (e) {
        console.error('Thumb Batch Error:', e);
        ghFailAlert('썸네일 생성');
    } finally {
        if (btn) { delete btn.dataset.busy; }
        setLabel(label || '🖼 썸네일 만들기');
    }
}

async function deleteCurrentPost() {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const item = filteredItems[currentModalIndex];
    const token = getGithubToken();
    if (!token || !item) return;

    const sha = await fetchLatestSha(item.fileName) || item.sha;
    const success = await deleteGithubFile(item.fileName, sha, token);

    if (success) {
        await deleteThumb(item.fileName, token);
        alert('성공적으로 삭제되었습니다.');
        document.getElementById('polaroidModal').style.display = 'none';
        loadGalleryData();
    } else {
        ghFailAlert('삭제');
    }
}

// ── 시작 ──
function refreshAfterAuthChange() {
    checkAdminStatus();
    buildTagFilterButtons();
    renderGalleryGrid();
}
MZ.initLogin({ onLogin: refreshAfterAuthChange, onLogout: refreshAfterAuthChange });
checkAdminStatus();
loadDesignSettings();
MZ.applyBackground();
loadGalleryData(true);