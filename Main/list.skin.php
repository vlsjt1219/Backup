<?php
if (!defined('_GNUBOARD_')) exit; // 개별 페이지 직접 접근 방지

// 최고관리자 여부 확인
$isAdminMode = false;
if (isset($is_admin) && $is_admin === 'super') {
    $isAdminMode = true;
} else if (isset($member['mb_id']) && isset($config['cf_admin']) && $member['mb_id'] === $config['cf_admin']) {
    $isAdminMode = true;
}

// 서버 세션을 통해 관리자가 저장한 레이아웃 데이터를 모든 사용자에게 공유
$layoutDataFile = G5_DATA_PATH.'/maker_layout_cache.json';

// 관리자가 저장 요청을 보낸 경우 (POST 전송)
if ($isAdminMode && isset($_POST['save_layout_data']) && $_POST['save_layout_data'] === '1') {
    $raw_data = isset($_POST['layout_json']) ? stripslashes($_POST['layout_json']) : '';
    if (!empty($raw_data)) {
        @file_put_contents($layoutDataFile, $raw_data);
        echo "<script>alert('레이아웃이 성공적으로 저장되어 모든 방문자에게 반영되었습니다!'); location.replace('./board.php?bo_table=".$bo_table."');</script>";
        exit;
    }
}

// 저장된 캐시 데이터 불러오기
$sharedLayoutJson = '';
if (file_exists($layoutDataFile)) {
    $sharedLayoutJson = @file_get_contents($layoutDataFile);
}

// 분리한 CSS 파일 로드
add_stylesheet('<link rel="stylesheet" href="'.$board_skin_url.'/editor.css">', 0);
?>

<!-- Supabase SDK 불러오기 -->
<script src="https://cdn.jsdelivr.5net/npm/@supabase/supabase-js@2"></script>
<!-- (만약 위 주소가 오타로 안되면 아래 공식 최신 CDN 사용) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- 마피아제작소 지원 폰트 웹폰트 로드 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=Bebas+Neue&family=Zen+Antique&family=Noto+Serif+SC:wght@400;700&display=swap" rel="stylesheet">
<link href="https://hangeul.pstatic.net/hangeul_font/css/chosun-ilbo.css" rel="stylesheet">
<link href="https://hangeul.pstatic.net/hangeul_font/css/chosun-sm.css" rel="stylesheet">

<!-- 네비게이션 메뉴바 -->
<div class="mh-nav-bar" style="display:flex; justify-content:center; gap:15px; padding:10px 0; border-bottom:1px solid rgba(201,168,106,0.2); background:rgba(0,0,0,0.2);">
    <a href="./board.php?bo_table=gallery" style="color:#ece5d3; text-decoration:none; font-weight:bold; font-size:0.9em;">🖼️ 그림 갤러리</a>
    <a href="./board.php?bo_table=notice" style="color:#ece5d3; text-decoration:none; font-size:0.9em;">📢 공지사항</a>
    <a href="./board.php?bo_table=guestbook" style="color:#ece5d3; text-decoration:none; font-size:0.9em;">✍️ 방명록</a>
    <!-- 필요한 만큼 메뉴를 계속 추가하실 수 있습니다 -->
</div>

<div id="mh-gpfto" class="mh">
  <div class="mh-bg"></div>
  <div class="mh-fx"></div>
  <div class="mh-in">
    <div class="mh-win">
      <div class="mh-bar">
        <span class="mh-ttl">MAFIAZ</span>
        <span class="mh-btns" aria-hidden="true"><i></i><i></i><i></i></span>
      </div>
      
      <!-- 중앙선 및 요소 간 스냅 가이드라인 (관리자일 때만 노출) -->
      <?php if ($isAdminMode) { ?>
      <div id="centerSnapLineV" style="position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #ff4757; z-index: 99999; display: none; pointer-events: none;"></div>
      <div id="centerSnapLineH" style="position: absolute; top: 50%; left: 0; right: 0; height: 1px; background: #ff4757; z-index: 99999; display: none; pointer-events: none;"></div>
      <div id="elemSnapLineV" style="position: absolute; top: 0; bottom: 0; width: 1px; background: #2ed573; z-index: 99999; display: none; pointer-events: none;"></div>
      <div id="elemSnapLineH" style="position: absolute; left: 0; right: 0; height: 1px; background: #2ed573; z-index: 99999; display: none; pointer-events: none;"></div>
      <!-- 다중 선택 영역 박스 -->
      <div id="selectionMarquee" style="position: absolute; border: 1px dashed #c9a86a; background: rgba(201,168,106,0.15); z-index: 99998; display: none; pointer-events: none;"></div>
      <?php } ?>

      <!-- 본문 자유 배치 영역 -->
      <div class="mh-body mh-free" id="draggableGallery" style="position: relative; width: 100%; height: 100%;">
      </div>
    </div>
  </div>
