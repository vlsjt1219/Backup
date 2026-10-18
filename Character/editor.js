/* =====================================================================
   MAFIAZ 레이아웃 에디터 (그누보드 → GitHub / Netlify / Supabase 이전판)
   - index.html  : 방문자용 (보기 전용)   → startEditor(false)
   - admin.html  : 관리자용 (로그인 후)   → startEditor(true)
   - 레이아웃은 Supabase 'layouts' 테이블에 저장, 그림 파일은 GitHub 저장소(images 폴더)에 두고 경로만 입력
   ===================================================================== */
(function () {
    const SUPABASE_URL = 'https://hkwarwmmkzubqvwwyazp.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd2Fyd21ta3p1YnF2d3d5YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI0ODYsImV4cCI6MjEwNzgwODQ4Nn0.vInox6kk9Md6t2eayA05G8Lax2oP92SBl6HF_2XdJA8';
    const TABLE = 'layouts';
    // 같은 layouts 테이블을 Character / Gallery 페이지와 나눠 쓸 수 있도록 page_name 으로 구분
    // (다른 페이지에서는 startEditor 전에 window.MAFIAZ_PAGE = 'character' 처럼 지정)
    const PAGE = window.MAFIAZ_PAGE || 'main';

    const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
    window.mafiazSb = sb;

    window.startEditor = function (isAdmin) {
        const gallery = document.getElementById('draggableGallery');
        const panelContent = document.getElementById('panelContent');
        const resetBtn = document.getElementById('resetLayoutBtn');
        const saveBtn = document.getElementById('saveLayoutBtn');
        const addTextBtn = document.getElementById('addTextBtn');
        const addCalendarBtn = document.getElementById('addCalendarBtn');
        const addImageBtn = document.getElementById('addImageBtn');
        const snapToggle = document.getElementById('snapToggle');
        const lineV = document.getElementById('centerSnapLineV');
        const lineH = document.getElementById('centerSnapLineH');
        const elemLineV = document.getElementById('elemSnapLineV');
        const elemLineH = document.getElementById('elemSnapLineH');
        const selectionMarquee = document.getElementById('selectionMarquee');

        // 모달 관련 요소
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
        let dirty = false;     // 저장하지 않은 변경이 있는지
        let loaded = false;    // DB에서 정상적으로 불러왔는지 (실패 상태에서 저장하면 DB가 비워질 수 있어 막음)

        // 관리자 편집 중: 오른쪽에 패널 자리를 비우고, 호버 모션을 꺼서 드래그 위치가 어긋나 보이지 않게 함
        if (isAdmin) document.body.classList.add('is-admin', 'mh-admin-edit');

        // GitHub 화면 주소(github.com/.../blob/...)를 이미지 직접 주소(raw.githubusercontent.com)로 변환
        function normalizeImgUrl(u) {
            u = String(u || '').trim();
            let m = u.match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|raw)\/([^?#]+)/i);
            if (m) return 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3];
            return u;
        }

        const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

        function hexToRgba(hex, alpha) {
            let c = hex.replace('#', '');
            if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
            const num = parseInt(c, 16);
            return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
        }

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

        // 색상 문자열(rgb(...) 포함)을 <input type=color> 용 #hex 로 변환
        function toHexColor(c, fallback) {
            if (!c) return fallback;
            if (c.startsWith('#')) return c.length === 7 ? c : fallback;
            const m = c.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
            if (!m) return fallback;
            return '#' + [m[1], m[2], m[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        }

        // ─────────────────────────────────────────────
        // 이미지 렌더링 공통 함수 (관리자/방문자 동일 규칙)
        // ─────────────────────────────────────────────
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
            if (s.src) img.src = normalizeImgUrl(s.src);
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

        function updateImageTransforms(el) {
            const main = el.getAttribute('data-main-img') || 'A';
            const other = main === 'A' ? 'B' : 'A';
            const m = el.querySelector('.main-img');
            const h = el.querySelector('.hover-img');
            if (!m || !h) { renderImageBlock(el); return; }
            m.style.transform = imgTransformCss(getImgState(el, main));
            h.style.transform = imgTransformCss(getImgState(el, other));
        }

        // ─────────────────────────────────────────────
        // 관리자 전용 기능
        // ─────────────────────────────────────────────
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
            let imgOffsetX = 0, imgOffsetY = 0;   // % (프레임 크기 대비)

            function loadModalData() {
                if (!editingImageElement) return;
                const s = getImgState(editingImageElement, currentEditingTarget);
                imgOffsetX = s.x;
                imgOffsetY = s.y;
                modalTargetImg.style.objectFit = 'contain';
                modalTargetImg.style.left = '0';
                modalTargetImg.style.top = '0';
                modalTargetImg.style.transformOrigin = 'center center';
                if (s.src) modalTargetImg.src = normalizeImgUrl(s.src); else modalTargetImg.removeAttribute('src');
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
                const fw = frame.width || 1;
                const fh = frame.height || 1;
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

            // ── 드래그 이동 / 크기 조절 / 다중 선택 ──
            // 화면 배율(스테이지 확대/축소)과 회전을 보정해서, 마우스 위치와 블록이 항상 정확히 맞도록 계산합니다.
            function getScale() {
                const r = gallery.getBoundingClientRect();
                return (gallery.offsetWidth ? r.width / gallery.offsetWidth : 1) || 1;
            }

            // 마우스 좌표 → 블록 중심 기준의 로컬 좌표 (배율·회전 제거)
            function toLocalPoint(el, cx, cy) {
                const r = el.getBoundingClientRect();
                const s = getScale();
                const dx = (cx - (r.left + r.width / 2)) / s;
                const dy = (cy - (r.top + r.height / 2)) / s;
                const a = -(parseFloat(el.getAttribute('data-rotate')) || 0) * Math.PI / 180;
                return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
            }

            // 회전된 블록의 좌상단 모서리 위치 (부모 좌표계)
            function rotatedTopLeft(l, t, w, h, a) {
                const cx = l + w / 2, cy = t + h / 2;
                const vx = -w / 2, vy = -h / 2;
                return { x: cx + vx * Math.cos(a) - vy * Math.sin(a), y: cy + vx * Math.sin(a) + vy * Math.cos(a) };
            }

            // 가이드선은 .mh-win 기준으로 놓여 있으므로 갤러리 위치만큼 보정
            function showGuide(line, axis, pos) {
                if (!line) return;
                if (axis === 'v') line.style.left = (gallery.offsetLeft + pos) + 'px';
                else line.style.top = (gallery.offsetTop + pos) + 'px';
                line.style.display = 'block';
            }
            function hideGuides() {
                [lineV, lineH, elemLineV, elemLineH].forEach(l => { if (l) l.style.display = 'none'; });
            }

            gallery.addEventListener('mousedown', function (e) {
                if (e.button !== 0) return;
                const el = e.target.closest('.editable-element');
                const scale = getScale();

                // ── 빈 곳 드래그: 영역 선택 ──
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

                const startX = e.clientX;
                const startY = e.clientY;
                const angle = (parseFloat(el.getAttribute('data-rotate')) || 0) * Math.PI / 180;

                // 오른쪽 아래 25px(블록 기준) 안쪽을 잡으면 크기 조절 — 회전된 블록도 정확히 판정
                const p0 = toLocalPoint(el, e.clientX, e.clientY);
                const isResizing = (p0.x >= el.offsetWidth / 2 - 25 && p0.y >= el.offsetHeight / 2 - 25);

                const initialPositions = new Map();
                selectedElements.forEach(item => {
                    initialPositions.set(item, { left: item.offsetLeft, top: item.offsetTop });
                });

                const startLeft = el.offsetLeft;
                const startTop = el.offsetTop;
                const startWidth = el.offsetWidth;
                const startHeight = el.offsetHeight;
                const type = el.getAttribute('data-type');

                function onMouseMove(e) {
                    const dx = (e.clientX - startX) / scale;
                    const dy = (e.clientY - startY) / scale;

                    if (isResizing) {
                        // 화면상의 이동량을 블록의 회전 방향으로 환산
                        const ca = Math.cos(-angle), sa = Math.sin(-angle);
                        const ldx = dx * ca - dy * sa;
                        const ldy = dx * sa + dy * ca;
                        const minW = (type === 'calendar') ? 280 : 45;
                        const minH = (type === 'calendar') ? 250 : 30;
                        const w = Math.max(minW, startWidth + ldx);
                        const h = Math.max(minH, startHeight + ldy);

                        // 좌상단 모서리가 화면에서 움직이지 않도록 위치 보정
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
                    selectedElements.forEach(item => saveState(item));
                }

                window.addEventListener('mousemove', onMouseMove);
                window.addEventListener('mouseup', onMouseUp);
                e.stopPropagation();
            });

            // ── 더블클릭: 글 수정 / 이미지 구도 편집 ──
            gallery.addEventListener('dblclick', function (e) {
                const el = e.target.closest('.editable-element');
                if (!el) return;
                const type = el.getAttribute('data-type');
                if (type === 'text' || type === 'default') {
                    const newText = prompt('수정할 내용을 입력하세요:', el.innerText);
                    if (newText !== null) {
                        el.innerText = newText;
                        saveState(el);
                    }
                } else if (type === 'image') {
                    editingImageElement = el;
                    currentEditingTarget = 'A';
                    if (editTabA && editTabB) {
                        editTabA.style.background = '#c9a86a'; editTabA.style.color = '#111';
                        editTabB.style.background = '#1f1f2a'; editTabB.style.color = '#ece5d3';
                    }

                    const bWidth = el.clientWidth || el.offsetWidth || 220;
                    const bHeight = el.clientHeight || el.offsetHeight || 250;
                    const frameScale = Math.min(390 / bWidth, 300 / bHeight);

                    cropPreviewContainer.style.boxSizing = 'content-box';
                    cropPreviewContainer.style.aspectRatio = 'auto';
                    cropPreviewContainer.style.maxHeight = 'none';
                    cropPreviewContainer.style.width = Math.round(bWidth * frameScale) + 'px';
                    cropPreviewContainer.style.height = Math.round(bHeight * frameScale) + 'px';

                    let currentShape = 'shape-rect';
                    for (let cls of el.classList) {
                        if (cls.startsWith('shape-')) { currentShape = cls; break; }
                    }
                    const cropInnerBox = document.getElementById('cropInnerBox');
                    if (cropInnerBox) {
                        cropInnerBox.className = '';
                        cropInnerBox.classList.add(currentShape);
                        const rPx = parseFloat(el.style.borderRadius) || 0;
                        cropInnerBox.style.borderRadius = (rPx * frameScale) + 'px';
                    }
                    cropPreviewContainer.style.borderRadius = '4px';

                    loadModalData();
                    imageEditModal.style.display = 'flex';
                }
            });

            // ── 블록 추가 버튼 ──
            if (addTextBtn) addTextBtn.addEventListener('click', function () {
                createBlock({ id: 'text_' + Date.now(), type: 'text', left: '150px', top: '150px', width: '120px', height: '40px', htmlContent: 'HOME' });
            });
            if (addCalendarBtn) addCalendarBtn.addEventListener('click', function () {
                const now = new Date();
                createBlock({ id: 'calendar_' + Date.now(), type: 'calendar', left: '120px', top: '120px', width: '300px', height: '340px', calYear: String(now.getFullYear()), calMonth: String(now.getMonth() + 1) });
            });
            if (addImageBtn) addImageBtn.addEventListener('click', function () {
                createBlock({ id: 'image_' + Date.now(), type: 'image', left: '150px', top: '150px', width: '220px', height: '250px' });
            });

            if (saveBtn) saveBtn.addEventListener('click', saveAll);

            if (resetBtn) resetBtn.addEventListener('click', async function () {
                if (!confirm('모든 레이아웃 설정을 초기화(DB 삭제)하시겠습니까?')) return;
                if (sb) {
                    const { error } = await sb.from(TABLE).delete().eq('page_name', PAGE);
                    if (error) { alert('초기화 실패: ' + error.message); return; }
                }
                dirty = false;
                location.reload();
            });
        }

        // ── 달력 이전/다음 달, 방문자 링크 이동 ──
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
                el.innerHTML = getCalendarHtml(year, month, el.getAttribute('data-sch-date') || '', el.getAttribute('data-sch-text') || '');
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

        // 이미지 A/B 경로 입력 연결 (그림 파일은 GitHub 저장소에 올리고 경로만 입력)
        function bindImgSide(el, S) {
            const lower = S.toLowerCase();
            const t = document.getElementById('val' + S + 'Input');
            if (!t) return;
            t.addEventListener('input', ev => {
                el.setAttribute('data-val-' + lower, ev.target.value.trim());
                renderImageBlock(el);
                saveState(el);
            });
        }

        function updatePanelForActiveElement(el) {
            if (!panelContent) return;
            const id = el.getAttribute('data-id');
            const type = el.getAttribute('data-type');
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

            let currentShape = 'shape-rect';
            for (let cls of el.classList) {
                if (cls.startsWith('shape-')) { currentShape = cls; break; }
            }

            let extraSettingsHtml = '';
            if (type === 'text') {
                extraSettingsHtml = `
                <div style="border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;">
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:6px;">글자 꾸미기 설정</label>
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
                    <div style="display:flex; gap:10px; align-items:center; margin-top:4px; font-size:0.85em;">
                        <label style="margin:0; cursor:pointer;"><input type="checkbox" id="ctrlFontItalic" ${fontStyle === 'italic' ? 'checked' : ''} style="accent-color:#c9a86a;"> 기울임 (Italic)</label>
                        <label style="margin:0; cursor:pointer;"><input type="checkbox" id="ctrlFontUnderline" ${textDecoration.includes('underline') ? 'checked' : ''} style="accent-color:#c9a86a;"> 밑줄</label>
                    </div>
                </div>`;
            } else if (type === 'calendar') {
                extraSettingsHtml = `
                <div style="border-top: 1px dashed rgba(201,168,106,0.3); margin-top: 10px; padding-top: 10px;">
                    <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px;">일정</label>
                    <div style="display:flex; gap:4px; margin-bottom:6px; align-items:center;">
                        <input type="date" id="schDate" value="${esc(el.getAttribute('data-sch-date') || '')}" style="flex:1.2; padding:4px;">
                        <input type="text" id="schText" value="${esc(el.getAttribute('data-sch-text') || '')}" placeholder="내용" style="flex:1; padding:4px;">
                        <button type="button" id="delSchBtn" style="background:#ff4757; border:none; color:#fff; width:28px; height:28px; border-radius:3px; cursor:pointer; font-weight:bold;">✕</button>
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
                    <div style="font-size:0.72em; color:#9d947e; margin-bottom:6px;">그림은 GitHub 저장소의 images 폴더에 올린 뒤 경로(images/파일명.png)나 전체 주소를 입력하세요.</div>
                    ${sideHtml('A', valA)}
                    ${sideHtml('B', valB)}
                </div>`;
            }

            let shapeSelectorHtml = '';
            if (type === 'text' || type === 'image') {
                shapeSelectorHtml = `
                <div class="panel-group" style="margin-top:6px;">
                    <label>도형 형태 (PPT 스타일)</label>
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

            const fonts = ['Pretendard', 'Playfair Display', 'Courier Prime', 'Bebas Neue', 'Zen Antique', 'Noto Serif SC', '조선일보명조', '조선신명조', '안될과학약체'];
            const fontOptions = fonts.map(f => `<option value="${f}" ${fontFamily.includes(f) ? 'selected' : ''}>${f}</option>`).join('');

            panelContent.innerHTML = `
            <div style="font-weight: bold; color: #c9a86a; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:150px;">선택: ${esc(id)}</span>
                <div style="display:flex; gap:4px;">
                    <button type="button" id="duplicateBlockBtn" style="background:#706fd3; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.75em;">복제</button>
                    <button type="button" id="deleteBlockBtn" style="background:#ff4757; border:none; color:#fff; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:0.75em;">삭제</button>
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
                <label>마우스 오버 애니메이션 강도</label>
                <select id="ctrlAnimIntensity" style="width:100%; padding:4px;">
                    <option value="0" ${animIntensity === '0' ? 'selected' : ''}>없음 (0)</option>
                    <option value="1" ${animIntensity === '1' ? 'selected' : ''}>약함 (1)</option>
                    <option value="2" ${animIntensity === '2' ? 'selected' : ''}>보통 (2)</option>
                    <option value="3" ${animIntensity === '3' ? 'selected' : ''}>강함 (3)</option>
                </select>
            </div>

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
                    <input type="number" id="ctrlBorderWidth" value="${borderWidth}" min="1" max="20" style="width:60px; padding:3px;" placeholder="두께(px)">
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
                <label style="font-weight:bold; color:#c9a86a; margin-bottom:4px;">글자 폰트 및 색상</label>
                <div style="margin-bottom:6px;">
                    <select id="ctrlFontFamily" style="width:100%; padding:4px;">${fontOptions}</select>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <label style="font-size:0.8em; margin:0; flex:1;">글자 색상</label>
                    <input type="color" id="ctrlFontColor" value="${fontColor}" style="width:100px; height:26px; background:#111; border:1px solid #444; cursor:pointer;">
                </div>
            </div>

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
                const italicCheck = document.getElementById('ctrlFontItalic');
                const underlineCheck = document.getElementById('ctrlFontUnderline');
                function updateTextStyle() {
                    el.style.fontSize = sizeInput.value + 'px';
                    el.style.fontWeight = weightSelect.value;
                    el.style.fontStyle = italicCheck.checked ? 'italic' : 'normal';
                    el.style.textDecoration = underlineCheck.checked ? 'underline' : 'none';
                    saveState(el);
                }
                sizeInput.addEventListener('input', updateTextStyle);
                weightSelect.addEventListener('change', updateTextStyle);
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
                createBlock({
                    id: type + '_' + Date.now(),
                    type: type,
                    left: (el.offsetLeft + 20) + 'px',
                    top: (el.offsetTop + 20) + 'px',
                    width: el.style.width,
                    height: el.style.height,
                    htmlContent: type === 'text' ? el.innerHTML : '',
                    schDate: el.getAttribute('data-sch-date') || '',
                    schText: el.getAttribute('data-sch-text') || '',
                    calYear: el.getAttribute('data-cal-year') || '2026',
                    calMonth: el.getAttribute('data-cal-month') || '10',
                    linkUrl: el.getAttribute('data-link-url') || '',
                    borderStyle: el.style.border,
                    bgCol: el.style.backgroundColor,
                    bRadius: el.style.borderRadius,
                    fFamily: el.style.fontFamily,
                    fColor: el.style.color,
                    animIntensity: el.getAttribute('data-anim-intensity') || '2',
                    fontSize: el.style.fontSize || '',
                    fontWeight: el.style.fontWeight || '',
                    fontStyle: el.style.fontStyle || '',
                    textDecoration: el.style.textDecoration || '',
                    srcTypeA: el.getAttribute('data-srctype-a') || 'url',
                    valA: el.getAttribute('data-val-a') || '',
                    srcTypeB: el.getAttribute('data-srctype-b') || 'url',
                    valB: el.getAttribute('data-val-b') || '',
                    mainImg: el.getAttribute('data-main-img') || 'A',
                    scaleA: el.getAttribute('data-img-scale-a') || '1',
                    posxA: el.getAttribute('data-img-posx-a') || '0',
                    posyA: el.getAttribute('data-img-posy-a') || '0',
                    scaleB: el.getAttribute('data-img-scale-b') || '1',
                    posxB: el.getAttribute('data-img-posx-b') || '0',
                    posyB: el.getAttribute('data-img-posy-b') || '0',
                    shapeClass: currentShape,
                    rotateDeg: currentRot
                });
            });

            document.getElementById('ctrlAnimIntensity').addEventListener('change', e => {
                el.setAttribute('data-anim-intensity', e.target.value);
                saveState(el);
            });

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
                el.style.fontFamily = document.getElementById('ctrlFontFamily').value;
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

            document.getElementById('deleteBlockBtn').addEventListener('click', function () {
                if (confirm('이 블록을 삭제하시겠습니까? (저장 버튼을 눌러야 DB에 반영됩니다)')) {
                    selectedElements.forEach(item => item.remove());
                    clearSelection();
                    dirty = true;
                    panelContent.innerHTML = '<p style="margin: 0; color: #9d947e;">요소를 클릭하거나 빈 곳을 드래그하여 다중 선택해보세요.</p>';
                }
            });

            if (type === 'calendar') {
                const updateCalContent = () => {
                    const d = document.getElementById('schDate').value;
                    const t = document.getElementById('schText').value;
                    el.setAttribute('data-sch-date', d);
                    el.setAttribute('data-sch-text', t);
                    el.innerHTML = getCalendarHtml(parseInt(el.getAttribute('data-cal-year') || '2026'), parseInt(el.getAttribute('data-cal-month') || '10'), d, t);
                    saveState(el);
                };
                document.getElementById('schDate').addEventListener('input', updateCalContent);
                document.getElementById('schText').addEventListener('input', updateCalContent);
                document.getElementById('delSchBtn').addEventListener('click', function () {
                    el.setAttribute('data-sch-date', '');
                    el.setAttribute('data-sch-text', '');
                    el.innerHTML = getCalendarHtml(parseInt(el.getAttribute('data-cal-year') || '2026'), parseInt(el.getAttribute('data-cal-month') || '10'), '', '');
                    saveState(el);
                    selectElement(el);
                });
            }
        }

        // ─────────────────────────────────────────────
        // 저장 / 불러오기 (Supabase)
        // ─────────────────────────────────────────────
        // 변경 표시만 해 두고, 실제 DB 저장은 [저장] 버튼에서 일괄 처리
        function saveState() { if (isAdmin) dirty = true; }

        function serializeBlock(el) {
            const id = el.getAttribute('data-id');
            if (!id || id === 'undefined' || id === 'null') return null;

            let shapeClass = 'shape-rect';
            for (let cls of el.classList) {
                if (cls.startsWith('shape-')) { shapeClass = cls; break; }
            }
            const type = el.getAttribute('data-type') || 'default';
            const rawRotate = el.getAttribute('data-rotate');
            const rotateVal = (rawRotate !== null) ? parseInt(rawRotate) || 0 : 0;

            const data = {
                id: id,
                type: type,
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                rotate: rotateVal,
                shape: shapeClass,
                content: (type === 'text' || type === 'default') ? el.innerHTML : '',   // 이미지·달력은 속성에서 다시 그리므로 저장하지 않음
                border: (el.style.border === 'none' || !el.style.border) ? 'none' : el.style.border,
                backgroundColor: el.style.backgroundColor,
                borderRadius: el.style.borderRadius,
                fontFamily: el.style.fontFamily,
                color: el.style.color,
                fontSize: el.style.fontSize || '',
                fontWeight: el.style.fontWeight || '',
                fontStyle: el.style.fontStyle || '',
                textDecoration: el.style.textDecoration || '',
                linkUrl: el.getAttribute('data-link-url') || '',
                animIntensity: el.getAttribute('data-anim-intensity') || '2',
                schDate: el.getAttribute('data-sch-date') || '',
                schText: el.getAttribute('data-sch-text') || '',
                calYear: el.getAttribute('data-cal-year') || '2026',
                calMonth: el.getAttribute('data-cal-month') || '10',
                srcTypeA: el.getAttribute('data-srctype-a') || 'url',
                valA: el.getAttribute('data-val-a') || '',
                srcTypeB: el.getAttribute('data-srctype-b') || 'url',
                valB: el.getAttribute('data-val-b') || '',
                mainImg: el.getAttribute('data-main-img') || 'A',
                imgScaleA: el.getAttribute('data-img-scale-a') || '1',
                imgPosXA: el.getAttribute('data-img-posx-a') || '0',
                imgPosYA: el.getAttribute('data-img-posy-a') || '0',
                imgScaleB: el.getAttribute('data-img-scale-b') || '1',
                imgPosXB: el.getAttribute('data-img-posx-b') || '0',
                imgPosYB: el.getAttribute('data-img-posy-b') || '0',
                imgUnit: 'pct'
            };

            // 기존 layouts 테이블 컬럼은 그대로 채우고, 나머지 전체 설정은 layout_data(JSON)에 보관
            return {
                id: id,
                page_name: PAGE,
                type: type,
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
                layout_data: data      // layout_data 는 json 컬럼이라 객체 그대로 저장
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
                // 화면에서 삭제한 블록은 DB에서도 제거
                const { data: existing, error: e2 } = await sb.from(TABLE).select('id').eq('page_name', PAGE);
                if (e2) throw e2;
                const keep = new Set(rows.map(r => r.id));
                const del = (existing || []).map(r => r.id).filter(id => !keep.has(id));
                if (del.length) {
                    const { error: e3 } = await sb.from(TABLE).delete().in('id', del);
                    if (e3) throw e3;
                }
                await saveSettingsRow();
                dirty = false;
                alert('레이아웃이 저장되어 모든 방문자에게 반영되었습니다!');
            } catch (err) {
                alert('저장 실패: ' + (err.message || err));
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; }
            }
        }

        function mapShape(s) {
            if (s === 'shape-circle') return 'shape-oval';          // 예전 에디터 값 호환
            if (s === 'shape-skew') return 'shape-parallelogram';
            return s || 'shape-rect';
        }

        async function loadLayout() {
            if (!sb) { console.error('Supabase SDK 로드 실패'); return; }
            const { data, error } = await sb.from(TABLE).select('*').eq('page_name', PAGE);
            if (error || !data) { console.error('레이아웃 불러오기 실패', error); return; }
            loaded = true;

            data.forEach(row => {
                let parsed = {};
                try { if (row.layout_data) parsed = typeof row.layout_data === 'string' ? JSON.parse(row.layout_data) : row.layout_data; } catch (e) { }
                const d = Object.assign({
                    id: row.id, type: row.type, left: row.left, top: row.top, width: row.width, height: row.height,
                    content: row.content, border: row.border, backgroundColor: row.backgroundColor,
                    borderRadius: row.borderRadius, color: row.color, linkUrl: row.linkUrl
                }, parsed);

                if (!d.id || document.querySelector(`[data-id="${d.id}"]`)) return;

                // 예전 이미지 행(content 에 <img> 만 있는 경우)에서 주소 복구
                if (d.type === 'image' && !d.valA && d.content) {
                    const m = String(d.content).match(/src="([^"]+)"/);
                    if (m) d.valA = m[1];
                }

                createBlock({
                    silent: true,
                    id: d.id,
                    type: d.type || 'default',
                    left: d.left, top: d.top, width: d.width, height: d.height,
                    rotateDeg: (d.rotate !== undefined && d.rotate !== null) ? d.rotate : 0,
                    shapeClass: mapShape(d.shape),
                    htmlContent: d.content,
                    borderStyle: d.border,
                    bgCol: d.backgroundColor,
                    bRadius: d.borderRadius,
                    fFamily: d.fontFamily,
                    fColor: d.color,
                    fontSize: d.fontSize, fontWeight: d.fontWeight, fontStyle: d.fontStyle, textDecoration: d.textDecoration,
                    linkUrl: d.linkUrl,
                    animIntensity: d.animIntensity,
                    schDate: d.schDate, schText: d.schText, calYear: d.calYear, calMonth: d.calMonth,
                    srcTypeA: d.srcTypeA, valA: d.valA, srcTypeB: d.srcTypeB, valB: d.valB,
                    mainImg: d.mainImg,
                    scaleA: d.imgScaleA, posxA: d.imgPosXA, posyA: d.imgPosYA,
                    scaleB: d.imgScaleB, posxB: d.imgPosXB, posyB: d.imgPosYB
                });
            });
        }

        // ─────────────────────────────────────────────
        // 달력 / 블록 생성
        // ─────────────────────────────────────────────
        function getCalendarHtml(year, month, dateStr, textStr) {
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

            let scheduleBarHtml = '';
            if (dateStr && textStr) {
                scheduleBarHtml = `
                <div class="cal-schedule-bar" style="background:rgba(201,168,106,0.15); border:1px solid rgba(201,168,106,0.3);">
                    <span style="color:#706fd3; font-weight:bold;">${esc(dateStr).replaceAll('-', '/')}</span> ${esc(textStr)}
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

        function createBlock(config) {
            if (!config || !config.id || config.id === 'undefined' || config.id === 'null') return;

            const type = config.type || 'default';
            const now = new Date();
            const calYear = config.calYear || String(now.getFullYear());
            const calMonth = config.calMonth || String(now.getMonth() + 1);
            const shapeClass = config.shapeClass || 'shape-rect';
            const rotateDeg = config.rotateDeg || 0;
            const linkUrl = config.linkUrl || '';

            const newEl = document.createElement('div');
            newEl.className = `mh-blk mh-bx-cut editable-element ${shapeClass}`;
            newEl.setAttribute('data-id', config.id);
            newEl.setAttribute('data-type', type);
            newEl.setAttribute('data-rotate', rotateDeg);
            if (config.schDate) newEl.setAttribute('data-sch-date', config.schDate);
            if (config.schText) newEl.setAttribute('data-sch-text', config.schText);
            if (linkUrl) newEl.setAttribute('data-link-url', linkUrl);
            newEl.setAttribute('data-anim-intensity', config.animIntensity || '2');

            if (type === 'calendar') {
                newEl.setAttribute('data-cal-year', calYear);
                newEl.setAttribute('data-cal-month', calMonth);
            }
            if (type === 'image') {
                newEl.setAttribute('data-srctype-a', config.srcTypeA || 'url');
                newEl.setAttribute('data-val-a', config.valA || '');
                newEl.setAttribute('data-srctype-b', config.srcTypeB || 'url');
                newEl.setAttribute('data-val-b', config.valB || '');
                newEl.setAttribute('data-main-img', config.mainImg || 'A');
                newEl.setAttribute('data-img-scale-a', config.scaleA || '1');
                newEl.setAttribute('data-img-posx-a', config.posxA || '0');
                newEl.setAttribute('data-img-posy-a', config.posyA || '0');
                newEl.setAttribute('data-img-scale-b', config.scaleB || '1');
                newEl.setAttribute('data-img-posx-b', config.posxB || '0');
                newEl.setAttribute('data-img-posy-b', config.posyB || '0');
            }

            newEl.style.left = config.left || '100px';
            newEl.style.top = config.top || '100px';
            newEl.style.width = config.width || '150px';
            newEl.style.height = config.height || '150px';
            newEl.style.transform = `rotate(${rotateDeg}deg)`;

            newEl.style.border = config.borderStyle || '1px solid rgba(201,168,106,0.35)';
            newEl.style.backgroundColor = config.bgCol || 'rgba(201,168,106,0.05)';
            newEl.style.borderRadius = config.bRadius || '6px';
            newEl.style.fontFamily = config.fFamily || 'Pretendard';
            newEl.style.color = config.fColor || '#ece5d3';

            if (config.fontSize) newEl.style.fontSize = config.fontSize;
            if (config.fontWeight) newEl.style.fontWeight = config.fontWeight;
            if (config.fontStyle) newEl.style.fontStyle = config.fontStyle;
            if (config.textDecoration) newEl.style.textDecoration = config.textDecoration;

            if (!isAdmin) newEl.style.cursor = linkUrl ? 'pointer' : 'default';

            if (type === 'image') {
                renderImageBlock(newEl);
            } else if (type === 'calendar') {
                newEl.innerHTML = getCalendarHtml(parseInt(calYear), parseInt(calMonth), config.schDate || '', config.schText || '');
            } else {
                newEl.innerHTML = config.htmlContent || '';
            }

            gallery.appendChild(newEl);
            if (isAdmin && !config.silent) {
                saveState(newEl);
                selectElement(newEl);
            }
        }

        // ─────────────────────────────────────────────
        // 화면 배율 맞춤: 디자인 영역(기본 1500x900) 전체를 모니터 크기에 맞춰 확대/축소
        // ─────────────────────────────────────────────
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
        if (!window.__mafiazFitBound) {
            window.__mafiazFitBound = true;
            window.addEventListener('resize', () => { if (window.__mafiazFit) window.__mafiazFit(); });
        }
        window.__mafiazFit = fitStage;
        fitStage();

        // ─────────────────────────────────────────────
        // 페이지 배경 설정 (배경 이미지 / 어둡기 / 창 투명도) — layouts 테이블의 설정 전용 행에 저장
        // ─────────────────────────────────────────────
        const SETTINGS_ID = 'settings_' + PAGE;
        const defaultSettings = { bgImage: '', bgDim: 0.45, winAlpha: 0.88 };
        let siteSettings = Object.assign({}, defaultSettings);
        let settingsLoaded = false;

        const bgImageInput = document.getElementById('bgImageInput');
        const bgDimRange = document.getElementById('bgDimRange');
        const bgDimVal = document.getElementById('bgDimVal');
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
            t.onerror = () => { if (seq === bgCheckSeq) { st.style.color = '#ff4757'; st.textContent = '✖ 이미지를 불러오지 못했습니다. 경로·대소문자를 확인하세요. 저장소가 비공개(private)이면 외부 주소로는 보이지 않으니, 사이트와 같은 저장소의 상대 경로(예: Image/background.webp)를 쓰세요.'; } };
            t.src = url;
        }

        function applySettings() {
            const bg = document.getElementById('pageBg');
            const stage = document.getElementById('mh-gpfto');
            if (bg) {
                const url = normalizeImgUrl(siteSettings.bgImage);
                bg.style.backgroundImage = url ? 'url("' + url.replace(/"/g, '%22') + '")' : 'none';
                checkBgImage(url);
                bg.style.setProperty('--bg-dim', siteSettings.bgDim);
            }
            if (stage) stage.style.setProperty('--win', 'rgba(13,16,30,' + siteSettings.winAlpha + ')');
        }

        function syncSettingsPanel() {
            if (bgImageInput) bgImageInput.value = siteSettings.bgImage || '';
            if (bgDimRange) bgDimRange.value = siteSettings.bgDim;
            if (bgDimVal) bgDimVal.textContent = Number(siteSettings.bgDim).toFixed(2);
            if (winAlphaRange) winAlphaRange.value = siteSettings.winAlpha;
            if (winAlphaVal) winAlphaVal.textContent = Number(siteSettings.winAlpha).toFixed(2);
        }

        async function loadSettings() {
            if (!sb) return;
            const { data, error } = await sb.from(TABLE).select('layout_data').eq('id', SETTINGS_ID).maybeSingle();
            if (error) { console.error('배경 설정 불러오기 실패', error); return; }
            settingsLoaded = true;
            let d = data && data.layout_data;
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            if (d && typeof d === 'object') siteSettings = Object.assign({}, defaultSettings, d);
            applySettings();
            syncSettingsPanel();
        }

        async function saveSettingsRow() {
            if (!settingsLoaded) return;   // 불러오기에 실패한 상태에서는 기존 설정을 덮어쓰지 않음
            const row = {
                id: SETTINGS_ID, page_name: '__settings__', type: 'settings',
                left: '', top: '', width: '', height: '', content: '', border: '',
                backgroundColor: '', borderRadius: '', fontFamily: '', color: '', linkUrl: '',
                layout_data: siteSettings
            };
            const { error } = await sb.from(TABLE).upsert([row]);
            if (error) throw error;
        }

        if (isAdmin) {
            if (bgImageInput) bgImageInput.addEventListener('input', e => {
                siteSettings.bgImage = e.target.value.trim();
                applySettings(); dirty = true;
            });
            if (bgDimRange) bgDimRange.addEventListener('input', e => {
                siteSettings.bgDim = parseFloat(e.target.value);
                if (bgDimVal) bgDimVal.textContent = siteSettings.bgDim.toFixed(2);
                applySettings(); dirty = true;
            });
            if (winAlphaRange) winAlphaRange.addEventListener('input', e => {
                siteSettings.winAlpha = parseFloat(e.target.value);
                if (winAlphaVal) winAlphaVal.textContent = siteSettings.winAlpha.toFixed(2);
                applySettings(); dirty = true;
            });
            if (bgClearBtn) bgClearBtn.addEventListener('click', () => {
                siteSettings.bgImage = '';
                syncSettingsPanel(); applySettings(); dirty = true;
            });
        }

        applySettings();
        loadSettings();
        loadLayout();
    };
})();
