// Supabase 대시보드 API 키 입력
const SUPABASE_URL = 'https://hkwarwmmkzubqvwwyazp.supabase.co/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhrd2Fyd21ta3p1YnF2d3d5YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzI0ODYsImV4cCI6MjEwNzgwODQ4Nn0.vInox6kk9Md6t2eayA05G8Lax2oP92SBl6HF_2XdJA8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.addEventListener('DOMContentLoaded', async () => {
  await loadLayouts();
});

// Supabase 'layouts' 테이블에서 데이터 가져오기
async function loadLayouts() {
  const { data: layouts, error } = await supabaseClient
    .from('layouts')
    .select('*')
    .order('id', { ascending: false });

  if (error) {
    console.error('Data fetch error:', error);
    return;
  }

  const galleryList = document.getElementById('log_list');
  galleryList.innerHTML = '';

  if (!layouts || layouts.length === 0) {
    galleryList.innerHTML = '<div style="text-align:center; padding: 50px; color:#aaa;">등록된 데이터가 없습니다.</div>';
    return;
  }

  layouts.forEach(item => {
    let images = [];
    if (item.layout_data && item.layout_data.images) {
      images = item.layout_data.images;
    } else if (item.linkUrl) {
      images = [item.linkUrl];
    }

    const cardHtml = `
      <div class="gallery-item" data-id="${item.id}">
        <div class="thumb-container">
          ${images.length > 0 
            ? `<img src="${images[0]}" alt="img" loading="lazy">` 
            : `<div class="text-thumb-box">${item.content || 'NO IMAGE'}</div>`}
          <div class="item-overlay">
            <span class="ov-title">${item.page_name || '제목 없음'}</span>
          </div>
        </div>
      </div>
    `;

    galleryList.insertAdjacentHTML('beforeend', cardHtml);
  });
}