</div>

<!-- 이미지 상세 편집 모달 창 (이미지를 자유롭게 드래그하고 확대/축소하는 구조) -->
<div id="imageEditModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999999; justify-content:center; align-items:center; font-family:'Nanum Myeongjo',serif;">
  <div style="background:#14101e; border:1px solid #c9a86a; padding:20px; border-radius:8px; width:440px; color:#ece5d3; box-shadow:0 15px 35px rgba(0,0,0,0.7); display:flex; flex-direction:column; align-items:center;">
    <div style="width:100%; font-weight:bold; color:#c9a86a; margin-bottom:12px; font-size:1.05em; border-bottom:1px solid rgba(201,168,106,0.3); padding-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
      <span>🖼️ 이미지 구도 및 자르기 편집</span>
      <button type="button" id="closeImgModal" style="background:none; border:none; color:#ff4757; font-weight:bold; cursor:pointer; font-size:1.1em;">✕</button>
    </div>

    <!-- 편집 대상 선택 탭 -->
    <div style="display:flex; gap:6px; width:100%; margin-bottom:12px;">
      <button type="button" id="editTabA" style="flex:1; background:#c9a86a; color:#111; border:none; padding:6px; font-weight:bold; border-radius:4px; cursor:pointer; font-size:0.85em;">이미지 A 편집</button>
      <button type="button" id="editTabB" style="flex:1; background:#1f1f2a; color:#ece5d3; border:1px solid #c9a86a; padding:6px; font-weight:bold; border-radius:4px; cursor:pointer; font-size:0.85em;">이미지 B 편집</button>
    </div>

    <!-- ★ 자르기 프레임 뷰포트 (이 안에서 이미지가 드래그되며 메인 블록의 도형/비율을 그대로 가짐) -->
    <div id="cropPreviewContainer" style="position:relative; width:100%; height:260px; background:rgba(0,0,0,0.9); border:2px solid #c9a86a; border-radius:4px; overflow:hidden; display:flex; justify-content:center; align-items:center; margin-bottom:15px; cursor:grab; user-select:none;">
      <div id="cropInnerBox" style="position:relative; width:100%; height:100%; overflow:hidden; display:flex; justify-content:center; align-items:center;">
        <!-- 드래그 및 줌이 직접 적용되는 이미지 태그 -->
        <img id="modalTargetImg" src="" alt="편집 이미지" style="position:absolute; width:100%; height:100%; object-fit:cover; transform-origin:center center; pointer-events:none; cursor:grab;">
      </div>
      <!-- 어두운 오버레이 가이드 및 격자 -->
      <div style="position:absolute; top:0; left:0; right:0; bottom:0; pointer-events:none; display:grid; grid-template-columns:repeat(3, 1fr); grid-template-rows:repeat(3, 1fr); border:1px solid rgba(255,255,255,0.2);">
        <div style="border-right:1px solid rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-right:1px solid rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-bottom:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-right:1px solid rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-right:1px solid rgba(255,255,255,0.1); border-bottom:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-bottom:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-right:1px solid rgba(255,255,255,0.1);"></div>
        <div style="border-right:1px solid rgba(255,255,255,0.1);"></div>
        <div></div>
      </div>
    </div>
    <div style="font-size:0.75em; color:#9d947e; margin-bottom:12px; text-align:center;">💡 이미지를 마우스로 클릭한 채 끌어서 위치를 맞추세요.</div>

    <!-- 확대/축소 슬라이더 -->
    <div style="width:100%; margin-bottom:15px;">
      <label style="font-size:0.85em; color:#9d947e; display:block; margin-bottom:4px;">확대/축소 (Zoom)</label>
      <input type="range" id="modalImgScale" min="0.8" max="6" step="0.1" value="1" style="width:100%; accent-color:#c9a86a;">
    </div>

    <div style="display:flex; justify-content:flex-end; gap:6px; width:100%;">
      <button type="button" id="applyImgModal" style="background:#2ed573; border:none; color:#111; font-weight:bold; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:0.9em;">적용 완료</button>
    </div>
  </div>
