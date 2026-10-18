/* =====================================================================
   MAFIAZ Character 페이지 (그누보드 캐릭터 게시판 → GitHub / Netlify / Supabase 이전판)
   - Character/index.html 하나로 방문자(보기 전용)와 관리자(글쓰기·수정·삭제)를 모두 처리
     → 로그인 상태(localStorage)에 따라 startCharacter(true / false) 호출
   - 데이터는 Supabase 'characters' 테이블, 그림 파일은 GitHub 저장소에 두고 경로만 저장
   - 주소 형식(해시): #/ 목록, #/list/분류/페이지, #/view/번호, #/write, #/edit/번호
   ===================================================================== */
(function () {
    const SUPABASE_URL = 'https://hkwarwmmkzubqvwwyazp.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd2Fyd21ta3p1YnF2d3d5YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI0ODYsImV4cCI6MjEwNzgwODQ4Nn0.vInox6kk9Md6t2eayA05G8Lax2oP92SBl6HF_2XdJA8';
    const TABLE = 'characters';
    const PER_PAGE = 12;

    const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
    window.mafiazSb = sb;

    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // 그림 경로 → 실제 주소
    //  - github.com/.../blob/... 화면 주소는 raw.githubusercontent.com 직접 주소로 변환
    //  - http(s):// 와 / 로 시작하는 주소는 그대로
    //  - 그 외(예: Image/a.webp)는 사이트 최상위 폴더 기준 경로로 보고, Character 폴더 한 칸 위에서 찾음
    function imgUrl(u) {
        u = String(u || '').trim();
        if (!u) return '';
        const m = u.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|raw)\/([^?#]+)/i);
        if (m) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3];
        if (/^https?:\/\//i.test(u) || u.charAt(0) === '/') return u;
        return new URL('../' + u.replace(/^\.\//, ''), location.href).href;
    }

    // 본문: HTML 은 전부 막고(글자로만 표시), 줄바꿈과 http(s) 링크만 살림
    function formatContent(text) {
        let h = esc(text);
        h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer nofollow">$1</a>');
        return h.replace(/\r?\n/g, '<br>');
    }

    function fmtDate(v) {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d)) return '';
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    // 사이트 공통 배경(메인 페이지 관리자 패널에서 설정한 값)을 그대로 적용
    async function applySiteBackground() {
        if (!sb) return;
        try {
            const { data } = await sb.from('layouts').select('layout_data').eq('id', 'settings_main').maybeSingle();
            let d = data && data.layout_data;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            const bg = document.getElementById('pageBg');
            if (!bg || !d) return;
            const raw = String(d.bgImage || '').trim();
            let url = raw ? imgUrl(raw) : '';
            if (url) bg.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
            if (d.bgDim !== undefined) bg.style.setProperty('--bg-dim', d.bgDim);
        } catch (e) { /* 배경은 없어도 페이지는 동작 */ }
    }

    window.startCharacter = function (isAdmin) {
        const app = document.getElementById('charApp');
        let items = [];
        let loaded = false;
        let loadError = '';

        // 화면 배율 맞춤: 메인 페이지(editor.js)와 같은 계산으로 1500x900 박스를 화면에 맞춰 확대/축소
        function fitStage() {
            const area = document.getElementById('stageArea');
            const frame = document.getElementById('stageFrame');
            const stage = document.getElementById('mh-gpfto');
            if (!area || !frame || !stage) return;
            const cs = getComputedStyle(area);
            const availW = area.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
            const availH = window.innerHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
            const bw = stage.offsetWidth || 1500;
            const bh = stage.offsetHeight || 900;
            const sc = Math.max(0.25, Math.min(availW / bw, availH / bh));
            stage.style.transform = 'scale(' + sc + ')';
            frame.style.width = Math.round(bw * sc) + 'px';
            frame.style.height = Math.round(bh * sc) + 'px';
        }
        window.addEventListener('resize', fitStage);
        fitStage();

        const SQL_HELP =
`create table characters (
  id bigint generated always as identity primary key,
  category text default '',
  subject text not null,
  name text default '',
  content text default '',
  char_image text default '',
  thumb_image text default '',
  created_at timestamptz default now()
);
alter table characters disable row level security;`;

        // ── 데이터 ──
        async function loadItems() {
            if (!sb) { loadError = 'Supabase SDK를 불러오지 못했습니다.'; return; }
            const { data, error } = await sb.from(TABLE).select('*').order('id', { ascending: false });
            if (error) { loadError = error.message || String(error); return; }
            items = data || [];
            loaded = true;
            loadError = '';
        }

        // ── 라우팅 ──
        function parseRoute() {
            const parts = location.hash.replace(/^#\/?/, '').split('/').map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
            return { name: parts[0] || 'list', a: parts[1] || '', b: parts[2] || '' };
        }
        function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

        function render() {
            const r = parseRoute();
            if (!loaded) { renderLoadError(); return; }
            if ((r.name === 'write' || r.name === 'edit') && !isAdmin) { go('#/'); return; }
            if (r.name === 'view') renderView(r.a);
            else if (r.name === 'write') renderForm(null);
            else if (r.name === 'edit') renderForm(r.a);
            else renderList(r.a, parseInt(r.b) || 1);
            hookImageFallbacks();
            window.scrollTo(0, 0);
        }

        function renderLoadError() {
            const missing = /relation|does not exist|schema cache|characters/i.test(loadError);
            app.innerHTML = '<div class="char_msg err">캐릭터 목록을 불러오지 못했습니다.<br>' + esc(loadError) +
                (missing ? '<br><br>Supabase의 SQL Editor에서 아래 내용을 한 번 실행해 테이블을 만들어 주세요.<br><pre>' + esc(SQL_HELP) + '</pre>' : '') + '</div>';
        }

        // 그림을 못 불러오면 "No Image" 표시로 교체
        function hookImageFallbacks() {
            app.querySelectorAll('img[data-fb]').forEach(img => {
                img.addEventListener('error', () => {
                    img.style.display = 'none';
                    img.parentNode.classList.add('is-noimg');
                }, { once: true });
            });
        }

        // ── 목록 ──
        function renderList(cat, page) {
            const cats = [];
            items.forEach(it => { if (it.category && cats.indexOf(it.category) < 0) cats.push(it.category); });
            const filtered = cat ? items.filter(it => it.category === cat) : items;
            const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
            page = Math.min(Math.max(1, page), pages);
            const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

            const catHtml = cats.length
                ? '<nav><ul class="char_cate_nav"><li><a href="#/" class="' + (!cat ? 'on' : '') + '">전체</a></li>' +
                  cats.map(c => '<li><a href="#/list/' + encodeURIComponent(c) + '" class="' + (c === cat ? 'on' : '') + '">' + esc(c) + '</a></li>').join('') +
                  '</ul></nav>'
                : '<span></span>';

            const gridHtml = slice.length
                ? slice.map(it => {
                    const src = imgUrl(it.thumb_image || it.char_image);
                    return '<li class="char_item"><a href="#/view/' + it.id + '" class="char_link">' +
                        '<div class="char_thumb' + (src ? '' : ' is-noimg') + '">' +
                        (src ? '<img src="' + esc(src) + '" alt="' + esc(it.subject) + '" loading="lazy" data-fb>' : '') +
                        '</div><div class="char_info"><strong class="char_subject">' + esc(it.subject) + '</strong>' +
                        '<span class="char_name">' + esc(it.name) + '</span></div></a></li>';
                }).join('')
                : '<li class="char_empty">등록된 캐릭터가 없습니다.</li>';

            let pagerHtml = '';
            if (pages > 1) {
                pagerHtml = '<div class="char_pages">';
                for (let i = 1; i <= pages; i++) {
                    pagerHtml += '<a href="#/list/' + encodeURIComponent(cat) + '/' + i + '" class="' + (i === page ? 'on' : '') + '">' + i + '</a>';
                }
                pagerHtml += '</div>';
            }

            app.innerHTML =
                '<div class="char_list_top">' + catHtml +
                '<div class="char_list_btn">' + (isAdmin ? '<a href="#/write" class="btn btn_primary">글쓰기</a>' : '') + '</div></div>' +
                '<ul class="char_grid">' + gridHtml + '</ul>' + pagerHtml;
        }

        // ── 보기 ──
        function renderView(id) {
            const idx = items.findIndex(it => String(it.id) === String(id));
            if (idx < 0) { app.innerHTML = '<div class="char_msg">존재하지 않는 캐릭터입니다.<br><br><a href="#/" class="btn">목록</a></div>'; return; }
            const it = items[idx];
            const newer = items[idx - 1];   // 목록에서 바로 위(더 최근) 글
            const older = items[idx + 1];   // 목록에서 바로 아래 글
            const main = imgUrl(it.char_image);
            const thumb = imgUrl(it.thumb_image);

            app.innerHTML =
                '<article class="char_view">' +
                '<header class="char_header"><div>' +
                '<h2 class="char_title">' + (it.category ? '<span class="char_cate">' + esc(it.category) + '</span>' : '') + esc(it.subject) + '</h2>' +
                '<div class="char_meta"><span class="char_name">' + esc(it.name) + '</span><span class="char_date">' + esc(fmtDate(it.created_at)) + '</span></div>' +
                '</div><div class="char_buttons">' +
                '<a href="#/" class="btn">목록</a>' +
                (isAdmin ? '<a href="#/edit/' + it.id + '" class="btn">수정</a><button type="button" class="btn btn_danger" id="btnDel">삭제</button>' : '') +
                '<button type="button" class="btn" id="btnShare">공유</button>' +
                '</div></header>' +
                '<div class="char_body">' +
                '<div class="char_image_area">' +
                (main ? '<div class="char_noimg_box" style="background:none;aspect-ratio:auto;"><img src="' + esc(main) + '" alt="' + esc(it.subject) + '" class="char_image" data-fb></div>'
                      : '<div class="char_noimg_box"><div class="char_noimg">No Image</div></div>') +
                '</div>' +
                '<div class="char_content_area">' +
                (thumb ? '<div class="char_thumb_area"><img src="' + esc(thumb) + '" alt="썸네일" class="char_thumb_img"></div>' : '') +
                '<div class="char_content">' + formatContent(it.content) + '</div>' +
                '</div></div>' +
                ((newer || older)
                    ? '<ul class="char_nav">' +
                      (newer ? '<li class="prev"><span>이전</span><a href="#/view/' + newer.id + '">' + esc(newer.subject) + '</a></li>' : '') +
                      (older ? '<li class="next"><span>다음</span><a href="#/view/' + older.id + '">' + esc(older.subject) + '</a></li>' : '') +
                      '</ul>' : '') +
                '</article>';

            const share = document.getElementById('btnShare');
            if (share) share.addEventListener('click', async () => {
                const url = location.href;
                try { await navigator.clipboard.writeText(url); share.textContent = '링크 복사됨'; setTimeout(() => { share.textContent = '공유'; }, 1500); }
                catch (e) { window.prompt('아래 주소를 복사하세요.', url); }
            });

            const del = document.getElementById('btnDel');
            if (del) del.addEventListener('click', async () => {
                if (!confirm('정말 삭제하시겠습니까?')) return;
                del.disabled = true;
                const { error } = await sb.from(TABLE).delete().eq('id', it.id);
                if (error) { alert('삭제 실패: ' + error.message); del.disabled = false; return; }
                await loadItems();
                go('#/');
            });
        }

        // ── 작성 / 수정 (관리자) ──
        function renderForm(id) {
            const editing = id !== null;
            const it = editing ? items.find(x => String(x.id) === String(id)) : null;
            if (editing && !it) { app.innerHTML = '<div class="char_msg">존재하지 않는 캐릭터입니다.<br><br><a href="#/" class="btn">목록</a></div>'; return; }
            const v = it || { category: '', subject: '', name: '', content: '', char_image: '', thumb_image: '' };

            const cats = [];
            items.forEach(x => { if (x.category && cats.indexOf(x.category) < 0) cats.push(x.category); });

            app.innerHTML =
                '<form class="char_form" id="charForm" autocomplete="off">' +
                '<h2>' + (editing ? '캐릭터 수정' : '캐릭터 등록') + '</h2>' +
                '<div class="f_row"><label for="fCate">분류 (선택)</label>' +
                '<input type="text" id="fCate" list="catList" value="' + esc(v.category) + '" placeholder="예: 마피아, 시민 (비우면 분류 없음)">' +
                '<datalist id="catList">' + cats.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist></div>' +
                '<div class="f_row"><label for="fSubject">제목</label><input type="text" id="fSubject" value="' + esc(v.subject) + '" maxlength="255" placeholder="캐릭터 이름 / 제목" required></div>' +
                '<div class="f_row"><label for="fName">작성자·소유자 표시 (선택)</label><input type="text" id="fName" value="' + esc(v.name) + '" maxlength="100" placeholder="목록 카드 아래에 표시됩니다"></div>' +
                '<div class="f_two">' +
                '<div class="f_box"><label for="fThumb">썸네일 이미지 경로</label>' +
                '<input type="text" id="fThumb" value="' + esc(v.thumb_image) + '" placeholder="Image/character/thumb1.webp">' +
                '<div class="f_hint">목록 카드에 보이는 그림입니다. 비우면 캐릭터 이미지가 대신 쓰입니다.</div>' +
                '<div class="f_preview" id="pvThumb"></div><div class="f_status" id="stThumb"></div></div>' +
                '<div class="f_box"><label for="fChar">캐릭터 이미지 경로</label>' +
                '<input type="text" id="fChar" value="' + esc(v.char_image) + '" placeholder="Image/character/char1.webp">' +
                '<div class="f_hint">상세 화면 왼쪽에 크게 보이는 그림입니다.</div>' +
                '<div class="f_preview" id="pvChar"></div><div class="f_status" id="stChar"></div></div>' +
                '</div>' +
                '<div class="f_hint" style="margin:-8px 0 16px;">그림 파일은 GitHub 저장소에 올린 뒤 <b>Image/파일명.webp</b> 처럼 경로만 입력하세요. GitHub 파일 주소(github.com/…/blob/…)를 붙여넣어도 자동 변환됩니다.</div>' +
                '<div class="f_row"><label for="fContent">내용</label><textarea id="fContent" placeholder="캐릭터 설명을 입력하세요. 줄바꿈과 http(s) 링크가 그대로 표시됩니다.">' + esc(v.content) + '</textarea></div>' +
                '<div class="btn_confirm"><a href="' + (editing ? '#/view/' + it.id : '#/') + '" class="btn">취소</a>' +
                '<button type="submit" class="btn btn_primary" id="btnSave">' + (editing ? '수정완료' : '작성완료') + '</button></div>' +
                '</form>';

            // 이미지 미리보기
            function bindPreview(inputId, pvId, stId) {
                const input = document.getElementById(inputId);
                const pv = document.getElementById(pvId);
                const st = document.getElementById(stId);
                let seq = 0;
                function update() {
                    const url = imgUrl(input.value);
                    const my = ++seq;
                    pv.innerHTML = ''; st.textContent = '';
                    if (!url) return;
                    const img = new Image();
                    img.onload = () => { if (my !== seq) return; pv.appendChild(img); st.style.color = '#2ed573'; st.textContent = '✔ 이미지를 불러왔습니다'; };
                    img.onerror = () => { if (my !== seq) return; st.style.color = '#ff4757'; st.textContent = '✖ 이미지를 불러오지 못했습니다. 경로와 대소문자를 확인하세요.'; };
                    img.src = url;
                }
                input.addEventListener('input', update);
                update();
            }
            bindPreview('fThumb', 'pvThumb', 'stThumb');
            bindPreview('fChar', 'pvChar', 'stChar');

            document.getElementById('charForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const subject = document.getElementById('fSubject').value.trim();
                if (!subject) { alert('제목을 입력해 주세요.'); return; }
                const row = {
                    category: document.getElementById('fCate').value.trim(),
                    subject: subject,
                    name: document.getElementById('fName').value.trim(),
                    content: document.getElementById('fContent').value,
                    char_image: document.getElementById('fChar').value.trim(),
                    thumb_image: document.getElementById('fThumb').value.trim()
                };
                const btn = document.getElementById('btnSave');
                btn.disabled = true; btn.textContent = '저장중';
                let savedId = id, error = null;
                if (editing) {
                    ({ error } = await sb.from(TABLE).update(row).eq('id', it.id));
                } else {
                    const res = await sb.from(TABLE).insert([row]).select().single();
                    error = res.error;
                    if (!error && res.data) savedId = res.data.id;
                }
                if (error) {
                    alert('저장 실패: ' + (error.message || error));
                    btn.disabled = false; btn.textContent = editing ? '수정완료' : '작성완료';
                    return;
                }
                await loadItems();
                go(savedId ? '#/view/' + savedId : '#/');
            });
        }

        window.addEventListener('hashchange', render);

        applySiteBackground();
        app.innerHTML = '<div class="char_msg">불러오는 중...</div>';
        loadItems().then(render);
    };
})();
