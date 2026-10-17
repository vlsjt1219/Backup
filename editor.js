document.addEventListener("DOMContentLoaded", function() {
    const isAdmin = typeof andanAdminMode !== 'undefined' ? andanAdminMode : true;
    
    // Supabase 설정
    const SUPABASE_URL = 'https://hkwarwmmkzubqvwwyazp.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd2Fyd21ta3p1YnF2d3d5YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI0ODYsImV4cCI6MjEwNzgwODQ4Nn0.vInox6kk9Md6t2eayA05G8Lax2oP92SBl6HF_2XdJA8';
    
    const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

    const gallery = document.getElementById('draggableGallery');
    const panelContent = document.getElementById('panelContent');
    const resetBtn = document.getElementById('resetLayoutBtn');
    const saveBtn = document.getElementById('saveLayoutBtn');
    const addTextBtn = document.getElementById('addTextBtn');
    const addCalendarBtn = document.getElementById('addCalendarBtn');
    const addImageBtn = document.getElementById('addImageBtn');
    
    let activeElement = null;
    let selectedElements = new Set();

    // 페이지 로드 시 Supabase에서 레이아웃 불러오기
    loadStoredBlocksFromSupabase();

    if (isAdmin) {
        // + 글 블록 추가
        if (addTextBtn) {
            addTextBtn.addEventListener('click', () => {
                const id = 'text_' + Date.now();
                createBlock({
                    id: id,
                    type: 'text',
                    left: '50px',
                    top: '50px',
                    width: '150px',
                    height: '50px',
                    htmlContent: '새 글 내용',
                    bgCol: 'transparent',
                    fColor: '#ece5d3'
                });
                saveStateToSupabase(gallery.querySelector(`[data-id="${id}"]`));
            });
        }

        // + 달력 블록 추가
        if (addCalendarBtn) {
            addCalendarBtn.addEventListener('click', () => {
                const id = 'calendar_' + Date.now();
                createBlock({
                    id: id,
                    type: 'calendar',
                    left: '80px',
                    top: '80px',
                    width: '280px',
                    height: '250px',
                    htmlContent: '<div style="padding:10px; color:#ece5d3;">📅 달력 위젯</div>',
                    bgCol: 'rgba(20,16,30,0.8)',
                    fColor: '#ece5d3'
                });
                saveStateToSupabase(gallery.querySelector(`[data-id="${id}"]`));
            });
        }

        // + 이미지 블록 추가
        if (addImageBtn) {
            addImageBtn.addEventListener('click', () => {
                const id = 'image_' + Date.now();
                createBlock({
                    id: id,
                    type: 'image',
                    left: '110px',
                    top: '110px',
                    width: '180px',
                    height: '220px',
                    valA: 'https://via.placeholder.com/180x220',
                    mainImg: 'A'
                });
                saveStateToSupabase(gallery.querySelector(`[data-id="${id}"]`));
            });
        }

        // 드래그 및 크기 조절, 패널 바인딩
        gallery.addEventListener('mousedown', function(e) {
            const el = e.target.closest('.editable-element');
            if (!el) {
                if (!e.shiftKey) clearSelection();
                return;
            }

            if (!selectedElements.has(el)) {
                if (!e.shiftKey) clearSelection();
                selectElement(el);
            }

            const rect = el.getBoundingClientRect();
            const isResizing = (e.clientX >= rect.right - 20 && e.clientY >= rect.bottom - 20);
            const startX = e.clientX;
            const startY = e.clientY;
            
            const startLeft = el.offsetLeft;
            const startTop = el.offsetTop;
            const startWidth = el.offsetWidth;
            const startHeight = el.offsetHeight;

            function onMouseMove(e) {
                if (isResizing) {
                    const w = startWidth + (e.clientX - startX);
                    const h = startHeight + (e.clientY - startY);
                    el.style.width = Math.max(40, w) + 'px';
                    el.style.height = Math.max(30, h) + 'px';
                    updatePanelInputs();
                } else {
                    let deltaX = e.clientX - startX;
                    let deltaY = e.clientY - startY;
                    el.style.left = (startLeft + deltaX) + 'px';
                    el.style.top = (startTop + deltaY) + 'px';
                    updatePanelInputs();
                }
            }

            function onMouseUp() {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                saveStateToSupabase(el);
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
            e.stopPropagation();
        });

        if (saveBtn) {
            saveBtn.addEventListener('click', function() {
                alert('Supabase DB에 레이아웃이 성공적으로 저장되었습니다!');
            });
        }

        if (resetBtn) {
            resetBtn.addEventListener('click', async function() {
                if (confirm('모든 레이아웃을 초기화하시겠습니까?')) {
                    if (supabaseClient) {
                        await supabaseClient.from('layouts').delete().neq('id', '0');
                    }
                    location.reload();
                }
            });
        }
    }

    function selectElement(el) {
        clearSelection();
        selectedElements.add(el);
        el.classList.add('active-target');
        activeElement = el;
        buildInspectorPanel(el);
    }

    function clearSelection() {
        selectedElements.forEach(el => el.classList.remove('active-target'));
        selectedElements.clear();
        activeElement = null;
        if (panelContent) {
            panelContent.innerHTML = '<p style="margin: 0;">요소를 클릭하거나 빈 곳을 드래그하여 선택해보세요.</p>';
        }
    }

    // 우측 패널에 선택된 요소의 상세 속성 제어기 생성
    function buildInspectorPanel(el) {
        if (!panelContent) return;
        panelContent.innerHTML = `
            <div style="margin-bottom:8px; font-weight:bold; color:#c9a86a;">선택: ${el.getAttribute('data-id')}</div>
            <div style="margin-bottom:6px;">
                <label style="font-size:0.8em; display:block;">가로 크기</label>
                <input type="text" id="panelW" value="${el.style.width}" style="width:100%; background:#111; color:#fff; border:1px solid #c9a86a; padding:3px; border-radius:3px;">
            </div>
            <div style="margin-bottom:6px;">
                <label style="font-size:0.8em; display:block;">세로 크기</label>
                <input type="text" id="panelH" value="${el.style.height}" style="width:100%; background:#111; color:#fff; border:1px solid #c9a86a; padding:3px; border-radius:3px;">
            </div>
            <div style="margin-bottom:6px;">
                <label style="font-size:0.8em; display:block;">배경색</label>
                <input type="color" id="panelBg" value="#1f1f2a" style="width:100%; height:28px; background:none; border:1px solid #c9a86a; cursor:pointer;">
            </div>
            <div style="margin-top:10px; display:flex; gap:5px;">
                <button type="button" id="panelDel" style="flex:1; background:#ff4757; color:#fff; border:none; padding:4px; border-radius:3px; cursor:pointer; font-weight:bold;">삭제</button>
            </div>
        `;

        document.getElementById('panelW').addEventListener('input', (e) => {
            el.style.width = e.target.value;
            saveStateToSupabase(el);
        });
        document.getElementById('panelH').addEventListener('input', (e) => {
            el.style.height = e.target.value;
            saveStateToSupabase(el);
        });
        document.getElementById('panelBg').addEventListener('input', (e) => {
            el.style.backgroundColor = e.target.value;
            saveStateToSupabase(el);
        });
        document.getElementById('panelDel').addEventListener('click', async () => {
            if (confirm('이 요소를 삭제하시겠습니까?')) {
                const id = el.getAttribute('data-id');
                el.remove();
                clearSelection();
                if (supabaseClient) {
                    await supabaseClient.from('layouts').delete().eq('id', id);
                }
            }
        });
    }

    function updatePanelInputs() {
        if (!activeElement) return;
        const pw = document.getElementById('panelW');
        const ph = document.getElementById('panelH');
        if (pw) pw.value = activeElement.style.width;
        if (ph) ph.value = activeElement.style.height;
    }

    async function saveStateToSupabase(el) {
        if (!supabaseClient || !el) return;
        const id = el.getAttribute('data-id');
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
            color: el.style.color,
            layout_data: JSON.stringify({})
        };
        await supabaseClient.from('layouts').upsert([data]);
    }

    async function loadStoredBlocksFromSupabase() {
        if (!supabaseClient) return;
        const { data, error } = await supabaseClient.from('layouts').select('*');
        if (error || !data) return;

        data.forEach(item => {
            if (document.querySelector(`[data-id="${item.id}"]`)) return;
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
                fColor: item.color
            });
        });
    }

    function createBlock(config) {
        if (!config || !config.id) return;
        const newEl = document.createElement('div');
        newEl.className = 'editable-element';
        newEl.setAttribute('data-id', config.id);
        newEl.setAttribute('data-type', config.type || 'default');
        
        newEl.style.position = 'absolute';
        newEl.style.left = config.left || '50px';
        newEl.style.top = config.top || '50px';
        newEl.style.width = config.width || '150px';
        newEl.style.height = config.height || '150px';
        newEl.style.border = config.borderStyle || '1px solid rgba(201,168,106,0.4)';
        newEl.style.backgroundColor = config.bgCol || 'transparent';
        newEl.style.borderRadius = config.bRadius || '4px';
        newEl.style.color = config.fColor || '#ece5d3';
        newEl.style.cursor = 'move';
        newEl.style.boxSizing = 'border-box';
        newEl.style.overflow = 'hidden';

        if (config.htmlContent) {
            newEl.innerHTML = config.htmlContent;
        }

        gallery.appendChild(newEl);
    }
});
