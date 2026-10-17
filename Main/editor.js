document.addEventListener("DOMContentLoaded", function() {
    const isAdmin = typeof andanAdminMode !== 'undefined' ? andanAdminMode : false;
    
    // Supabase 설정 (제공해주신 정보 연동)
    const SUPABASE_URL = 'https://hkwarwmmkzubqvwwyazp.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd2Fyd21ta3p1YnF2d3d5YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI0ODYsImV4cCI6MjEwNzgwODQ4Nn0.vInox6kk9Md6t2eayA05G8Lax2oP92SBl6HF_2XdJA8';
    
    // Supabase 클라이언트 생성 (CDN이 로드되어 있다고 가정)
    const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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

    // 페이지 로드 시 Supabase에서 레이아웃 불러오기 실행
    loadStoredBlocksFromSupabase();

    function hexToRgba(hex, alpha) {
        let c = hex.replace('#', '');
        if (c.length === 3) {
            c = c.split('').map(char => char + char).join('');
        }
        const num = parseInt(c, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

    function getImgState(el, key) {
        const p = key.toLowerCase();
        return {
            src: el.getAttribute('data-val-' + p) || '',
            scale: parseFloat(el.getAttribute('data-img-scale-' + p)) || 1,
            x: parseFloat(el.getAttribute('data-img-posx-' + p)) || 0,
            y: parseFloat(el.getAttribute('data-img-posy-' + p)) || 0
        };
    }

    function imgTransformCss(s) {
        return `translate(${s.x}%, ${s.y}%) scale(${s.scale})`;
    }

    function makeBlockImg(cls, alt, s) {
        const img = document.createElement('img');
        img.className = cls;
        img.alt = alt;
        img.draggable = false;
        if (s.src) img.src = s.src;
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

    if (isAdmin) {
        if (editTabA && editTabB) {
            editTabA.addEventListener('click', () => {
                currentEditingTarget = 'A';
                editTabA.style.background = '#c9a86a';
                editTabA.style.color = '#111';
                editTabB.style.background = '#1f1f2a';
                editTabB.style.color = '#ece5d3';
                loadModalData();
            });
            editTabB.addEventListener('click', () => {
                currentEditingTarget = 'B';
                editTabB.style.background = '#c9a86a';
                editTabB.style.color = '#111';
                editTabA.style.background = '#1f1f2a';
                editTabA.style.color = '#ece5d3';
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
            if (s.src) modalTargetImg.src = s.src; else modalTargetImg.removeAttribute('src');
            modalImgScale.value = s.scale;
            updateModalImageTransform(s.scale, imgOffsetX, imgOffsetY);
        }

        function updateModalImageTransform(scale, x, y) {
            modalTargetImg.style.transform = `translate(${x}%, ${y}%) scale(${scale})`;
        }

        if (closeImgModal) {
            closeImgModal.addEventListener('click', () => { imageEditModal.style.display = 'none'; });
        }

        if (modalImgScale) {
            modalImgScale.addEventListener('input', (e) => {
                const scale = parseFloat(e.target.value);
                updateModalImageTransform(scale, imgOffsetX, imgOffsetY);
                
                const prefix = currentEditingTarget.toLowerCase();
                editingImageElement.setAttribute(`data-img-scale-${prefix}`, scale);
                updateImageTransforms(editingImageElement);
                saveStateToSupabase(editingImageElement);
            });
        }

        cropPreviewContainer.addEventListener('mousedown', (e) => {
            isDraggingImg = true;
            startDragX = e.clientX;
            startDragY = e.clientY;
            startOffX = imgOffsetX;
            startOffY = imgOffsetY;
            cropPreviewContainer.style.cursor = 'grabbing';
            e.preventDefault();
        });

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
            saveStateToSupabase(editingImageElement);
        });

        window.addEventListener('mouseup', () => {
            if (isDraggingImg) {
                isDraggingImg = false;
                cropPreviewContainer.style.cursor = 'grab';
            }
        });

        if (applyImgModal) {
            applyImgModal.addEventListener('click', () => {
                imageEditModal.style.display = 'none';
            });
        }

        gallery.addEventListener('mousedown', function(e) {
            const el = e.target.closest('.editable-element');
            const parentRect = gallery.getBoundingClientRect();

            if (!el) {
                if (!e.shiftKey) clearSelection();
                return;
            }

            if (!selectedElements.has(el)) {
                if (!e.shiftKey) clearSelection();
                selectElement(el);
            }

            const rect = el.getBoundingClientRect();
            const isResizing = (e.clientX >= rect.right - 25 && e.clientY >= rect.bottom - 25);
            const startX = e.clientX;
            const startY = e.clientY;
            
            const initialPositions = new Map();
            selectedElements.forEach(item => {
                initialPositions.set(item, {
                    left: item.offsetLeft,
                    top: item.offsetTop,
                    width: item.offsetWidth,
                    height: item.offsetHeight
                });
            });

            const startLeft = el.offsetLeft;
            const startTop = el.offsetTop;
            const startWidth = el.offsetWidth;
            const startHeight = el.offsetHeight;
            const type = el.getAttribute('data-type');

            function onMouseMove(e) {
                if (isResizing) {
                    const w = startWidth + (e.clientX - startX);
                    const h = startHeight + (e.clientY - startY);
                    const minW = (type === 'calendar') ? 280 : 45;
                    const minH = (type === 'calendar') ? 250 : 30;
                    el.style.width = Math.max(minW, w) + 'px';
                    el.style.height = Math.max(minH, h) + 'px';
                } else {
                    let deltaX = e.clientX - startX;
                    let deltaY = e.clientY - startY;
                    let currentX = startLeft + deltaX;
                    let currentY = startTop + deltaY;

                    selectedElements.forEach(item => {
                        const init = initialPositions.get(item);
                        if (item === el) {
                            item.style.left = currentX + 'px';
                            item.style.top = currentY + 'px';
                        } else {
                            item.style.left = (init.left + (currentX - startLeft)) + 'px';
                            item.style.top = (init.top + (currentY - startTop)) + 'px';
                        }
                    });
                }
            }

            function onMouseUp() {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                selectedElements.forEach(item => saveStateToSupabase(item));
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.stopPropagation();
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                alert('Supabase와 실시간 연동되어 있어 변경사항이 즉시 저장됩니다!');
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async function() {
                if (confirm('모든 레이아웃 설정을 초기화하시겠습니까?')) {
                    if (supabaseClient) {
                        await supabaseClient.from('layouts').delete().neq('id', '0');
                    }
                    location.reload();
                }
            });
        }
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
    }

    function clearSelection() {
        selectedElements.forEach(el => {
            el.classList.remove('active-target', 'multi-selected');
        });
        selectedElements.clear();
        activeElement = null;
    }

    // ★ Supabase에 상태 저장하는 핵심 함수
    async function saveStateToSupabase(el) {
        if (!isAdmin || !supabaseClient) return;
        const id = el.getAttribute('data-id');
        if (!id) return;

        const data = {
            id: id,
            type: el.getAttribute('data-type') || 'default',
            left: el.style.left,
            top: el.style.top,
            width: el.style.width,
            height: el.style.height,
            content: el.innerHTML,
            border: el.style.border,
            backgroundColor: el.style.backgroundColor,
            borderRadius: el.style.borderRadius,
            fontFamily: el.style.fontFamily,
            color: el.style.color,
            linkUrl: el.getAttribute('data-link-url') || '',
            layout_data: JSON.stringify({
                rotate: el.getAttribute('data-rotate') || 0,
                shape: 'shape-rect',
                srcTypeA: el.getAttribute('data-srctype-a') || 'url',
                valA: el.getAttribute('data-val-a') || '',
                srcTypeB: el.getAttribute('data-srctype-b') || 'url',
                valB: el.getAttribute('data-val-b') || '',
                mainImg: el.getAttribute('data-main-img') || 'A'
            })
        };

        // Supabase layouts 테이블에 업서트(Upsert)
        await supabaseClient.from('layouts').upsert([data]);
    }

    // ★ Supabase에서 데이터 불러오는 핵심 함수
    async function loadStoredBlocksFromSupabase() {
        if (!supabaseClient) return;
        
        const { data, error } = await supabaseClient.from('layouts').select('*');
        if (error || !data) {
            console.error('데이터 로드 실패:', error);
            return;
        }

        data.forEach(item => {
            if (document.querySelector(`[data-id="${item.id}"]`)) return;
            
            let extra = {};
            try {
                if (item.layout_data) extra = JSON.parse(item.layout_data);
            } catch(e) {}

            createBlock({
                id: item.id,
                type: item.type || 'default',
                left: item.left,
                top: item.top,
                width: item.width,
                height: item.height,
                htmlContent: item.content,
                borderStyle: item.border,
                bgCol: item.backgroundColor,
                bRadius: item.borderRadius,
                fFamily: item.fontFamily,
                fColor: item.color,
                linkUrl: item.linkUrl,
                rotateDeg: extra.rotate || 0,
                srcTypeA: extra.srcTypeA || 'url',
                valA: extra.valA || '',
                srcTypeB: extra.valB || 'url',
                valB: extra.valB || '',
                mainImg: extra.mainImg || 'A'
            });
        });
    }

    function createBlock(config) {
        if (!config || !config.id) return;
        const newEl = document.createElement('div');
        newEl.className = 'mh-blk mh-bx-cut editable-element shape-rect';
        newEl.setAttribute('data-id', config.id);
        newEl.setAttribute('data-type', config.type || 'default');
        
        newEl.style.left = config.left || '100px';
        newEl.style.top = config.top || '100px';
        newEl.style.width = config.width || '150px';
        newEl.style.height = config.height || '150px';
        newEl.style.border = config.borderStyle || 'none';
        newEl.style.backgroundColor = config.bgCol || 'transparent';
        newEl.style.borderRadius = config.bRadius || '0px';
        newEl.style.color = config.fColor || '#ece5d3';

        if (config.type === 'image') {
            newEl.setAttribute('data-val-a', config.valA || '');
            newEl.setAttribute('data-val-b', config.valB || '');
            newEl.setAttribute('data-main-img', config.mainImg || 'A');
            renderImageBlock(newEl);
        } else {
            newEl.innerHTML = config.htmlContent || '';
        }

        gallery.appendChild(newEl);
    }
});