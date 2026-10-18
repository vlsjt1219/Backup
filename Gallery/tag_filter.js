// 태그 필터링 및 정렬 처리
async function setupTagFilter(posts) {
  const container = document.getElementById('uph_tag_filter_container');
  if (!container) return;

  // 1. Supabase에서 저장된 태그 순서 불러오기[cite: 3, 9]
  const { data: tagOrderData } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'tag_order')
    .single();

  const savedOrder = tagOrderData?.value || [];

  // 2. 전체 태그 수집[cite: 3]
  let allTags = [];
  posts.forEach(post => {
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach(t => {
        if (!allTags.includes(t)) allTags.push(t);
      });
    }
  });

  if (allTags.length === 0) {
    container.style.display = 'none';
    return;
  }

  // 저장된 순서 반영[cite: 3]
  allTags.sort((a, b) => {
    const ia = savedOrder.indexOf(a);
    const ib = savedOrder.indexOf(b);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  // 3. 필터 버튼 생성[cite: 3]
  let html = `<button type="button" class="uph-tag-btn active" data-tag="all">#전체태그</button>`;
  allTags.forEach(tag => {
    html += `<button type="button" class="uph-tag-btn" data-tag="${tag}">#${tag}</button>`;
  });
  container.innerHTML = html;
  container.style.display = 'flex';

  // 4. 태그 클릭 이벤트 (다중 선택/AND 조건 필터링)[cite: 3]
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.uph-tag-btn');
    if (!btn) return;

    const allBtn = container.querySelector('[data-tag="all"]');
    const selectedTag = btn.getAttribute('data-tag');

    if (selectedTag === 'all') {
      container.querySelectorAll('.uph-tag-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    } else {
      allBtn.classList.remove('active');
      btn.classList.toggle('active');
      
      const activeBtns = container.querySelectorAll('.uph-tag-btn.active:not([data-tag="all"])');
      if (activeBtns.length === 0) allBtn.classList.add('active');
    }

    // 필터링 적용[cite: 3]
    applyFilter(container);
  });
}

function applyFilter(container) {
  const activeTags = Array.from(container.querySelectorAll('.uph-tag-btn.active:not([data-tag="all"])'))
    .map(b => b.getAttribute('data-tag').toLowerCase());

  document.querySelectorAll('#log_list .gallery-item').forEach(item => {
    const itemTags = (item.getAttribute('data-tags') || '').toLowerCase().split(',');
    const isVisible = activeTags.every(tag => itemTags.includes(tag));
    item.classList.toggle('uph-hide', !isVisible);
  });
}

// 5. 관리자용 태그 순서 변경 결과를 Supabase에 저장[cite: 9]
async function saveTagOrder(newOrder) {
  const { error } = await supabase
    .from('settings')
    .upsert({ key: 'tag_order', value: newOrder });

  if (error) {
    alert('태그 순서 저장 중 오류가 발생했습니다: ' + error.message);
  }
}