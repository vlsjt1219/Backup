/* =====================================================================
   MAFIAZ 스토리 페이지 에디터 스크립트 (공통 관리자 패널 및 정렬 완벽 연동)
   ===================================================================== */
(function () {
    const MZ = window.MZ;
    const sb = MZ.sb;
    const TABLE = MZ.TABLE || 'layouts';

    window.startEditor = function (isAdmin, pageName) {
        const basePage = pageName || 'story';
        const PAGE = (basePage === 'story') ? ('story_' + MZ.getTheme()) : basePage;
        
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

        let activeElement = null;
        let selectedElements = new Set();
        let dirty = false;     
        let loaded = false;    

        if (isAdmin) document.body.classList.add('is-admin', 'mh-admin-edit');

        const esc = MZ.esc;

        function toHexColor(c, fallback) {
            if (!c) return fallback;
            if (c.startsWith('#')) return c.length === 7 ? c : fallback;
            const m = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return fallback;
            return '#' + [m[1], m[2], m[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        }

        if (isAdmin) {
            window.addEventListener('beforeunload', (e) => {
                if (dirty) { e.preventDefault(); e.returnValue = ''; }
            });

            function getScale() {
                const stageFrame = document.getElementById('stageFrame');
                if (stageFrame) {
                    const matrix = window.getComputedStyle(stageFrame).transform;
                    if (matrix && matrix !== 'none') {
                        const values = matrix.split('(')[1].split(')')[0].split(',');
                        const a = parseFloat(values[0]);
                        const b = parseFloat(values[1]);
                        return Math.sqrt(a * a + b * b) || 1;
                    }
                }
                const rect = gallery.getBoundingClientRect();
                const unscaledWidth = gallery.offsetWidth || 1;
                return rect.width / unscaledWidth || 1;
            }

            function toLocalPoint(el, cx, cy) {
                const r = el.getBoundingClientRect();
                const s = getScale();
                return { x: (cx - r.left) / s, y: (cy - r.top) / s };
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
                        if (selectionMarquee) selectionMarquee.style.display = 'none';
                    }

                    window.addEventListener('mousemove', onMarqueeMove);
                    window.addEventListener('mouseup', onMarqueeUp);
                    return;
                }

                if (!selectedElements.has(el)) {
                    if (!e.shiftKey) clearSelection();
                    selectElement(el);
                }

                // 텍스트 블록 내부 클릭 시 글자 입력이 가능하도록 드래그 이동 무시 (단, 우측 하단 크기 조절 손잡이 영역은 허용)
                const p0 = toLocalPoint(el, e.clientX, e.clientY);
                const isResizing = (p0.x >= el.offsetWidth - 20 && p0.y >= el.offsetHeight - 20);

                if (el.getAttribute('data-type') === 'text' && e.target === el && !isResizing) {
                    return;
                }

                const startX = e.clientX;
                const startY = e.clientY;
                const startLeft = el.offsetLeft;
                const startTop = el.offsetTop;
                const startWidth = el.offsetWidth;
                const startHeight = el.offsetHeight;
                const type = el.getAttribute('data-type');

                const initialPositions = new Map();
                selectedElements.forEach(item => {
                    initialPositions.set(item, { left: item.offsetLeft, top: item.offsetTop });
                });

                function onMouseMove(e) {
                    const dx = (e.clientX - startX) / scale;
                    const dy = (e.clientY - startY) / scale;

                    if (isResizing) {
                        const minW = (type === 'calendar') ? 280 : 45;
                        const minH = (type === 'calendar') ? 250 : 30;
                        const w = Math.max(minW, startWidth + dx);
                        const h = Math.max(minH, startHeight + dy);
                        el.style.width = w + 'px';
                        el.style.height = h + 'px';
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
                    selectedElements.forEach(item => saveState(item));
                }

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
                e.stopPropagation();
            });

            if (addTextBtn) addTextBtn.addEventListener('click', function () {
                createBlock({ id: 'text_' + Date.now(), type: 'text', left: '150px', top: '150px', width: '200px', height: '80px', htmlContent: 'TEXT', textAlign: 'left' });
            });
            if (addImageBtn) addImageBtn.addEventListener('click', function () {
                createBlock({ id: 'image_' + Date.now(), type: 'image', left: '150px', top: '150px', width: '220px', height: '250px' });
            });

            if (saveBtn) saveBtn.addEventListener('click', saveAll);

            if (resetBtn) resetBtn.addEventListener('click', async function () {
                if (!confirm('현재 스토리 페이지의 모든 레이아웃 설정을 초기화하시겠습니까?')) return;
                if (sb) {
                    await sb.from(TABLE).delete().eq('page_name', PAGE);
                }
                dirty = false;
                location.reload();
            });
        }

        function selectElement(el) {
            if (!isAdmin) return;
            clearSelection();
            addToSelection(el);
        }

        function addToSelection(el) {
            selectedElements.add(el);
            el.classList.add('active-target');
            activeElement = el;
            updatePanelForActiveElement(el);
        }

        function clearSelection() {
            selectedElements.forEach(el => el.classList.remove('active-target'));
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
            const currentWidth = el.style.width || el.offsetWidth + 'px';
            const currentHeight = el.style.height || el.offsetHeight + 'px';

            const fontSize = el.style.fontSize || '16px';
            const fontWeight = el.style.fontWeight || 'normal';
            const fontStyle = el.style.fontStyle || 'normal';
            const textDecoration = el.style.textDecoration || 'none';
            const textAlign = el.style.textAlign || 'left';
            const fontColor = toHexColor(el.style.color, '#ece5d3');

            let extraSettingsHtml = '';
            if (type === 'text') {
                extraSettingsHtml = `
                <div style="border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;">
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:6px;">글자 서식 및 정렬</label>
                    <div style="display:flex; gap:6px; margin-bottom:6px;">
                        <div style="flex:1;">
                            <label style="font-size:0.75em;">글자 크기 (px)</label>
                            <input type="number" id="ctrlFontSize" value="${parseInt(fontSize)}" min="8" max="120" style="padding:4px; width:100%; box-sizing:border-box;">
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:0.75em;">굵기</label>
                            <select id="ctrlFontWeight" style="padding:4px; width:100%;">
                                <option value="normal" ${fontWeight === 'normal' ? 'selected' : ''}>일반</option>
                                <option value="bold" ${fontWeight === 'bold' ? 'selected' : ''}>굵게</option>
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
                </div>`;
            }

            panelContent.innerHTML = `
            <div style="font-weight: bold; color: #c9a86a; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">선택: ${esc(id)}</span>
                <div style="display:flex; gap:4px;">
                    <button type="button" id="deleteBlockBtn" style="background:#ff4757; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.75em;">삭제</button>
                </div>
            </div>
            <div class="panel-group"><label>가로 크기</label><input type="text" id="ctrlWidth" value="${esc(currentWidth)}"></div>
            <div class="panel-group"><label>세로 크기</label><input type="text" id="ctrlHeight" value="${esc(currentHeight)}"></div>
            ${extraSettingsHtml}
        `;

            document.getElementById('ctrlWidth').addEventListener('input', e => { el.style.width = e.target.value; saveState(el); });
            document.getElementById('ctrlHeight').addEventListener('input', e => { el.style.height = e.target.value; saveState(el); });

            if (type === 'text') {
                const sizeInput = document.getElementById('ctrlFontSize');
                const weightSelect = document.getElementById('ctrlFontWeight');
                const alignSelect = document.getElementById('ctrlTextAlign');

                function updateTextStyle() {
                    if (sizeInput) el.style.fontSize = sizeInput.value + 'px';
                    if (weightSelect) el.style.fontWeight = weightSelect.value;
                    if (alignSelect) {
                        el.style.textAlign = alignSelect.value;
                        // 정렬에 따라 justifyContent도 함께 맞춰주어 완벽하게 정렬되도록 함
                        if (alignSelect.value === 'left') el.style.justifyContent = 'flex-start';
                        else if (alignSelect.value === 'center') el.style.justifyContent = 'center';
                        else if (alignSelect.value === 'right') el.style.justifyContent = 'flex-end';
                    }
                    saveState(el);
                }
                if (sizeInput) sizeInput.addEventListener('input', updateTextStyle);
                if (weightSelect) weightSelect.addEventListener('change', updateTextStyle);
                if (alignSelect) alignSelect.addEventListener('change', updateTextStyle);
            }

            document.getElementById('deleteBlockBtn').addEventListener('click', function () {
                if (confirm('이 블록을 삭제하시겠습니까?')) {
                    el.remove();
                    clearSelection();
                    dirty = true;
                    panelContent.innerHTML = '<p style="margin: 0; color: #9d947e;">요소를 클릭하세요.</p>';
                }
            });
        }

        function saveState() { if (isAdmin) dirty = true; }

        function serializeBlock(el) {
            const id = el.getAttribute('data-id');
            if (!id) return null;
            const type = el.getAttribute('data-type') || 'text';
            const data = {
                id: id,
                type: type,
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                content: type === 'text' ? el.innerHTML : '',
                textAlign: el.style.textAlign || 'left'
            };
            return {
                id: id,
                page_name: PAGE,
                type: type,
                left: data.left,
                top: data.top,
                width: data.width,
                height: data.height,
                content: data.content,
                layout_data: data
            };
        }

        async function saveAll() {
            if (!sb) { alert('Supabase 연결 오류'); return; }
            const rows = Array.from(gallery.querySelectorAll('.editable-element')).map(serializeBlock).filter(Boolean);
            if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장중'; }
            try {
                if (rows.length) {
                    const { error } = await sb.from(TABLE).upsert(rows);
                    if (error) throw error;
                }
                dirty = false;
                alert('스토리 레이아웃이 저장되었습니다!');
            } catch (err) {
                alert('저장 실패: ' + (err.message || err));
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
            }
        }

        async function loadLayout() {
            if (!sb) return;
            const { data, error } = await sb.from(TABLE).select('*').eq('page_name', PAGE);
            if (error || !data) return;
            loaded = true;

            data.forEach(row => {
                let parsed = {};
                try { if (row.layout_data) parsed = typeof row.layout_data === 'string' ? JSON.parse(row.layout_data) : row.layout_data; } catch (e) { }
                const d = Object.assign({
                    id: row.id, type: row.type, left: row.left, top: row.top, width: row.width, height: row.height,
                    content: row.content, textAlign: row.textAlign
                }, parsed);

                if (!d.id || document.querySelector(`[data-id="${d.id}"]`)) return;

                createBlock({
                    silent: true,
                    id: d.id,
                    type: d.type || 'text',
                    left: d.left, top: d.top, width: d.width, height: d.height,
                    htmlContent: d.content,
                    textAlign: d.textAlign || 'left'
                });
            });
        }

        function createBlock(config) {
            if (!config || !config.id) return;
            const type = config.type || 'text';
            const textAlign = config.textAlign || 'left';

            const newEl = document.createElement('div');
            newEl.className = `mh-blk mh-bx-cut editable-element shape-rect`;
            newEl.setAttribute('data-id', config.id);
            newEl.setAttribute('data-type', type);

            newEl.style.left = config.left || '100px';
            newEl.style.top = config.top || '100px';
            newEl.style.width = config.width || '200px';
            newEl.style.height = config.height || '80px';
            newEl.style.textAlign = textAlign;
            if (textAlign === 'left') newEl.style.justifyContent = 'flex-start';
            else if (textAlign === 'center') newEl.style.justifyContent = 'center';
            else if (textAlign === 'right') newEl.style.justifyContent = 'flex-end';

            newEl.style.backgroundColor = 'rgba(201,168,106,0.05)';
            newEl.style.color = '#ece5d3';

            if (type === 'text') {
                newEl.contentEditable = isAdmin ? 'true' : 'false';
                newEl.innerHTML = config.htmlContent || 'TEXT';
                newEl.addEventListener('input', () => { saveState(newEl); });
                
                // [추가] 스토리 페이지 텍스트 블록 엔터 개행 처리
                newEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        document.execCommand('insertLineBreak');
                        e.preventDefault();
                    }
                });
            }

            gallery.appendChild(newEl);
            if (isAdmin && !config.silent) {
                saveState(newEl);
                selectElement(newEl);
            }
        }

        MZ.fitStage();
        MZ.applyBackground();
        loadLayout();
    };
})();