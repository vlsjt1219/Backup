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

    function formatContent(text) {
        if (!text) return '';
        return text;
    }

    window.startCharacter = function (isAdmin) {
        const app = document.getElementById('charApp');
        let items = [];
        let loaded = false;
        let loadError = '';

        MZ.fitStage();

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
            // body에 붙어 있는 표 크기 조절 핸들이 화면 이동 후에도 남지 않도록 정리
            document.querySelectorAll('.table-resize-box').forEach(el => el.remove());
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
                '<input type="text" id="fChar" value="' + esc(v.char_image) + '" placeholder="Image/character/char1.webp">' +
                '<div class="f_hint">상세 화면 왼쪽에 크게 보이는 그림입니다.</div>' +
                '<div class="f_preview" id="pvChar"></div><div class="f_status" id="stChar"></div></div>' +
                '<div class="f_box"><label for="fThumb">썸네일 이미지 경로</label>' +
                '<input type="text" id="fThumb" value="' + esc(v.thumb_image) + '" placeholder="Image/character/thumb1.webp">' +
                '<div class="f_hint">목록 카드에 보이는 그림입니다. 비우면 캐릭터 이미지가 대신 쓰입니다.</div>' +
                '<div class="f_preview" id="pvThumb"></div><div class="f_status" id="stThumb"></div></div>' +
                '</div>' +
                '<div class="f_hint" style="margin:-8px 0 16px;">그림 파일은 GitHub 저장소에 올린 뒤 <b>Image/파일명.webp</b> 처럼 경로만 입력하세요.</div>' +
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
                '<span class="tb-sep"></span>' +
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

            function positionTableTools() {
                if (!activeTable || !contentEditableDiv.contains(activeTable)) {
                    tableResizeBox.style.display = 'none';
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
                    tableFloatingMenu.style.display = 'none';
                }
            });
            contentEditableDiv.addEventListener('scroll', positionTableTools);
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
                            }
                        } else if (cmd === 'addColLeft' || cmd === 'addColRight') {
                            const targetColIdx = cmd === 'addColLeft' ? cellIndex : cellIndex + 1;
                            for (let i = 0; i < activeTable.rows.length; i++) {
                                const r = activeTable.rows[i];
                                const newCell = r.insertCell(targetColIdx);
                                newCell.style.border = '1px solid var(--line)';
                                newCell.style.padding = '8px';
                                newCell.style.minWidth = '30px';
                                newCell.innerHTML = '<br>';
                            }
                        } else if (cmd === 'delRow') {
                            if (activeTable.rows.length > 1) {
                                activeTable.deleteRow(rowIndex);
                            } else {
                                alert('마지막 행은 삭제할 수 없습니다. 표를 삭제하려면 [표 삭제]를 이용하세요.');
                            }
                        } else if (cmd === 'delCol') {
                            if (row.cells.length > 1) {
                                for (let i = 0; i < activeTable.rows.length; i++) {
                                    activeTable.rows[i].deleteCell(cellIndex);
                                }
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
                            activeTable = null;
                            activeCell = null;
                        }
                    }
                    if (activeTable && cmd !== 'delTable') requestAnimationFrame(positionTableTools);
                });
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
                const contentClone = contentEditableDiv.cloneNode(true);
                const resizeUi = contentClone.querySelector('.table-resize-box');
                if (resizeUi) resizeUi.remove();
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