</div>

<!-- 우측 상단 제어 패널 (최고관리자 로그인 시에만 출력) -->
<?php if ($isAdminMode) { ?>
<form id="layoutSaveForm" method="post" style="display:none;">
    <input type="hidden" name="save_layout_data" value="1">
    <input type="hidden" name="layout_json" id="layoutJsonInput">
</form>

<div id="layoutControlPanel" style="position: fixed; top: 20px; right: 20px; background: rgba(20,16,30,0.95); color: #ece5d3; padding: 15px; border-radius: 8px; border: 1px solid #c9a86a; z-index: 100000; font-family: 'Nanum Myeongjo', serif; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 300px; max-height: 85vh; overflow-y: auto; box-sizing: border-box;">
  <div style="font-weight: bold; margin-bottom: 10px; font-size: 0.95em; border-bottom: 1px solid rgba(201,168,106,0.3); padding-bottom: 5px; display: flex; justify-content: space-between; align-items: center; color: #c9a86a;">
    <span>🛠️ 레이아웃 관리자 패널</span>
    <div style="display:flex; gap:4px;">
      <button type="button" id="saveLayoutBtn" style="background: #2ed573; border: none; color: #111; font-size: 0.75em; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">저장</button>
      <button type="button" id="resetLayoutBtn" style="background: #ff4757; border: none; color: #fff; font-size: 0.75em; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-weight: bold;">초기화</button>
    </div>
  </div>
  
  <!-- 스냅 토글 -->
  <div style="margin-bottom: 10px; font-size: 0.85em; display: flex; align-items: center; justify-content: space-between; background: rgba(201,168,106,0.08); padding: 6px 10px; border-radius: 4px; border: 1px solid rgba(201,168,106,0.2);">
    <span>중앙선 및 요소 스냅</span>
    <input type="checkbox" id="snapToggle" checked style="cursor: pointer; accent-color: #c9a86a;">
  </div>

  <!-- 블록 추가 버튼 영역 -->
  <div style="margin-bottom: 12px; display: flex; gap: 4px;">
    <button type="button" id="addTextBtn" style="flex:1; background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 글</button>
    <button type="button" id="addCalendarBtn" style="flex:1; background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 달력</button>
    <button type="button" id="addImageBtn" style="flex:1; background: #1f1f2a; border: 1px solid #c9a86a; color: #ece5d3; font-size: 0.78em; padding: 6px 2px; border-radius: 4px; cursor: pointer;">+ 이미지</button>
  </div>

  <div id="panelContent" style="font-size: 0.85em; color: #9d947e;">
    <p style="margin: 0;">요소를 클릭하거나 빈 곳을 드래그하여 다중 선택해보세요.</p>
  </div>
</div>
<?php } ?>

<!-- PHP 데이터를 JS 전역 변수로 전달 -->
<script>
    const andanAdminMode = <?php echo $isAdminMode ? 'true' : 'false'; ?>;
    const andanServerSharedData = <?php echo !empty($sharedLayoutJson) ? $sharedLayoutJson : 'null'; ?>;
</script>
<!-- 분리한 자바스크립트 파일 로드 -->
<script src="<?php echo $board_skin_url; ?>/editor.js"></script>