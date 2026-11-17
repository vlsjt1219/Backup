/* =====================================================================
   MAFIAZ Character 페이지 (그누보드 캐릭터 게시판 → GitHub / Netlify / Supabase 이전판)
   ===================================================================== */
(function () {
    const MZ = window.MZ;
    const sb = MZ.sb;
    const esc = MZ.esc;
    const imgUrl = MZ.imgUrl;
    const TABLE = 'characters';
    const PER_PAGE = 12;

    // 네이버 블로그처럼 고를 수 있는 인용구 / 구분선 모양 (CSS 는 character.css 의 .mz-quote / .mz-hr 와 짝)
    const QUOTE_STYLES = [['marks', '따옴표'], ['bar', '버티컬 라인'], ['bubble', '말풍선'], ['line', '라인 & 따옴표'], ['note', '포스트잇'], ['frame', '프레임']];
    const HR_STYLES = [['short', '짧은 선'], ['line', '실선'], ['dash', '점선'], ['dots', '점'], ['diamond', '마름모'], ['spark', '반짝이']];
    const HR_MARK = { diamond: '◆', spark: '✦' };
    const PH_TEXT = '내용을 입력하세요.', PH_SRC = '출처 입력';

    function quoteHtml(k, text) {
        const id = 'q' + Date.now();
        const body = text ? esc(text).replace(/\n/g, '<br>') : PH_TEXT;
        let h = '<blockquote class="mz-quote q-' + k + '" data-mzq="' + id + '"><div class="q-text' + (text ? '' : ' ph') + '" data-ph="' + PH_TEXT + '">' + body + '</div>';
        if (k === 'bar') h += '<div class="q-src ph" data-ph="' + PH_SRC + '">' + PH_SRC + '</div>';
        return { id: id, html: h + '</blockquote><div><br></div>' };
    }
    function hrHtml(k) {
        return '<div class="mz-hr hr-' + k + '" contenteditable="false">' + (HR_MARK[k] ? '<span>' + HR_MARK[k] + '</span>' : '') + '</div><div><br></div>';
    }
    function toggleHtml(id) {
        return '<div class="mz-toggle open" data-mzt="' + id + '"><div class="mz-tg-head"><span class="mz-tg-arrow" contenteditable="false"></span><div class="mz-tg-title">토글 제목</div></div><div class="mz-tg-body"><div><br></div></div></div><div><br></div>';
    }
    // 저장 직전: 안 고친 안내문구(내용을 입력하세요 등)와 선택 표시를 제거
    function cleanEditorHtml(root) {
        root.querySelectorAll('.mz-hr.sel').forEach(n => n.classList.remove('sel'));
        root.querySelectorAll('.mz-sel').forEach(n => { n.classList.remove('mz-sel'); if (!n.getAttribute('class')) n.removeAttribute('class'); });
        root.querySelectorAll('.mz-quote').forEach(q => {
            q.querySelectorAll('.ph').forEach(n => n.remove());
            if (!q.textContent.trim()) q.remove();
        });
    }

    // 이미지 주소 → <img> 의 src 속성 문자열. GitHub 선택 창에서 일부만 잘라 고른 주소(#crop=)는 hookImageFallbacks 가 잘린 조각으로 채움
    function srcAttr(url) {
        return (String(url).indexOf('#crop=') >= 0 ? 'data-crop-src="' : 'src="') + esc(url) + '"';
    }

    function formatContent(text) {
        if (!text) return '';
        return text;
    }

    window.startCharacter = function (isAdmin) {
        const app = document.getElementById('charApp');

        // 토글 접기/펼치기: 보기 화면은 제목 줄 전체, 편집 화면은 화살표만 (제목은 글 입력용)
        app.addEventListener('click', e => {
            const arrow = e.target.closest('.mz-tg-arrow');
            const head = e.target.closest('.mz-tg-head');
            const inEditor = e.target.closest('.editor-content-editable');
            if (!arrow && !(head && !inEditor)) return;
            const tg = e.target.closest('.mz-toggle');
            if (!tg) return;
            e.preventDefault();
            tg.classList.toggle('open');
        });
        let items = [];
        let loaded = false;
        let loadError = '';

        MZ.fitStage();

        let lbClose = null;   // 열려 있는 이미지 모달을 닫는 함수
        let formCleanup = null;   // 글쓰기 폼이 닫힐 때 문서 전체에 건 이벤트를 걷어내는 함수
        document.addEventListener('mousedown', e => {
            if (e.target.closest && e.target.closest('.tb-drop')) return;
            document.querySelectorAll('.tb-drop.open').forEach(d => d.classList.remove('open'));
        });

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

        async function loadItems() {
            if (!sb) { loadError = 'Supabase SDK를 불러오지 못했습니다.'; return; }
            const { data, error } = await sb.from(TABLE).select('*').order('id', { ascending: false });
            if (error) { loadError = error.message || String(error); return; }
            items = data || [];
            loaded = true;
            loadError = '';
        }

        function parseRoute() {
            const parts = location.hash.replace(/^#\/?/, '').split('/').map(p => { try { return decodeURIComponent(p); } catch (e) { return p; } });
            return { name: parts[0] || 'list', a: parts[1] || '', b: parts[2] || '' };
        }
        function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

        function render() {
            const r = parseRoute();
            if (lbClose) lbClose();
            // body에 붙어 있는 표 크기 조절 핸들이 화면 이동 후에도 남지 않도록 정리
            document.querySelectorAll('.table-resize-box, .table-line-layer').forEach(el => el.remove());
            if (formCleanup) { formCleanup(); formCleanup = null; }
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
            app.innerHTML = '<div class="char_msg err">캐릭터 목록을 불러오지 못했습니다.<br>' + esc(loadError) + '</div>';
        }

        function hookImageFallbacks() {
            app.querySelectorAll('img[data-crop-src]').forEach(img => MZ.setImgSrc(img, img.getAttribute('data-crop-src')));
            app.querySelectorAll('img[data-fb]').forEach(img => {
                img.addEventListener('error', () => {
                    img.style.display = 'none';
                    img.parentNode.classList.add('is-noimg');
                }, { once: true });
            });
        }

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
                        (src ? '<img ' + srcAttr(src) + ' alt="' + esc(it.subject) + '" loading="lazy" data-fb>' : '') +
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

        // ───────── 이미지 원본 보기 모달 (확대·축소·이동) ─────────
        function openImageViewer(url, alt) {
            if (lbClose) lbClose();
            const ov = document.createElement('div');
            ov.className = 'mz-lightbox';
            ov.setAttribute('role', 'dialog');
            ov.setAttribute('aria-label', '이미지 원본 보기');
            ov.innerHTML =
                '<div class="mzlb-stage"><img class="mzlb-img" alt="' + esc(alt || '') + '" draggable="false"></div>' +
                '<div class="mzlb-msg">불러오는 중...</div>' +
                '<div class="mzlb-bar">' +
                '<button type="button" data-lb="out" title="축소 (-)">－</button>' +
                '<span class="mzlb-zoom">100%</span>' +
                '<button type="button" data-lb="in" title="확대 (+)">＋</button>' +
                '<button type="button" data-lb="fit" title="화면에 맞춤">화면에 맞춤</button>' +
                '<button type="button" data-lb="one" title="원본 크기 (0)">원본 크기</button>' +
                '<button type="button" data-lb="close" title="닫기 (Esc)">닫기 ✕</button>' +
                '</div>';
            document.body.appendChild(ov);
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            const stage = ov.querySelector('.mzlb-stage');
            const img = ov.querySelector('.mzlb-img');
            const zoomLabel = ov.querySelector('.mzlb-zoom');
            const msg = ov.querySelector('.mzlb-msg');
            let s = 1, x = 0, y = 0, nw = 0, nh = 0, ready = false;
            const MIN = 0.05, MAX = 12;

            const apply = () => {
                img.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
                zoomLabel.textContent = Math.round(s * 100) + '%';
            };
            const view = () => { const r = stage.getBoundingClientRect(); return { w: r.width, h: r.height }; };
            const center = () => { const v = view(); x = (v.w - nw * s) / 2; y = (v.h - nh * s) / 2; };
            const setOne = () => { s = 1; center(); apply(); };
            const setFit = () => { const v = view(); s = Math.min(1, (v.w * 0.96) / nw, (v.h * 0.9) / nh); center(); apply(); };
            // (cx, cy) 화면 좌표를 고정점으로 확대/축소
            const zoomAt = (cx, cy, ns) => {
                ns = Math.min(MAX, Math.max(MIN, ns));
                x = cx - (cx - x) * ns / s;
                y = cy - (cy - y) * ns / s;
                s = ns; apply();
            };

            img.onload = () => {
                nw = img.naturalWidth; nh = img.naturalHeight;
                img.style.width = nw + 'px'; img.style.height = nh + 'px';
                ready = true; msg.style.display = 'none'; img.style.opacity = '1';
                setFit();   // 처음에는 화면에 맞춰 가운데에 표시 (원본 크기는 버튼/더블클릭)
            };
            img.onerror = () => { msg.textContent = '이미지를 불러오지 못했습니다.'; };
            if (MZ.setImgSrc) MZ.setImgSrc(img, url); else img.src = url;

            // 드래그 이동 + 두 손가락 확대/축소
            const pts = new Map();
            let pinch = null, moved = 0, downTarget = null;
            stage.addEventListener('pointerdown', e => {
                if (e.button !== undefined && e.button > 0) return;
                try { stage.setPointerCapture(e.pointerId); } catch (err) {}
                pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (pts.size === 1) { moved = 0; downTarget = e.target; }
                if (pts.size === 2) {
                    const a = Array.from(pts.values());
                    pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, s: s };
                }
                stage.classList.add('grab');
            });
            stage.addEventListener('pointermove', e => {
                const p = pts.get(e.pointerId);
                if (!p || !ready) return;
                const dx = e.clientX - p.x, dy = e.clientY - p.y;
                p.x = e.clientX; p.y = e.clientY;
                moved += Math.abs(dx) + Math.abs(dy);
                if (pts.size === 1) { x += dx; y += dy; apply(); }
                else if (pts.size === 2 && pinch) {
                    const a = Array.from(pts.values());
                    const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
                    const r = stage.getBoundingClientRect();
                    zoomAt((a[0].x + a[1].x) / 2 - r.left, (a[0].y + a[1].y) / 2 - r.top, pinch.s * d / pinch.d);
                }
            });
            const endPtr = e => {
                if (!pts.has(e.pointerId)) return;
                pts.delete(e.pointerId); pinch = null;
                if (!pts.size) {
                    stage.classList.remove('grab');
                    // 이미지 바깥 빈 곳을 가볍게 클릭하면 닫기
                    if (e.type === 'pointerup' && moved < 5 && downTarget === stage) close();
                }
            };
            stage.addEventListener('pointerup', endPtr);
            stage.addEventListener('pointercancel', endPtr);
            stage.addEventListener('wheel', e => {
                e.preventDefault();
                if (!ready) return;
                const r = stage.getBoundingClientRect();
                zoomAt(e.clientX - r.left, e.clientY - r.top, s * Math.exp(-e.deltaY * 0.0015));
            }, { passive: false });
            stage.addEventListener('dblclick', e => {
                if (!ready) return;
                if (Math.abs(s - 1) < 0.01) setFit(); else setOne();
            });

            ov.querySelector('.mzlb-bar').addEventListener('click', e => {
                const b = e.target.closest('[data-lb]');
                if (!b) return;
                const k = b.getAttribute('data-lb'), v = view();
                if (k === 'close') close();
                else if (!ready) return;
                else if (k === 'in') zoomAt(v.w / 2, v.h / 2, s * 1.25);
                else if (k === 'out') zoomAt(v.w / 2, v.h / 2, s / 1.25);
                else if (k === 'fit') setFit();
                else if (k === 'one') setOne();
            });

            const onKey = e => {
                if (e.key === 'Escape') { e.preventDefault(); close(); return; }
                if (!ready) return;
                const v = view();
                if (e.key === '+' || e.key === '=') zoomAt(v.w / 2, v.h / 2, s * 1.25);
                else if (e.key === '-' || e.key === '_') zoomAt(v.w / 2, v.h / 2, s / 1.25);
                else if (e.key === '0') setOne();
            };
            const onResize = () => { if (ready) { center(); apply(); } };
            document.addEventListener('keydown', onKey);
            window.addEventListener('resize', onResize);

            function close() {
                document.removeEventListener('keydown', onKey);
                window.removeEventListener('resize', onResize);
                document.body.style.overflow = prevOverflow;
                ov.remove();
                if (lbClose === close) lbClose = null;
            }
            lbClose = close;
        }

        function renderView(id) {
            const idx = items.findIndex(it => String(it.id) === String(id));
            if (idx < 0) { app.innerHTML = '<div class="char_msg">존재하지 않는 캐릭터입니다.<br><br><a href="#/" class="btn">목록</a></div>'; return; }
            const it = items[idx];
            const newer = items[idx - 1];
            const older = items[idx + 1];
            const main = imgUrl(it.char_image);
            const thumb = imgUrl(it.thumb_image);

            app.innerHTML =
                '<article class="char_view">' +
                '<header class="char_header">' +
                '<div class="char_buttons">' +
                '<a href="#/" class="btn">목록</a>' +
                (isAdmin ? '<a href="#/edit/' + it.id + '" class="btn">수정</a><button type="button" class="btn btn_danger" id="btnDel">삭제</button>' : '') +
                '<button type="button" class="btn" id="btnShare">공유</button>' +
                '</div>' +
                '<div class="char_header_center">' +
                '<h2 class="char_title">' + (it.category ? '<span class="char_cate">' + esc(it.category) + '</span>' : '') + esc(it.subject) + '</h2>' +
                '<div class="char_meta"><span class="char_name">' + esc(it.name) + '</span></div>' +
                '</div>' +
                '</header>' +
                '<div class="char_body">' +
                '<div class="char_image_area">' +
                (main ? '<div class="char_noimg_box" style="background:none;aspect-ratio:auto;"><img ' + srcAttr(main) + ' alt="' + esc(it.subject) + '" class="char_image" data-fb></div>'
                      : '<div class="char_noimg_box"><div class="char_noimg">No Image</div></div>') +
                '</div>' +
                '<div class="char_content_area">' +
                (thumb ? '<div class="char_thumb_area"><img ' + srcAttr(thumb) + ' alt="썸네일" class="char_thumb_img"></div>' : '') +
                '<div class="char_content">' + formatContent(it.content) + '</div>' +
                '</div></div>' +
                ((newer || older)
                    ? '<ul class="char_nav">' +
                      (newer ? '<li class="prev"><span>이전</span><a href="#/view/' + newer.id + '">' + esc(newer.subject) + '</a></li>' : '') +
                      (older ? '<li class="next"><span>다음</span><a href="#/view/' + older.id + '">' + esc(older.subject) + '</a></li>' : '') +
                      '</ul>' : '') +
                '</article>';

            // 캐릭터 이미지·썸네일 클릭 → 원본 크기 모달
            [['.char_image', main], ['.char_thumb_img', thumb]].forEach(pair => {
                const el = app.querySelector(pair[0]);
                if (!el || !pair[1]) return;
                el.classList.add('zoomable');
                el.title = '클릭하면 원본 크기로 볼 수 있습니다';
                el.addEventListener('click', () => openImageViewer(pair[1], it.subject));
            });

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
                '<div class="f_box"><label for="fChar">캐릭터 이미지 경로</label>' +
                '<div class="f_inputrow"><input type="text" id="fChar" value="' + esc(v.char_image) + '" placeholder="Image/character/char1.webp"><button type="button" class="btn" id="btnPickChar">GitHub에서 선택</button></div>' +
                '<div class="f_hint">상세 화면 왼쪽에 크게 보이는 그림입니다.</div>' +
                '<div class="f_preview" id="pvChar"></div><div class="f_status" id="stChar"></div></div>' +
                '<div class="f_box"><label for="fThumb">썸네일 이미지 경로</label>' +
                '<div class="f_inputrow"><input type="text" id="fThumb" value="' + esc(v.thumb_image) + '" placeholder="Image/character/thumb1.webp"><button type="button" class="btn" id="btnPickThumb">GitHub에서 선택</button></div>' +
                '<div class="f_hint">목록 카드에 보이는 그림입니다. 비우면 캐릭터 이미지가 대신 쓰입니다.</div>' +
                '<div class="f_preview" id="pvThumb"></div><div class="f_status" id="stThumb"></div></div>' +
                '</div>' +
                '<div class="f_hint" style="margin:-8px 0 16px;">그림 파일은 GitHub 저장소에 올린 뒤 <b>[GitHub에서 선택]</b>으로 고르거나, <b>Image/파일명.webp</b> 처럼 경로를 직접 입력하세요.</div>' +
                '<div class="f_row"><label>내용</label>' +
                // 툴바 구성
                '<div class="editor-toolbar">' +
                '<select id="edFontName">' +
                '<option value="">글꼴 선택</option>' +
                '<option value="Pretendard">Pretendard</option>' +
                '<option value="Playfair Display">Playfair Display</option>' +
                '<option value="Courier Prime">Courier Prime</option>' +
                '<option value="Bebas Neue">Bebas Neue</option>' +
                '<option value="Zen Antique">Zen Antique</option>' +
                '<option value="Noto Serif SC">Noto Serif SC</option>' +
                '<option value="Nanum Myeongjo">Nanum Myeongjo</option>' +
                '<option value="Noto Serif KR">Noto Serif KR</option>' +
                '<option value="Cinzel">Cinzel</option>' +
                '<option value="Montserrat">Montserrat</option>' +
                '<option value="Gowun Batang">Gowun Batang</option>' +
                '<option value="Black Han Sans">Black Han Sans</option>' +
                '</select>' +
                '<select id="edFontSize"><option value="">크기</option><option value="1">10px</option><option value="2">13px</option><option value="3">16px</option><option value="4">18px</option><option value="5">24px</option><option value="6">32px</option></select>' +
                '<span class="tb-sep"></span>' +
                '<button type="button" data-cmd="bold" title="굵게"><b>B</b></button>' +
                '<button type="button" data-cmd="italic" title="기울임"><i>I</i></button>' +
                '<button type="button" data-cmd="underline" title="밑줄"><u>U</u></button>' +
                '<button type="button" data-cmd="strikeThrough" title="취소선"><strike>T</strike></button>' +
                '<span class="tb-sep"></span>' +
                '<label title="글자색" style="font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:2px;">글자색<input type="color" id="edForeColor" style="width:20px;height:20px;border:none;background:none;cursor:pointer;"></label>' +
                '<label title="바탕색" style="font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:2px;">바탕색<input type="color" id="edBackColor" style="width:20px;height:20px;border:none;background:none;cursor:pointer;" value="#ffff00"></label>' +
                '<button type="button" id="edClearBg" title="바탕색 제거">바탕색 지우기</button>' +
                '<span class="tb-sep"></span>' +
                '<button type="button" data-cmd="justifyLeft" title="왼쪽 정렬">좌정렬</button>' +
                '<button type="button" data-cmd="justifyCenter" title="가운데 정렬">중앙정렬</button>' +
                '<button type="button" data-cmd="justifyRight" title="오른쪽 정렬">우정렬</button>' +
                '<select id="edLineHeight" title="줄 간격 (선택한 줄/문단, 커서가 있는 줄에 적용)"><option value="">줄 간격</option><option value="reset">기본</option><option value="1.2">1.2</option><option value="1.5">1.5</option><option value="1.8">1.8</option><option value="2">2.0</option><option value="2.5">2.5</option><option value="3">3.0</option></select>' +
                '<select id="edLetterSp" title="글자 간격 (자간, 드래그로 선택한 글자에 적용)"><option value="">자간</option><option value="reset">기본</option><option value="-1px">좁게 -1</option><option value="1px">+1</option><option value="2px">+2</option><option value="4px">+4</option><option value="8px">+8</option></select>' +
                '<span class="tb-sep"></span>' +
                '<div class="tb-drop" data-drop="quote"><button type="button" class="tb-drop-btn" title="인용구">❝ 인용구 ▾</button>' +
                '<div class="tb-menu">' + QUOTE_STYLES.map(s => '<button type="button" class="tb-item" data-quote="' + s[0] + '" title="' + s[1] + '"><span class="mz-quote q-' + s[0] + '"><span class="q-text">내용을 입력하세요.</span>' + (s[0] === 'bar' ? '<span class="q-src">출처 입력</span>' : '') + '</span><em>' + s[1] + '</em></button>').join('') + '</div></div>' +
                '<div class="tb-drop" data-drop="hr"><button type="button" class="tb-drop-btn" title="구분선">─ 구분선 ▾</button>' +
                '<div class="tb-menu tb-menu-hr">' + HR_STYLES.map(s => '<button type="button" class="tb-item" data-hr="' + s[0] + '" title="' + s[1] + '"><span class="mz-hr hr-' + s[0] + '">' + (HR_MARK[s[0]] ? '<span>' + HR_MARK[s[0]] + '</span>' : '') + '</span><em>' + s[1] + '</em></button>').join('') + '</div></div>' +
                '<span class="tb-sep"></span>' +
                '<button type="button" id="edInsertToggle" title="토글(접었다 펼치는 블록) 삽입">▸ 토글</button>' +
                '<button type="button" id="edInsertTable" title="표 삽입">표 삽입</button>' +
                // 표 설정은 글 설정 툴바의 두 번째 줄
                '<div id="tableFloatingMenu" aria-label="표 설정">' +
                '<button type="button" data-tbl-cmd="alignLeft">좌정렬</button>' +
                '<button type="button" data-tbl-cmd="alignCenter">중앙정렬</button>' +
                '<button type="button" data-tbl-cmd="alignRight">우정렬</button>' +
                '<span style="width:1px;height:12px;background:var(--line-soft);display:inline-block;"></span>' +
                '<button type="button" data-tbl-cmd="addRowAbove">위 행 추가</button>' +
                '<button type="button" data-tbl-cmd="addRowBelow">아래 행 추가</button>' +
                '<button type="button" data-tbl-cmd="addColLeft">왼쪽 열 추가</button>' +
                '<button type="button" data-tbl-cmd="addColRight">오른쪽 열 추가</button>' +
                '<span style="width:1px;height:12px;background:var(--line-soft);display:inline-block;"></span>' +
                '<button type="button" data-tbl-cmd="delRow">행 삭제</button>' +
                '<button type="button" data-tbl-cmd="delCol">열 삭제</button>' +
                '<button type="button" data-tbl-cmd="delTable" style="color:var(--danger);">표 삭제</button>' +
                '<span style="width:1px;height:12px;background:var(--line-soft);display:inline-block;"></span>' +
                '<span class="tbl-bd-label">선</span>' +
                '<select id="tblBorderStyle" title="선 종류"><option value="solid">실선</option><option value="dashed">점선</option><option value="dotted">점(도트)</option></select>' +
                '<input type="color" id="tblBorderColor" value="#888888" title="선 색상">' +
                '<button type="button" id="tblBorderTransparent" title="선을 투명하게 (눌러서 켜기/끄기)" aria-pressed="false">투명</button>' +
                '<button type="button" data-tbl-border="cells" title="선택한 칸(드래그로 여러 칸 선택 가능)의 선에만 적용">선택 칸 적용</button>' +
                '<button type="button" data-tbl-border="table" title="표 전체 선에 적용">표 전체 적용</button>' +
                '</div>' +
                '</div>' +
                '<div id="fContent" class="editor-content-editable" contenteditable="true">' + (v.content || '') + '</div>' +
                '</div>' +
                '<div class="btn_confirm"><a href="' + (editing ? '#/view/' + it.id : '#/') + '" class="btn">취소</a>' +
                '<button type="submit" class="btn btn_primary" id="btnSave">' + (editing ? '수정완료' : '작성완료') + '</button></div>' +
                '</form>';

            const contentEditableDiv = document.getElementById('fContent');
            const tableFloatingMenu = document.getElementById('tableFloatingMenu');
            let activeTable = null;
            let activeCell = null;

            // 선택된 표의 테두리와 8방향 크기 조절 핸들
            const tableResizeBox = document.createElement('div');
            tableResizeBox.className = 'table-resize-box';
            tableResizeBox.innerHTML = ['nw','n','ne','e','se','s','sw','w']
                .map(pos => '<span class="table-resize-handle ' + pos + '" data-resize="' + pos + '"></span>').join('');
            document.body.appendChild(tableResizeBox);

            // 표 안쪽 선(행/열 경계)을 끌어서 크기를 조절하는 핸들 레이어
            const tableLineLayer = document.createElement('div');
            tableLineLayer.className = 'table-line-layer';
            document.body.appendChild(tableLineLayer);

            function positionTableTools() {
                if (!activeTable || !contentEditableDiv.contains(activeTable)) {
                    tableResizeBox.style.display = 'none';
                    tableLineLayer.style.display = 'none';
                    tableFloatingMenu.style.display = 'none';
                    return;
                }
                const tr = activeTable.getBoundingClientRect();
                // 오버레이는 body의 fixed 좌표계에서 표의 실제 화면 테두리에 맞춘다.
                tableResizeBox.style.display = 'block';
                tableResizeBox.style.left = Math.round(tr.left) + 'px';
                tableResizeBox.style.top = Math.round(tr.top) + 'px';
                tableResizeBox.style.width = Math.round(tr.width) + 'px';
                tableResizeBox.style.height = Math.round(tr.height) + 'px';
                tableFloatingMenu.style.display = 'flex';
                layoutLineHandles();
            }

            function selectTable(table, cell) {
                activeTable = table;
                activeCell = cell || null;
                positionTableTools();
            }

            contentEditableDiv.addEventListener('click', (e) => {
                const cell = e.target.closest('td, th');
                const table = e.target.closest('table');
                if (table) selectTable(table, cell);
                else if (!e.target.closest('.table-resize-box')) {
                    activeTable = null;
                    activeCell = null;
                    tableResizeBox.style.display = 'none';
                    tableLineLayer.style.display = 'none';
                    tableFloatingMenu.style.display = 'none';
                    clearCellMarks();
                }
            });
            contentEditableDiv.addEventListener('scroll', positionTableTools);
            window.addEventListener('scroll', positionTableTools, true);
            // 표가 지워지거나(되돌리기/Backspace 등) 내용이 바뀌면 핸들도 함께 갱신·제거
            contentEditableDiv.addEventListener('input', positionTableTools);
            window.addEventListener('resize', positionTableTools);

            // 표 크기 조절: 클릭과 드래그를 구분하고 포인터 이동량만 반영한다.
            tableResizeBox.querySelectorAll('[data-resize]').forEach(handle => {
                handle.addEventListener('pointerdown', (e) => {
                    if (!activeTable || !contentEditableDiv.contains(activeTable)) return;
                    e.preventDefault(); e.stopPropagation();
                    const table = activeTable, direction = handle.dataset.resize;
                    const startX = e.clientX, startY = e.clientY;
                    const rect = table.getBoundingClientRect();
                    // 스테이지가 확대/축소(transform scale)되어 있으면 화면 좌표와 CSS px가 다르므로
                    // 실제 CSS 크기(offsetWidth/Height)를 기준으로 하고 포인터 이동량을 배율로 나눈다.
                    const scaleX = (table.offsetWidth && rect.width) ? rect.width / table.offsetWidth : 1;
                    const scaleY = (table.offsetHeight && rect.height) ? rect.height / table.offsetHeight : 1;
                    const startW = table.offsetWidth, startH = table.offsetHeight;
                    // 내용란(편집창) 안쪽 가로 폭이 표의 최대 가로 크기
                    const cs = getComputedStyle(contentEditableDiv);
                    const maxW = Math.max(90, contentEditableDiv.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
                    const saved = { width: table.style.width, height: table.style.height, layout: table.style.tableLayout };
                    let dragged = false;
                    const move = ev => {
                        const dx = (ev.clientX - startX) / scaleX, dy = (ev.clientY - startY) / scaleY;
                        if (Math.hypot(dx * scaleX, dy * scaleY) < 3) return;
                        dragged = true;
                        let w = startW, h = startH;
                        if (direction.includes('e')) w += dx;
                        if (direction.includes('w')) w -= dx;
                        if (direction.includes('s')) h += dy;
                        if (direction.includes('n')) h -= dy;
                        table.style.boxSizing = 'border-box';
                        table.style.tableLayout = 'fixed';
                        table.style.width = Math.min(maxW, Math.max(90, w)) + 'px';
                        if (direction.includes('n') || direction.includes('s')) table.style.height = Math.max(40, h) + 'px';
                        positionTableTools();
                    };
                    const finish = () => {
                        window.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', finish);
                        window.removeEventListener('pointercancel', finish);
                        if (!dragged) {
                            table.style.width = saved.width;
                            table.style.height = saved.height;
                            table.style.tableLayout = saved.layout;
                        }
                        table.style.removeProperty('box-sizing');
                        requestAnimationFrame(positionTableTools);
                    };
                    window.addEventListener('pointermove', move);
                    window.addEventListener('pointerup', finish, { once: true });
                    window.addEventListener('pointercancel', finish, { once: true });
                });
            });


            // ───────── 표 선(테두리) 종류·색 / 선 끌어서 크기 조절 ─────────
            let selCells = [];   // 선 적용 대상(커서가 있거나 드래그로 선택한 칸)

            function clearCellMarks() {
                contentEditableDiv.querySelectorAll('.mz-sel').forEach(n => { n.classList.remove('mz-sel'); if (!n.getAttribute('class')) n.removeAttribute('class'); });
                selCells = [];
            }
            function cellsFromSelection() {
                const s = window.getSelection();
                if (!s || !s.rangeCount) return null;
                let n = s.anchorNode;
                if (n && n.nodeType === Node.TEXT_NODE) n = n.parentElement;
                const aCell = n && n.closest ? n.closest('td, th') : null;
                if (!aCell || !contentEditableDiv.contains(aCell)) return null;
                const table = aCell.closest('table');
                if (!s.isCollapsed) {
                    const range = s.getRangeAt(0);
                    const hit = Array.from(table.querySelectorAll('td, th')).filter(c => range.intersectsNode(c));
                    if (hit.length) return { table: table, cells: hit };
                }
                return { table: table, cells: [aCell] };
            }
            function trackCellSelection() {
                const info = cellsFromSelection();
                if (!info) return;   // 색상/종류 칸을 눌러 포커스가 옮겨가도 마지막 선택을 유지
                contentEditableDiv.querySelectorAll('.mz-sel').forEach(n => { if (info.cells.indexOf(n) < 0) { n.classList.remove('mz-sel'); if (!n.getAttribute('class')) n.removeAttribute('class'); } });
                info.cells.forEach(c => c.classList.add('mz-sel'));
                selCells = info.cells;
                if (info.table !== activeTable) { activeTable = info.table; positionTableTools(); }
                activeCell = info.cells[0];
            }

            const bdStyleSel = document.getElementById('tblBorderStyle');
            const bdColorInput = document.getElementById('tblBorderColor');
            const bdTransBtn = document.getElementById('tblBorderTransparent');
            let bdTransparent = false;
            function setTransparent(on) {
                bdTransparent = on;
                bdTransBtn.classList.toggle('on', on);
                bdTransBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
            }
            bdTransBtn.addEventListener('click', e => { e.preventDefault(); setTransparent(!bdTransparent); });
            bdColorInput.addEventListener('input', () => setTransparent(false));   // 색을 새로 고르면 투명 해제

            function setEdge(cell, side, style, color) {
                if (!cell) return;
                const w = parseFloat(getComputedStyle(cell)['border' + side + 'Width']) || 0;
                cell.style['border' + side] = (w > 0 ? w : 1) + 'px ' + style + ' ' + color;
            }
            // 칸의 네 변을 바꾸고, 맞닿은 이웃 칸의 같은 선도 함께 바꾼다
            // (표는 선이 합쳐지는 방식이라 이웃 칸이 다르면 이웃의 선이 이겨서 안 바뀐 것처럼 보임)
            function paintCell(table, cell, style, color) {
                const tr = cell.parentElement, r = tr.rowIndex, c = cell.cellIndex;
                ['Top', 'Right', 'Bottom', 'Left'].forEach(sd => setEdge(cell, sd, style, color));
                const up = table.rows[r - 1] && table.rows[r - 1].cells[c];
                const down = table.rows[r + 1] && table.rows[r + 1].cells[c];
                setEdge(up, 'Bottom', style, color);
                setEdge(down, 'Top', style, color);
                setEdge(tr.cells[c - 1], 'Right', style, color);
                setEdge(tr.cells[c + 1], 'Left', style, color);
            }
            function copyBorders(dst, src) {
                if (!dst || !src) return;
                ['Top', 'Right', 'Bottom', 'Left'].forEach(sd => { const v = src.style['border' + sd]; if (v) dst.style['border' + sd] = v; });
            }
            tableFloatingMenu.querySelectorAll('button[data-tbl-border]').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    if (!activeTable || !contentEditableDiv.contains(activeTable)) return;
                    const style = bdStyleSel.value || 'solid';
                    const color = bdTransparent ? 'transparent' : bdColorInput.value;
                    let targets;
                    if (btn.getAttribute('data-tbl-border') === 'table') {
                        targets = Array.from(activeTable.querySelectorAll('td, th'));
                    } else {
                        targets = selCells.filter(c => activeTable.contains(c));
                        if (!targets.length && activeCell) targets = [activeCell];
                        if (!targets.length) { alert('선을 바꿀 칸을 먼저 클릭하거나 드래그해서 선택해 주세요.'); return; }
                    }
                    targets.forEach(c => paintCell(activeTable, c, style, color));
                    requestAnimationFrame(positionTableTools);
                });
            });

            // 열 폭(%)을 첫 줄 칸에 저장 → 보기 화면에서도 같은 비율로 보임
            function applyColWidths(table, widths) {
                const total = widths.reduce((a, b) => a + b, 0) || 1;
                table.style.tableLayout = 'fixed';
                Array.from(table.rows[0].cells).forEach((c, i) => {
                    if (widths[i] != null) c.style.width = (widths[i] / total * 100).toFixed(2) + '%';
                });
            }

            function syncHandles(kind, n) {
                const list = tableLineLayer.querySelectorAll('.tl-' + kind);
                for (let i = list.length; i < n; i++) {
                    const d = document.createElement('div');
                    d.className = 'table-line-handle tl-' + kind;
                    tableLineLayer.appendChild(d);
                }
                for (let i = list.length - 1; i >= n; i--) list[i].remove();
            }
            function layoutLineHandles() {
                const t = activeTable;
                if (!t || !contentEditableDiv.contains(t) || !t.rows.length) { tableLineLayer.style.display = 'none'; return; }
                const tr = t.getBoundingClientRect();
                tableLineLayer.style.display = 'block';
                tableLineLayer.style.left = Math.round(tr.left) + 'px';
                tableLineLayer.style.top = Math.round(tr.top) + 'px';
                tableLineLayer.style.width = Math.round(tr.width) + 'px';
                tableLineLayer.style.height = Math.round(tr.height) + 'px';
                const row0 = t.rows[0];
                syncHandles('v', Math.max(0, row0.cells.length - 1));
                syncHandles('h', Math.max(0, t.rows.length - 1));
                tableLineLayer.querySelectorAll('.tl-v').forEach((h, i) => {
                    h.style.left = Math.round(row0.cells[i].getBoundingClientRect().right - tr.left - 4) + 'px';
                });
                tableLineLayer.querySelectorAll('.tl-h').forEach((h, j) => {
                    h.style.top = Math.round(t.rows[j].getBoundingClientRect().bottom - tr.top - 4) + 'px';
                });
            }

            // 선 끌기: 세로선 → 왼쪽/오른쪽 열 폭, 가로선 → 위쪽 행 높이
            tableLineLayer.addEventListener('pointerdown', (e) => {
                const h = e.target.closest('.table-line-handle');
                if (!h || !activeTable || !contentEditableDiv.contains(activeTable)) return;
                e.preventDefault(); e.stopPropagation();
                const table = activeTable;
                const isV = h.classList.contains('tl-v');
                const idx = Array.from(tableLineLayer.querySelectorAll(isV ? '.tl-v' : '.tl-h')).indexOf(h);
                const rect = table.getBoundingClientRect();
                const scaleX = (table.offsetWidth && rect.width) ? rect.width / table.offsetWidth : 1;   // 확대/축소 보정
                const scaleY = (table.offsetHeight && rect.height) ? rect.height / table.offsetHeight : 1;
                const startX = e.clientX, startY = e.clientY;
                let widths = null, heights = null;
                if (isV) {
                    widths = Array.from(table.rows[0].cells).map(c => c.getBoundingClientRect().width / scaleX);
                    if (idx < 0 || idx + 1 >= widths.length) return;
                } else {
                    heights = Array.from(table.rows).map(r => r.getBoundingClientRect().height / scaleY);
                    // 표 전체 높이를 직접 지정해 둔 경우 행 높이가 안 먹으므로 현재 높이를 각 행에 고정
                    table.style.removeProperty('height');
                    Array.from(table.rows).forEach((r, i) => { r.style.height = Math.round(heights[i]) + 'px'; });
                    if (idx < 0 || idx >= heights.length) return;
                }
                h.classList.add('drag');
                const MINW = 30, MINH = 24;
                const move = ev => {
                    if (isV) {
                        let dx = (ev.clientX - startX) / scaleX;
                        dx = Math.max(MINW - widths[idx], Math.min(widths[idx + 1] - MINW, dx));
                        const nw = widths.slice(); nw[idx] += dx; nw[idx + 1] -= dx;
                        applyColWidths(table, nw);
                    } else {
                        const dy = Math.max(MINH - heights[idx], (ev.clientY - startY) / scaleY);
                        table.rows[idx].style.height = Math.round(heights[idx] + dy) + 'px';
                    }
                    positionTableTools();
                };
                const finish = () => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', finish);
                    window.removeEventListener('pointercancel', finish);
                    h.classList.remove('drag');
                    requestAnimationFrame(positionTableTools);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', finish, { once: true });
                window.addEventListener('pointercancel', finish, { once: true });
            });

            // 표 플로팅 툴바 기능 처리
            tableFloatingMenu.querySelectorAll('button[data-tbl-cmd]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (!activeTable) return;
                    const cmd = btn.getAttribute('data-tbl-cmd');

                    if (cmd === 'alignLeft' || cmd === 'alignCenter' || cmd === 'alignRight') {
                        // 이전 버전에서 저장된 인라인 margin이 정렬 규칙을 덮지 않게 초기화
                        activeTable.style.removeProperty('margin-left');
                        activeTable.style.removeProperty('margin-right');
                        activeTable.classList.remove('align-left', 'align-center', 'align-right');
                        activeTable.classList.add(cmd === 'alignLeft' ? 'align-left' :
                            cmd === 'alignCenter' ? 'align-center' : 'align-right');
                    } else if (activeCell) {
                        const row = activeCell.parentElement;
                        const rowIndex = row.rowIndex;
                        const cellIndex = activeCell.cellIndex;

                        if (cmd === 'addRowAbove' || cmd === 'addRowBelow') {
                            const newRow = activeTable.insertRow(cmd === 'addRowAbove' ? rowIndex : rowIndex + 1);
                            for (let i = 0; i < row.cells.length; i++) {
                                const newCell = newRow.insertCell(i);
                                newCell.style.border = '1px solid var(--line)';
                                newCell.style.padding = '8px';
                                newCell.style.minWidth = '30px';
                                newCell.innerHTML = '<br>';
                                copyBorders(newCell, row.cells[i]);
                            }
                        } else if (cmd === 'addColLeft' || cmd === 'addColRight') {
                            const targetColIdx = cmd === 'addColLeft' ? cellIndex : cellIndex + 1;
                            // 열 폭을 직접 조절해 둔 표라면 새 열에도 평균 폭을 주고 비율을 다시 맞춘다
                            const hadWidths = Array.from(activeTable.rows[0].cells).some(c => c.style.width);
                            const oldWidths = hadWidths ? Array.from(activeTable.rows[0].cells).map(c => c.getBoundingClientRect().width) : null;
                            for (let i = 0; i < activeTable.rows.length; i++) {
                                const r = activeTable.rows[i];
                                const src = r.cells[Math.min(cellIndex, r.cells.length - 1)];
                                const newCell = r.insertCell(targetColIdx);
                                newCell.style.border = '1px solid var(--line)';
                                newCell.style.padding = '8px';
                                newCell.style.minWidth = '30px';
                                newCell.innerHTML = '<br>';
                                copyBorders(newCell, src);
                            }
                            if (oldWidths) {
                                const avg = oldWidths.reduce((a, b) => a + b, 0) / oldWidths.length;
                                oldWidths.splice(targetColIdx, 0, avg);
                                applyColWidths(activeTable, oldWidths);
                            }
                        } else if (cmd === 'delRow') {
                            if (activeTable.rows.length > 1) {
                                activeTable.deleteRow(rowIndex);
                            } else {
                                alert('마지막 행은 삭제할 수 없습니다. 표를 삭제하려면 [표 삭제]를 이용하세요.');
                            }
                        } else if (cmd === 'delCol') {
                            if (row.cells.length > 1) {
                                const hadWidths = Array.from(activeTable.rows[0].cells).some(c => c.style.width);
                                const oldWidths = hadWidths ? Array.from(activeTable.rows[0].cells).map(c => c.getBoundingClientRect().width) : null;
                                for (let i = 0; i < activeTable.rows.length; i++) {
                                    activeTable.rows[i].deleteCell(cellIndex);
                                }
                                if (oldWidths) { oldWidths.splice(cellIndex, 1); applyColWidths(activeTable, oldWidths); }
                            } else {
                                alert('마지막 열은 삭제할 수 없습니다.');
                            }
                        }
                    }

                    if (cmd === 'delTable') {
                        if (confirm('이 표를 삭제하시겠습니까?')) {
                            activeTable.remove();
                            tableFloatingMenu.style.display = 'none';
                            tableResizeBox.style.display = 'none';
                            tableLineLayer.style.display = 'none';
                            activeTable = null;
                            activeCell = null;
                            clearCellMarks();
                        }
                    }
                    if (activeTable && cmd !== 'delTable') requestAnimationFrame(positionTableTools);
                });
            });

            // ───────── 인용구 / 구분선 ─────────
            const toolbarEl = document.querySelector('.editor-toolbar');
            let savedRange = null;
            const onSelChange = () => {
                const s = window.getSelection();
                if (s.rangeCount && contentEditableDiv.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
            };
            document.addEventListener('selectionchange', onSelChange);
            document.addEventListener('selectionchange', trackCellSelection);
            formCleanup = () => {
                document.removeEventListener('selectionchange', onSelChange);
                document.removeEventListener('selectionchange', trackCellSelection);
                window.removeEventListener('scroll', positionTableTools, true);
            };

            // 메뉴를 눌러도 글 편집창의 커서가 풀리지 않게 함
            toolbarEl.addEventListener('mousedown', e => { if (e.target.closest('.tb-drop')) e.preventDefault(); });
            toolbarEl.querySelectorAll('.tb-drop-btn').forEach(b => b.addEventListener('click', e => {
                e.preventDefault();
                const d = b.closest('.tb-drop'), was = d.classList.contains('open');
                toolbarEl.querySelectorAll('.tb-drop.open').forEach(x => x.classList.remove('open'));
                if (!was) d.classList.add('open');
            }));

            function caretToEnd() {
                const s = window.getSelection(), r = document.createRange();
                r.selectNodeContents(contentEditableDiv); r.collapse(false);
                s.removeAllRanges(); s.addRange(r);
            }
            function placeCaretIn(node, collapseStart) {
                const s = window.getSelection(), r = document.createRange();
                r.selectNodeContents(node); if (collapseStart !== undefined) r.collapse(collapseStart);
                s.removeAllRanges(); s.addRange(r);
            }
            // 현재 커서 위치에 HTML 삽입 (인용구 안에서 누르면 인용구 바로 뒤에 넣음)
            function insertBlock(html) {
                contentEditableDiv.focus();
                const s = window.getSelection();
                if (savedRange && contentEditableDiv.contains(savedRange.startContainer)) { s.removeAllRanges(); s.addRange(savedRange); }
                else if (!s.rangeCount || !contentEditableDiv.contains(s.anchorNode)) caretToEnd();
                let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
                const q = n && n.closest ? n.closest('.mz-quote') : null;
                if (q && contentEditableDiv.contains(q)) {
                    const r = document.createRange(); r.setStartAfter(q); r.collapse(true);
                    s.removeAllRanges(); s.addRange(r);
                }
                document.execCommand('insertHTML', false, html);
            }
            toolbarEl.querySelectorAll('[data-quote]').forEach(b => b.addEventListener('click', e => {
                e.preventDefault();
                const s = window.getSelection();
                const picked = (savedRange && !savedRange.collapsed && contentEditableDiv.contains(savedRange.startContainer)) ? savedRange.toString() : '';
                const q = quoteHtml(b.getAttribute('data-quote'), picked.trim());
                insertBlock(q.html);
                const box = contentEditableDiv.querySelector('[data-mzq="' + q.id + '"]');
                if (box) {
                    box.removeAttribute('data-mzq');
                    const t = box.querySelector('.q-text');
                    placeCaretIn(t, undefined);     // 안내 문구를 선택해 두어 바로 타이핑하면 교체됨
                    if (!t.classList.contains('ph')) s.collapseToEnd();
                }
                b.closest('.tb-drop').classList.remove('open');
            }));
            toolbarEl.querySelectorAll('[data-hr]').forEach(b => b.addEventListener('click', e => {
                e.preventDefault();
                insertBlock(hrHtml(b.getAttribute('data-hr')));
                b.closest('.tb-drop').classList.remove('open');
            }));

            // ───────── 토글 / 글 간격 ─────────
            function restoreSel() {
                contentEditableDiv.focus();
                const sel = window.getSelection();
                if (savedRange && contentEditableDiv.contains(savedRange.startContainer)) { sel.removeAllRanges(); sel.addRange(savedRange); }
                return sel.rangeCount ? sel.getRangeAt(0) : null;
            }

            // 토글 삽입
            const toggleBtn = document.getElementById('edInsertToggle');
            if (toggleBtn) toggleBtn.addEventListener('click', e => {
                e.preventDefault();
                const tid = 't' + Date.now();
                insertBlock(toggleHtml(tid));
                const box = contentEditableDiv.querySelector('[data-mzt="' + tid + '"]');
                if (box) {
                    box.removeAttribute('data-mzt');
                    placeCaretIn(box.querySelector('.mz-tg-title'));   // 제목을 선택해 두어 바로 타이핑하면 교체됨
                }
            });
            // 토글 키보드: 제목에서 Enter → 안쪽으로, 안쪽 빈 줄에서 Enter → 토글 밖으로, 빈 토글에서 Backspace → 삭제
            contentEditableDiv.addEventListener('keydown', e => {
                if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중에는 건드리지 않음
                if (e.key !== 'Enter' && e.key !== 'Backspace') return;
                if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
                const sel = window.getSelection();
                if (!sel.rangeCount || !sel.isCollapsed) return;
                let n = sel.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
                if (!n || !n.closest || !contentEditableDiv.contains(n)) return;
                const title = n.closest('.mz-tg-title');
                const body = n.closest('.mz-tg-body');
                const isEmpty = el => !el.textContent.replace(/\u200b/g, '').trim() && !el.querySelector('img, table, .mz-hr');
                if (e.key === 'Enter') {
                    if (title && contentEditableDiv.contains(title)) {
                        e.preventDefault();
                        const tg = title.closest('.mz-toggle');
                        tg.classList.add('open');
                        const first = tg.querySelector(':scope > .mz-tg-body > *');
                        if (first) placeCaretIn(first, true);
                    } else if (body && contentEditableDiv.contains(body)) {
                        let line = n; while (line && line.parentElement !== body) line = line.parentElement;
                        if (line && line.nodeType === 1 && line === body.lastElementChild && isEmpty(line)) {
                            e.preventDefault();
                            const tg = body.closest('.mz-toggle');
                            if (body.children.length > 1) line.remove();
                            const after = document.createElement('div'); after.innerHTML = '<br>';
                            tg.after(after);
                            placeCaretIn(after, true);
                        }
                    }
                } else if (e.key === 'Backspace') {
                    if (body && contentEditableDiv.contains(body) && body.children.length === 1 && isEmpty(body) && body.contains(n)) {
                        // 안쪽의 마지막 빈 줄을 지우다가 제목과 합쳐져 구조가 깨지지 않게 제목 끝으로 이동
                        e.preventDefault();
                        const t = body.closest('.mz-toggle').querySelector(':scope > .mz-tg-head .mz-tg-title');
                        if (t) placeCaretIn(t, false);
                    } else if (title && contentEditableDiv.contains(title) && sel.anchorOffset === 0 && isEmpty(title)) {
                        const tg = title.closest('.mz-toggle'), tb = tg.querySelector(':scope > .mz-tg-body');
                        if (!tb || isEmpty(tb)) {
                            e.preventDefault();
                            const prev = tg.previousElementSibling;
                            tg.remove();
                            if (prev) placeCaretIn(prev, false); else caretToEnd();
                        }
                    }
                }
            });

            // 줄 간격: 선택한 줄(문단)에 line-height 적용
            const BLOCK_SEL = 'div, p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th';
            function ensureBlocks() {
                // 편집창에 바로 붙은 글자(문단 없이 쓴 첫 줄)는 div로 감싸서 줄 간격을 줄 수 있게 함
                const sel = window.getSelection();
                if (!sel.rangeCount) return;
                const r = sel.getRangeAt(0);
                [r.startContainer, r.endContainer].forEach(nd => {
                    let top = nd;
                    while (top && top.parentNode !== contentEditableDiv) top = top.parentNode;
                    if (top && (top.nodeType === 3 || !top.matches(BLOCK_SEL + ', table, ul, ol'))) document.execCommand('formatBlock', false, 'div');
                });
            }
            function applyLineHeight(val) {
                if (!restoreSel()) return;
                ensureBlocks();
                const sel = window.getSelection();
                if (!sel.rangeCount) return;
                const range = sel.getRangeAt(0);
                Array.from(contentEditableDiv.querySelectorAll(BLOCK_SEL)).filter(b =>
                    !b.classList.contains('mz-hr') && !b.querySelector(BLOCK_SEL) && range.intersectsNode(b)
                ).forEach(b => {
                    if (val === 'reset') b.style.removeProperty('line-height'); else b.style.lineHeight = val;
                    if (!b.getAttribute('style')) b.removeAttribute('style');
                });
            }
            // 자간: 선택한 글자를 span으로 감싸 letter-spacing 적용
            function applyLetterSpacing(val) {
                const range = restoreSel();
                if (!range) return;
                if (range.collapsed) { alert('자간을 바꿀 글자를 먼저 드래그해서 선택해 주세요.'); return; }
                document.execCommand('styleWithCSS', false, false);
                document.execCommand('fontSize', false, '7');   // 임시 표식(font size=7)으로 선택 영역을 감싼 뒤 span으로 교체
                const made = [];
                contentEditableDiv.querySelectorAll('font[size="7"]').forEach(f => {
                    const sp = document.createElement('span');
                    while (f.firstChild) sp.appendChild(f.firstChild);
                    sp.querySelectorAll('[style*="letter-spacing"]').forEach(x => x.style.removeProperty('letter-spacing'));
                    sp.style.letterSpacing = (val === 'reset') ? 'normal' : val;
                    f.replaceWith(sp);
                    made.push(sp);
                });
                if (made.length) {
                    const rr = document.createRange(), sel = window.getSelection();
                    rr.setStartBefore(made[0]); rr.setEndAfter(made[made.length - 1]);
                    sel.removeAllRanges(); sel.addRange(rr);
                }
            }
            [['edLineHeight', applyLineHeight], ['edLetterSp', applyLetterSpacing]].forEach(pair => {
                const sel = document.getElementById(pair[0]);
                if (!sel) return;
                sel.addEventListener('change', () => { const v = sel.value; sel.value = ''; if (v) pair[1](v); });
            });

            // 안내 문구는 글을 쓰기 시작하면 회색(안내) 표시를 뺌
            contentEditableDiv.addEventListener('input', () => {
                contentEditableDiv.querySelectorAll('.ph').forEach(n => { if (n.textContent.trim() !== n.getAttribute('data-ph')) n.classList.remove('ph'); });
            });
            // 구분선은 클릭해서 선택 → Delete/Backspace 로 삭제
            let pickedHr = null;
            const clearHr = () => { if (pickedHr) pickedHr.classList.remove('sel'); pickedHr = null; };
            contentEditableDiv.addEventListener('click', e => {
                const h = e.target.closest ? e.target.closest('.mz-hr') : null;
                clearHr();
                if (h && contentEditableDiv.contains(h)) { pickedHr = h; h.classList.add('sel'); }
            });
            contentEditableDiv.addEventListener('keydown', e => {
                if (pickedHr && (e.key === 'Delete' || e.key === 'Backspace')) {
                    e.preventDefault();
                    const nx = pickedHr.nextElementSibling; pickedHr.remove(); pickedHr = null;
                    if (nx) placeCaretIn(nx, true);
                    return;
                }
                if (e.key !== 'Enter' && e.key !== 'Backspace') return;
                const s = window.getSelection();
                if (!s.rangeCount || !s.isCollapsed) return;
                let n = s.anchorNode; if (n && n.nodeType === 3) n = n.parentElement;
                const q = n && n.closest ? n.closest('.mz-quote') : null;
                if (!q || !contentEditableDiv.contains(q)) return;
                let blk = n; while (blk && blk.parentElement !== q) blk = blk.parentElement;
                if (!blk || blk.textContent.trim() !== '') return;
                // 이 줄 아래에 아직 안 고친 안내 줄(출처 입력 등)만 남아 있으면 '마지막 줄'로 취급
                let onlyPhAfter = true;
                for (let t = blk.nextElementSibling; t; t = t.nextElementSibling) if (!t.classList.contains('ph')) onlyPhAfter = false;
                if (e.key === 'Enter' && !e.shiftKey && onlyPhAfter) {
                    // 빈 줄에서 Enter → 인용구를 빠져나와 아래 일반 글로
                    e.preventDefault();
                    if (q.children.length > 1) blk.remove();
                    let nx = q.nextElementSibling;
                    if (!nx || nx.classList.contains('mz-hr') || nx.classList.contains('mz-quote')) { nx = document.createElement('div'); nx.innerHTML = '<br>'; q.after(nx); }
                    placeCaretIn(nx, true);
                    if (!Array.from(q.children).some(c => !c.classList.contains('ph') && c.textContent.trim())) q.remove();
                } else if (e.key === 'Backspace' && q.children.length === 1) {
                    // 빈 인용구에서 Backspace → 인용구 삭제
                    e.preventDefault();
                    const nx = q.nextElementSibling || q.previousElementSibling;
                    q.remove();
                    if (nx) placeCaretIn(nx, true); else caretToEnd();
                }
            });

            // 일반 에디터 툴바 기능 연결
            document.querySelectorAll('.editor-toolbar button[data-cmd]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const cmd = btn.getAttribute('data-cmd');
                    document.execCommand(cmd, false, null);
                });
            });

            const fontNameSel = document.getElementById('edFontName');
            if (fontNameSel) fontNameSel.addEventListener('change', () => {
                if (fontNameSel.value) document.execCommand('fontName', false, fontNameSel.value);
            });

            const fontSizeSel = document.getElementById('edFontSize');
            if (fontSizeSel) fontSizeSel.addEventListener('change', () => {
                if (fontSizeSel.value) document.execCommand('fontSize', false, fontSizeSel.value);
            });

            const foreColorInput = document.getElementById('edForeColor');
            if (foreColorInput) foreColorInput.addEventListener('input', () => {
                document.execCommand('foreColor', false, foreColorInput.value);
            });

            const backColorInput = document.getElementById('edBackColor');
            if (backColorInput) backColorInput.addEventListener('input', () => {
                document.execCommand('hiliteColor', false, backColorInput.value);
            });

            const clearBgBtn = document.getElementById('edClearBg');
            if (clearBgBtn) {
                clearBgBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    document.execCommand('hiliteColor', false, 'transparent');
                    document.execCommand('backColor', false, 'transparent');
                });
            }

            // 표 삽입 기능 (기본 중앙 정렬 적용)
            const insertTableBtn = document.getElementById('edInsertTable');
            if (insertTableBtn) insertTableBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const rows = prompt('표의 행(가로줄) 개수를 입력하세요:', '3');
                const cols = prompt('표의 열(세로칸) 개수를 입력하세요:', '3');
                if (!rows || !cols) return;
                let html = '<table class="align-center" style="border-collapse:collapse; width:70%; margin:10px auto; table-layout:fixed;">';
                for (let r = 0; r < parseInt(rows); r++) {
                    html += '<tr>';
                    for (let c = 0; c < parseInt(cols); c++) {
                        html += '<td style="border:1px solid var(--line); padding:8px; min-width:30px;"><br></td>';
                    }
                    html += '</tr>';
                }
                html += '</table><br>';
                document.execCommand('insertHTML', false, html);
                requestAnimationFrame(() => { const tables = contentEditableDiv.querySelectorAll('table'); if (tables.length) selectTable(tables[tables.length - 1], tables[tables.length - 1].rows[0]?.cells[0]); });
            });

            // Ctrl + Z 실행 취소
            if (contentEditableDiv) {
                contentEditableDiv.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                        e.preventDefault();
                        document.execCommand('undo', false, null);
                    }
                });
            }

            // 표 안에서 Tab/Shift+Tab으로 셀 이동, 마지막 셀에서 Tab은 행 추가
            contentEditableDiv.addEventListener('keydown', (e) => {
                if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
                const selection = window.getSelection();
                let node = selection && selection.anchorNode;
                if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement;
                const cell = node && node.closest ? node.closest('td, th') : null;
                if (!cell || !contentEditableDiv.contains(cell)) return;
                const table = cell.closest('table');
                if (!table) return;
                const cells = Array.from(table.querySelectorAll('td, th'));
                const index = cells.indexOf(cell);
                let target = cells[index + (e.shiftKey ? -1 : 1)];
                e.preventDefault();
                if (!e.shiftKey && !target) {
                    const lastRow = table.rows[table.rows.length - 1];
                    const newRow = table.insertRow(-1);
                    const count = lastRow ? lastRow.cells.length : 1;
                    for (let i = 0; i < count; i++) {
                        const td = newRow.insertCell(-1);
                        td.innerHTML = '<br>';
                        td.style.border = '1px solid var(--line)';
                        td.style.padding = '8px';
                        td.style.minWidth = '30px';
                        if (lastRow && lastRow.cells[i]) copyBorders(td, lastRow.cells[i]);
                    }
                    target = newRow.cells[0];
                }
                if (!target) return;
                selectTable(table, target);
                target.focus();
                const range = document.createRange();
                range.selectNodeContents(target);
                range.collapse(true);
                selection.removeAllRanges();
                selection.addRange(range);
            });

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
                    img.onerror = () => { if (my !== seq) return; st.style.color = '#ff4757'; st.textContent = '✖ 이미지를 불러오지 못했습니다.'; };
                    MZ.setImgSrc(img, url);
                }
                input.addEventListener('input', update);
                update();
            }
            bindPreview('fThumb', 'pvThumb', 'stThumb');
            bindPreview('fChar', 'pvChar', 'stChar');

            // GitHub 저장소에서 그림 고르기 (메인 페이지 스티커/이미지 블록과 같은 선택 창)
            [['fChar', 'btnPickChar'], ['fThumb', 'btnPickThumb']].forEach(pair => {
                const input = document.getElementById(pair[0]);
                document.getElementById(pair[1]).addEventListener('click', () => {
                    if (!MZ.pickGithubImage) { alert('GitHub 이미지 선택 기능을 불러오지 못했습니다. (common.js 를 확인하세요)'); return; }
                    MZ.pickGithubImage({
                        accept: 'image',
                        onPick: url => { input.value = url; input.dispatchEvent(new Event('input')); }   // 미리보기도 바로 갱신
                    });
                });
            });

            document.getElementById('charForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const subject = document.getElementById('fSubject').value.trim();
                if (!subject) { alert('제목을 입력해 주세요.'); return; }
                const contentClone = contentEditableDiv.cloneNode(true);
                const resizeUi = contentClone.querySelector('.table-resize-box');
                if (resizeUi) resizeUi.remove();
                cleanEditorHtml(contentClone);
                const contentHtml = contentClone.innerHTML;

                const row = {
                    category: document.getElementById('fCate').value.trim(),
                    subject: subject,
                    name: document.getElementById('fName').value.trim(),
                    content: contentHtml,
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

        MZ.applyBackground();
        app.innerHTML = '<div class="char_msg">불러오는 중...</div>';
        loadItems().then(render);
    };

    const admin = MZ.initLogin();
    const bar = document.getElementById('adminBar');
    if (admin && bar) bar.style.display = 'flex';
    window.startCharacter(admin);
})();