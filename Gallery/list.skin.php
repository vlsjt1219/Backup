<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<?php
if (!defined('_GNUBOARD_')) exit;
include_once(G5_LIB_PATH.'/thumbnail.lib.php');
include_once($board_skin_path.'/webp.lib.php');   // WebP 썸네일 대체 생성용

/* =========================================================================
   [설정 연동] 게시판 관리 화면의 값을 그대로 사용합니다.
   ========================================================================= */

// --- 1) 게시판 폭 -------------------------------------------------------
$bo_width_raw = isset($board['bo_table_width']) ? trim((string)$board['bo_table_width']) : '';
if ($bo_width_raw === '' || (float)$bo_width_raw <= 0) {
    $board_width_css = '700px';
} else if ((float)$bo_width_raw > 100) {
    $board_width_css = (int)$bo_width_raw.'px';
} else {
    $board_width_css = rtrim(rtrim(sprintf('%.2f', (float)$bo_width_raw), '0'), '.').'%';
}

// --- 2) 썸네일 크기 -----------------------------------------------------
$thumb_w = (int)($board['bo_gallery_width']  ?? 0);
$thumb_h = (int)($board['bo_gallery_height'] ?? 0);
if (defined('G5_IS_MOBILE') && G5_IS_MOBILE) {
    $m_w = (int)($board['bo_mobile_gallery_width']  ?? 0);
    $m_h = (int)($board['bo_mobile_gallery_height'] ?? 0);
    if ($m_w > 0) $thumb_w = $m_w;
    if ($m_h > 0) $thumb_h = $m_h;
}
if ($thumb_w < 20)   $thumb_w = 350;
if ($thumb_h < 20)   $thumb_h = 450;
if ($thumb_w > 2000) $thumb_w = 2000;
if ($thumb_h > 2000) $thumb_h = 2000;

$gallery_size_set = ((int)($board['bo_gallery_width'] ?? 0) > 0 && (int)($board['bo_gallery_height'] ?? 0) > 0);
$thumb_ratio = $gallery_size_set ? round($thumb_h / max(1, $thumb_w) * 100, 2) : 160;
$gallery_mode_class = $gallery_size_set ? ' fixed-thumb' : '';

// --- 3) 한 줄 칸 수 -----------------------------------------------------
$gallery_cols = (int)($board['bo_gallery_cols'] ?? 0);
if ($gallery_cols < 1)  $gallery_cols = 5;
if ($gallery_cols > 12) $gallery_cols = 12;
$cols_tablet = min($gallery_cols, 3);
$cols_mobile = min($gallery_cols, 2);

// --- 4) 포인트 컬러 -------------------------------------------------
if (isset($color['color_point']) && $color['color_point']) {
    $point_color_hex = $color['color_point'];
} else if (isset($color_point) && $color_point) {
    $point_color_hex = $color_point;
} else {
    $point_color_hex = '#97c3d1';
}
if (!preg_match('/^#[0-9a-fA-F]{6}$/', $point_color_hex)) {
    $point_color_hex = '#97c3d1';
}

// --- 5) NO IMAGE 대체 이미지 ------------------------------------
if (file_exists($board_skin_path.'/img/no_image.png')) {
    $no_image_src = $board_skin_url.'/img/no_image.png';
} else {
    $no_image_src = 'data:image/svg+xml;charset=utf-8,'.rawurlencode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260">'
        .'<rect width="100%" height="100%" fill="#f4f4f4"/>'
        .'<text x="50%" y="50%" fill="#cccccc" font-family="sans-serif" font-size="15" '
        .'text-anchor="middle" dominant-baseline="middle">NO IMAGE</text></svg>');
}

$auto_open_id = isset($_GET['log_id']) ? (int)$_GET['log_id'] : 0;

// --- 태그 순서 저장값 읽기 ---------------------------------------------
$tag_order_file = G5_DATA_PATH.'/u_photo_tag_order_'.preg_replace('/[^a-zA-Z0-9_]/', '', $bo_table).'.json';
$saved_tag_order = array();
if (is_file($tag_order_file)) {
    $j = json_decode(file_get_contents($tag_order_file), true);
    if (is_array($j)) $saved_tag_order = $j;
}

// --- 태그 및 페이징 박스 디자인 커스텀 설정 연동 ---
$design_setting_file = G5_DATA_PATH.'/u_photo_design_setting_'.preg_replace('/[^a-zA-Z0-9_]/', '', $bo_table).'.json';
$design_config = array(
    'tag_border' => '1',
    'tag_border_style' => 'solid',
    'tag_border_width' => '1px',
    'tag_border_color' => '#ddd',
    'tag_bg' => 'rgba(255, 255, 255, 0.85)',
    'tag_color' => '#555',
    'tag_hover_bg' => $point_color_hex,
    'tag_hover_color' => '#fff',

    'paging_border' => '1',
    'paging_border_style' => 'solid',
    'paging_border_width' => '1px',
    'paging_border_color' => '#ddd',
    'paging_bg' => 'rgba(255, 255, 255, 0.85)',
    'paging_color' => '#555',
    'paging_hover_bg' => $point_color_hex,
    'paging_hover_color' => '#fff'
);
if (is_file($design_setting_file)) {
    $saved_design = json_decode(file_get_contents($design_setting_file), true);
    if (is_array($saved_design)) {
        $design_config = array_merge($design_config, $saved_design);
    }
}
if (!function_exists('uph_hex6')) {
    function uph_hex6($c, $fb) {
        $c = strtolower(trim((string)$c));
        if (preg_match('/^#([0-9a-f]{3})$/', $c, $m)) { $s = $m[1]; return '#'.$s[0].$s[0].$s[1].$s[1].$s[2].$s[2]; }
        if (preg_match('/^#[0-9a-f]{6}$/', $c)) return $c;
        return $fb;
    }
    // 'rgba(r,g,b,a)' 또는 '#hex' → array(hex, 투명도 0~100)
    function uph_split_rgba($c, $fb_hex, $fb_alpha) {
        $c = trim((string)$c);
        if (preg_match('/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9.]+)\s*)?\)$/i', $c, $m)) {
            $hex = sprintf('#%02x%02x%02x', min(255,$m[1]), min(255,$m[2]), min(255,$m[3]));
            $a = (isset($m[4]) && $m[4] !== '') ? (int)round(min(1, (float)$m[4]) * 100) : 100;
            return array($hex, $a);
        }
        $h = uph_hex6($c, '');
        return $h !== '' ? array($h, 100) : array($fb_hex, $fb_alpha);
    }
    function uph_row($label, $name, $hex) {
        return '<div class="uph-row"><span>'.$label.'</span><input type="color" name="'.$name.'" value="'.htmlspecialchars($hex).'"></div>';
    }
    function uph_row_alpha($label, $name, $hex, $alpha) {
        return '<div class="uph-row"><span>'.$label.'</span><span class="uph-grp">'
            .'<input type="range" name="'.$name.'_a" min="0" max="100" value="'.(int)$alpha.'" title="투명도">'
            .'<input type="color" name="'.$name.'_c" value="'.htmlspecialchars($hex).'"></span></div>';
    }
    function uph_row_border($label, $name, $checked, $hex) {
        return '<div class="uph-row"><span>'.$label.'</span><span class="uph-grp">'
            .'<label><input type="checkbox" name="'.$name.'" value="1"'.($checked ? ' checked' : '').'> 표시</label>'
            .'<input type="color" name="'.$name.'_color" value="'.htmlspecialchars($hex).'"></span></div>';
    }
}

// 스타일 및 스크립트 로드
add_stylesheet('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css" />', 0);
add_stylesheet('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css">', 0);
add_stylesheet('<link rel="stylesheet" href="'.$board_skin_url.'/style.css">', 0);

if ($is_admin) {
    add_stylesheet('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.13.2/themes/base/jquery-ui.min.css">', 0);
    add_javascript('<script src="https://cdnjs.cloudflare.com/ajax/libs/jqueryui/1.13.2/jquery-ui.min.js"></script>', 0);
}

$emoticon_setting_file = $board_skin_path.'/emoticon/_setting.emoticon.php';
if (file_exists($emoticon_setting_file)) { include_once($emoticon_setting_file); }
?>

<style>
:root {
    --point-color: <?php echo $point_color_hex ?>;
    --board-width: <?php echo $board_width_css ?>;
    --gallery-cols: <?php echo $gallery_cols ?>;
    --gallery-cols-tablet: <?php echo $cols_tablet ?>;
    --gallery-cols-mobile: <?php echo $cols_mobile ?>;
    --thumb-ratio: <?php echo $thumb_ratio ?>%;
    --thumb-w: <?php echo $thumb_w ?>px;
    --thumb-w-num: <?php echo $thumb_w ?>;
    --thumb-h-num: <?php echo $thumb_h ?>;

    /* 태그 및 페이징 동적 커스텀 변수 */
    --tag-border: <?php echo (!empty($design_config['tag_border']) ? $design_config['tag_border_width'].' '.$design_config['tag_border_style'].' '.$design_config['tag_border_color'] : 'none'); ?>;
    --tag-bg: <?php echo $design_config['tag_bg']; ?>;
    --tag-color: <?php echo $design_config['tag_color']; ?>;
    --tag-hover-bg: <?php echo $design_config['tag_hover_bg']; ?>;
    --tag-hover-color: <?php echo $design_config['tag_hover_color']; ?>;

    --paging-border: <?php echo (!empty($design_config['paging_border']) ? $design_config['paging_border_width'].' '.$design_config['paging_border_style'].' '.$design_config['paging_border_color'] : 'none'); ?>;
    --paging-bg: <?php echo $design_config['paging_bg']; ?>;
    --paging-color: <?php echo $design_config['paging_color']; ?>;
    --paging-hover-bg: <?php echo $design_config['paging_hover_bg']; ?>;
    --paging-hover-color: <?php echo $design_config['paging_hover_color']; ?>;
}

#navi_category a:hover, #navi_category li.on a { background: #fff; border-color: var(--point-color); color: var(--point-color); }
.ui-paging strong { background: transparent !important; box-shadow: none !important; color: var(--paging-hover-bg) !important; font-weight: bold; }
.cate-badge {
    background: transparent !important;
    color: #fff !important;
    text-shadow: 0 0 3px rgba(0,0,0,0.5);
    padding: 0 !important;
    font-size: 13px !important;
    font-weight: bold !important;
    box-shadow: none !important;
}
.swiper-button-next, .swiper-button-prev { color: var(--point-color) !important; }
.swiper-pagination-bullet-active { background: var(--point-color) !important; }

.post-nav-btn {
    position: fixed; top: 50%; transform: translateY(-50%);
    width: 50px; height: 80px; background: transparent; border: none;
    color: rgba(255, 255, 255, 0.4); font-size: 40px; cursor: pointer;
    z-index: 9100; display: flex; justify-content: center; align-items: center;
    transition: all 0.3s ease;
}
.post-nav-btn:hover { color: var(--point-color); text-shadow: 0 0 10px var(--point-color); transform: translateY(-50%) scale(1.1); }
.post-nav-prev { left: calc(50% - 320px); justify-content: flex-end; }
.post-nav-next { right: calc(50% - 320px); justify-content: flex-start; }

/* 태그 필터 버튼 영역 스타일 (커스텀 연동) */
.uph-tag-filter-wrap {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin: 10px 0 20px 0;
}
.uph-tag-btn {
    background: var(--tag-bg);
    border: var(--tag-border);
    color: var(--tag-color);
    padding: 4px 12px;
    border-radius: 15px;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.2s;
    backdrop-filter: blur(4px);
}
.uph-tag-btn:hover, .uph-tag-btn.active {
    background: var(--tag-hover-bg);
    color: var(--tag-hover-color);
    border-color: var(--tag-hover-bg);
}

<?php if ($is_admin) { ?>
.gallery-item { cursor: grab; }
.gallery-item:active { cursor: grabbing; }
.uph-tag-btn { cursor: grab; }
.uph-tag-btn:active { cursor: grabbing; }

.gallery-wrapper .ui-sortable-placeholder {
    visibility: visible !important;
    background: rgba(151, 195, 209, 0.2);
    border: 2px dashed var(--point-color);
    border-radius: 12px;
    box-shadow: inset 0 0 10px rgba(0,0,0,0.1);
}
.uph-tag-filter-wrap .ui-sortable-placeholder {
    visibility: visible !important;
    background: rgba(151, 195, 209, 0.2);
    border: 1px dashed var(--point-color);
    width: 50px;
    display: inline-block;
}
.ui-sortable-helper {
    opacity: 0.9;
    box-shadow: 0 15px 30px rgba(0,0,0,0.4);
    z-index: 9999;
}
.admin-drag-notice {
    text-align: center; color: #fff; font-size: 12px; margin-bottom: 10px;
    background: rgba(0,0,0,0.4); padding: 5px; border-radius: 4px; backdrop-filter: blur(4px);
}
<?php } ?>

@media all and (max-width: 1024px) {
    .post-nav-prev { left: 10px; }
    .post-nav-next { right: 10px; }
    .post-nav-btn { font-size: 30px; width: 40px; background: rgba(0,0,0,0.1); border-radius: 5px; }
}
</style>

<div id="modal-fixed-bg" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:8999; backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);"></div>

<div id="load_log_board">
    <?php if ($board['bo_content_head']) { ?>
        <div id="bo_content_head" style="margin-bottom:20px; padding:0; overflow:visible;">
            <?php echo $board['bo_content_head']; ?>
        </div>
    <?php } ?>

    <div class="ui-mmb-button">
        <?php if ($is_category) { ?><nav id="navi_category"><ul><?php echo $category_option ?></ul></nav><?php } ?>

        <!-- 분류 메뉴 바로 아래 태그 필터 버튼 영역 -->
        <div id="uph_tag_filter_container" class="uph-tag-filter-wrap" style="display:none;"></div>

        <?php if ($write_pages) { ?>
            <div class="paging-box-wrap">
                <div class="ui-paging"><?php echo $write_pages; ?></div>
            </div>
        <?php } ?>
    </div>

    <?php if ($is_admin) { ?>
        <div class="admin-drag-notice"><i class="fa fa-info-circle"></i> 최고관리자 모드: 카드와 태그 버튼을 마우스로 드래그하여 위치를 변경할 수 있습니다.</div>
    <?php } ?>

    <div id="log_list" class="gallery-wrapper<?php echo $gallery_mode_class ?>">
    <?php
    $modal_html = '';
    $list_count = count($list);

    // 썸네일 주소 캐시 (매번 파일 확인·생성 시도를 하지 않도록 저장해 재사용)
    $safe_bo = preg_replace('/[^a-zA-Z0-9_]/', '', $bo_table);
    $thumb_cache_file = G5_DATA_PATH.'/u_photo_thumbcache_'.$safe_bo.'.json';
    $thumb_cache = array();
    if (is_file($thumb_cache_file)) {
        $tc = json_decode(file_get_contents($thumb_cache_file), true);
        if (is_array($tc)) $thumb_cache = $tc;
    }
    $thumb_cache_dirty = false;

    for ($i=0; $i<$list_count; $i++) {
        $list_item = $list[$i];
        $wr_id = $list_item['wr_id'];
        $prev_wr_id = isset($list[$i-1]) ? $list[$i-1]['wr_id'] : '';
        $next_wr_id = isset($list[$i+1]) ? $list[$i+1]['wr_id'] : '';
        $item_type  = $list_item['wr_type'] ?? '';

        $thumb_content = "";

        $tkey = $wr_id.'_'.$thumb_w.'x'.$thumb_h.'_'.substr(md5(($list_item['wr_last'] ?? '').($list_item['wr_datetime'] ?? '')), 0, 8);
        $thumb = array('src' => '');
        if (!empty($thumb_cache[$tkey])) {
            $cached_path = str_replace(G5_DATA_URL, G5_DATA_PATH, $thumb_cache[$tkey]);
            if (is_file($cached_path)) $thumb['src'] = $thumb_cache[$tkey];
        }
        if (empty($thumb['src'])) {
            $thumb = get_list_thumbnail($bo_table, $wr_id, $thumb_w, $thumb_h, true, true);
            if (empty($thumb['src']) && function_exists('uph_webp_thumb')) {
                $thumb = uph_webp_thumb($bo_table, $wr_id, $thumb_w, $thumb_h);
            }
            if (!empty($thumb['src']) && strpos($thumb['src'], G5_DATA_URL) === 0) {
                $thumb_cache[$tkey] = $thumb['src'];
                $thumb_cache_dirty = true;
            }
        }

        if ($thumb['src']) {
            $thumb_content = '<img src="'.$thumb['src'].'" alt="img" loading="lazy" decoding="async">';
        }
        else if ($item_type == 'URL' && !empty($list_item['wr_url'])) {
            $first_url = trim(explode("\n", str_replace("\r", "", $list_item['wr_url']))[0]);
            if ($first_url && preg_match('/^https?:\/\//i', $first_url)) {
                $thumb_content = '<img src="'.htmlspecialchars($first_url, ENT_QUOTES).'" alt="img" loading="lazy" decoding="async">';
            } else {
                $thumb_content = '<img src="'.$no_image_src.'" alt="no image" style="opacity:0.1;">';
            }
        }
        else {
            $txt_html = conv_content(!empty($list_item['wr_text']) ? $list_item['wr_text'] : $list_item['wr_content'], 1);
            if (function_exists('emote_ev')) $txt_html = emote_ev($txt_html);
            if (function_exists('autolink')) $txt_html = autolink($txt_html, $bo_table, $stx);
            $thumb_content = trim($txt_html) ? '<div class="text-thumb-box">'.$txt_html.'</div>' : '<img src="'.$no_image_src.'" alt="no image" style="opacity:0.1;">';
        }

        $subject_safe = get_text($list_item['wr_subject']);

        $raw_content_for_tags = (($list_item['wr_type'] ?? '') == 'TEXT') ? ($list_item['wr_text'] ?? '') : ($list_item['wr_content'] ?? '');
        $plain_tags_src = preg_replace('/<br\s*\/?>|<\/p>|<\/div>/i', ' ', $raw_content_for_tags);
        $plain_tags_src = html_entity_decode(strip_tags($plain_tags_src), ENT_QUOTES, 'UTF-8');
        $plain_tags_src = str_replace("\xC2\xA0", ' ', $plain_tags_src);
        preg_match_all('/#([^\s#<>]+)/u', $plain_tags_src, $matches);
        $item_tags = array();
        if (!empty($matches[1])) {
            foreach ($matches[1] as $t) {
                $t_clean = trim(preg_replace('/[[:punct:]]+$/u', '', $t));
                if ($t_clean !== '') $item_tags[] = mb_strtolower($t_clean, 'UTF-8');
            }
        }
        $item_tags = array_values(array_unique($item_tags));
        $item_tags_attr = implode(',', $item_tags);
    ?>
        <div class="gallery-item" data-wr-id="<?php echo $wr_id; ?>" data-tags="<?php echo htmlspecialchars($item_tags_attr, ENT_QUOTES); ?>">
            <a href="javascript:void(0);" onclick="openLogModal('<?php echo $wr_id ?>');" class="item-link" title="<?php echo $subject_safe; ?>">
                <div class="thumb-container">
                    <?php echo $thumb_content; ?>
                    <?php if ($list_item['ca_name']) { ?><span class="cate-badge">#<?php echo get_text($list_item['ca_name']) ?></span><?php } ?>
                    <div class="item-overlay">
                        <span class="ov-title"><?php echo $subject_safe; ?></span>
                        <span class="ov-date"><?php echo date('Y.m.d', strtotime($list_item['wr_datetime'])) ?></span>
                    </div>
                </div>
            </a>
        </div>
    <?php
        ob_start();
    ?>
        <div id="modal_log_<?php echo $wr_id ?>" class="log-modal-overlay" onclick="closeLogModal(event, '<?php echo $wr_id ?>');">
            <?php if ($prev_wr_id) { ?>
                <div class="post-nav-btn post-nav-prev" onclick="switchLogModal('<?php echo $wr_id ?>', '<?php echo $prev_wr_id ?>', 'prev');"><i class="fa fa-chevron-left"></i></div>
            <?php } ?>
            <?php if ($next_wr_id) { ?>
                <div class="post-nav-btn post-nav-next" onclick="switchLogModal('<?php echo $wr_id ?>', '<?php echo $next_wr_id ?>', 'next');"><i class="fa fa-chevron-right"></i></div>
            <?php } ?>

            <div class="log-modal-content">
                <?php include($board_skin_path.'/list.log.skin.php'); ?>
            </div>
        </div>
    <?php
        $modal_html .= ob_get_clean();
    } // end for

    if ($thumb_cache_dirty) {
        @file_put_contents($thumb_cache_file, json_encode($thumb_cache, JSON_UNESCAPED_SLASHES), LOCK_EX);
    }
    ?>
    </div>

   <div class="bottom-control-box">
        <div class="sch_simple_box">
            <form name="fsearch" method="get">
                <input type="hidden" name="bo_table" value="<?php echo $bo_table ?>">
                <input type="hidden" name="sca" value="<?php echo $sca ?>">
                <input type="hidden" name="sop" value="and">
                <input type="hidden" name="sfl" value="wr_subject||wr_content">
                <input type="text" name="stx" class="sch_input" placeholder="SEARCH" value="<?php echo $stx ?>">
                <button type="submit" class="sch_btn" title="검색"><i class="fa fa-search" aria-hidden="true"></i></button>
            </form>
        </div>

        <div style="display:flex; gap:5px; align-items:center;">
            <?php if ($write_href) { ?><a href="<?php echo $write_href ?>" class="ctrl-btn write" title="LOG">✎</a><?php } ?>
            <a href="<?php echo $list_href ?>" class="ctrl-btn refresh" title="새로고침">↻</a>
            <?php if ($is_admin) { ?>
            <a href="<?php echo G5_ADMIN_URL ?>/board_form.php?bo_table=<?php echo $bo_table ?>&amp;w=u" class="ctrl-btn set" title="설정">⚙</a>
            <a href="javascript:void(0);" id="uph-open-panel" class="ctrl-btn" title="디자인 패널" style="color:#ffc107 !important;"><i class="fa fa-sliders-h"></i></a>
            <?php } ?>
        </div>
    </div>
</div>

<?php echo $modal_html; ?>

<?php if ($is_admin) { $dc = $design_config; ?>
<!-- 최고관리자 커스텀 패널 UI -->
<style>
#uph-admin-panel .uph-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
#uph-admin-panel .uph-grp { display:flex; align-items:center; gap:8px; }
#uph-admin-panel .uph-title { font-weight:bold; color:#ffc107; margin:4px 0 10px; }
#uph-admin-panel input[type=color] { width:38px; height:24px; padding:0; border:1px solid #666; border-radius:4px; background:none; cursor:pointer; }
#uph-admin-panel input[type=range] { width:70px; }
</style>
<div id="uph-admin-panel" style="display:none; position:fixed; top:80px; right:20px; width:300px; background:#1e1e24; color:#fff; border:1px solid #444; border-radius:8px; padding:15px; z-index:99999; box-shadow:0 10px 30px rgba(0,0,0,0.5); font-size:12px;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #444; padding-bottom:8px;">
        <strong style="color:#ffc107;"><i class="fa fa-sliders-h"></i> 태그·페이징 디자인 패널</strong>
        <div>
            <button type="button" id="uph-panel-save" style="background:#28a745; color:#fff; border:none; padding:3px 8px; border-radius:4px; cursor:pointer;">저장</button>
            <button type="button" id="uph-panel-close" style="background:#dc3545; color:#fff; border:none; padding:3px 8px; border-radius:4px; cursor:pointer;">닫기</button>
        </div>
    </div>
    <form id="uph-design-form">
        <div class="uph-title">태그</div>
        <?php
        echo uph_row_border('외곽선', 'tag_border', !empty($dc['tag_border']), uph_hex6($dc['tag_border_color'], '#dddddd'));
        list($h, $a) = uph_split_rgba($dc['tag_bg'], '#ffffff', 85);
        echo uph_row_alpha('배경색 / 투명도', 'tag_bg', $h, $a);
        echo uph_row('글자 색상', 'tag_color', uph_hex6($dc['tag_color'], '#555555'));
        echo uph_row('마우스 오버 배경', 'tag_hover_bg', uph_hex6($dc['tag_hover_bg'], $point_color_hex));
        echo uph_row('마우스 오버 글자', 'tag_hover_color', uph_hex6($dc['tag_hover_color'], '#ffffff'));
        ?>
        <div class="uph-title" style="border-top:1px solid #444; padding-top:10px;">페이징 박스</div>
        <?php
        echo uph_row_border('외곽선', 'paging_border', !empty($dc['paging_border']), uph_hex6($dc['paging_border_color'], '#dddddd'));
        list($h, $a) = uph_split_rgba($dc['paging_bg'], '#ffffff', 85);
        echo uph_row_alpha('배경색 / 투명도', 'paging_bg', $h, $a);
        echo uph_row('글자 색상', 'paging_color', uph_hex6($dc['paging_color'], '#555555'));
        echo uph_row('마우스 오버 배경', 'paging_hover_bg', uph_hex6($dc['paging_hover_bg'], $point_color_hex));
        echo uph_row('마우스 오버 글자', 'paging_hover_color', uph_hex6($dc['paging_hover_color'], '#ffffff'));
        ?>
    </form>
</div>
<?php } ?>

<div id="img-lightbox">
    <div class="close-btn" title="닫기">&times;</div>
    <div class="swiper lightbox-swiper">
        <div class="swiper-wrapper"></div>
        <div class="swiper-button-next"></div>
        <div class="swiper-button-prev"></div>
        <div class="swiper-pagination"></div>
    </div>
</div>

<script>
var UPH = window.UPH || (window.UPH = { swipers: {}, _q: [], S: null });
UPH.onReady = function(fn) { if (UPH.S) { fn(UPH.S); } else { UPH._q.push(fn); } };

(function() {
    function boot(S) {
        UPH.S = S;
        while (UPH._q.length) { try { UPH._q.shift()(S); } catch(e) {} }
    }
    function usable(S) {
        if (!S) return false;
        var v = parseInt(String(S.version || '0').split('.')[0], 10);
        return v >= 8;
    }
    if (usable(window.Swiper)) { boot(window.Swiper); return; }

    var prev = window.Swiper;
    var el = document.createElement('script');
    el.src = 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js';
    el.onload = function() {
        var mine = window.Swiper;
        if (prev) window.Swiper = prev;
        boot(mine);
    };
    el.onerror = function() {
        if (window.console) console.warn('[u_photo] Swiper 를 불러오지 못했습니다.');
    };
    document.head.appendChild(el);
})();

var lightboxSwiper = null, _modalSwitching = false;

function uphInitSwiper(id, container) {
    UPH.onReady(function(S) {
        if (UPH.swipers[id]) { UPH.swipers[id].update(); return; }
        UPH.swipers[id] = new S(container, {
            slidesPerView: 1,
            spaceBetween: 30,
            loop: false,
            observer: true,
            observeParents: true,
            resizeObserver: true,
            navigation: {
                nextEl: container.querySelector('.swiper-button-next'),
                prevEl: container.querySelector('.swiper-button-prev')
            }
        });
        container.querySelectorAll('img').forEach(function(im) {
            im.addEventListener('load', function() {
                if (UPH.swipers[id]) UPH.swipers[id].update();
            });
        });
    });
}

function openLogModal(id, isSwitch) {
    var m = document.getElementById('modal_log_' + id);
    var bg = document.getElementById('modal-fixed-bg');
    var content = m ? m.querySelector('.log-modal-content') : null;
    if (!m || !bg || !content) return;

    m.classList.add('transparent-bg');
    bg.style.display = 'block';
    if (!isSwitch) {
        bg.classList.remove('animate-fade');
        void bg.offsetWidth;
        bg.classList.add('animate-fade');
    }
    m.style.display = 'block';
    if (!isSwitch) {
        content.classList.remove('animate-up');
        void content.offsetWidth;
        content.classList.add('animate-up');
    }
    document.body.style.overflow = 'hidden';

    var sc = m.querySelector('.uph-swiper');
    if (sc) uphInitSwiper(id, sc);
}

function switchLogModal(currentId, targetId, direction) {
    if (_modalSwitching) return;
    _modalSwitching = true;

    var currentModal = document.getElementById('modal_log_' + currentId);
    var targetModal  = document.getElementById('modal_log_' + targetId);
    if (!currentModal || !targetModal) { _modalSwitching = false; return; }

    var currentContent = currentModal.querySelector('.log-modal-content');
    var targetContent  = targetModal.querySelector('.log-modal-content');
    if (currentContent) currentContent.classList.remove('animate-up', 'animate-fade');
    if (targetContent)  targetContent.classList.remove('animate-up', 'animate-fade');

    targetModal.classList.add('transparent-bg');
    targetModal.style.display = 'block';
    targetModal.style.zIndex = 9100;

    var outClass = (direction === 'prev') ? 'anim-prev-out' : 'anim-next-out';
    var inClass  = (direction === 'prev') ? 'anim-prev-in'  : 'anim-next-in';

    currentModal.classList.add(outClass);
    targetModal.classList.add(inClass);

    setTimeout(function() {
        currentModal.style.display = 'none';
        currentModal.classList.remove(outClass, 'anim-next-out', 'anim-prev-out');
        targetModal.classList.remove(inClass, 'anim-next-in', 'anim-prev-in');
        targetModal.style.zIndex = 9000;
        openLogModal(targetId, true);
        _modalSwitching = false;
    }, 500);
}

function closeLogModal(e, id) {
    if (!(e == null || e.target.classList.contains('log-modal-overlay'))) return;
    var m = document.getElementById('modal_log_' + id);
    var bg = document.getElementById('modal-fixed-bg');
    var content = m ? m.querySelector('.log-modal-content') : null;
    if (!m || !bg || !content) return;

    bg.classList.remove('animate-fade'); bg.classList.add('animate-fade-out');
    content.classList.remove('animate-up'); content.classList.add('animate-down');
    setTimeout(function() {
        m.style.display = 'none'; bg.style.display = 'none';
        bg.classList.remove('animate-fade-out'); content.classList.remove('animate-down');
        m.classList.remove('shine-on');
        document.body.style.overflow = '';
    }, 300);
}

document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    var lb = document.getElementById('img-lightbox');
    if (lb && lb.style.display === 'flex') { $('#img-lightbox').fadeOut(200); return; }
    var opened = document.querySelector('.log-modal-overlay[style*="display: block"]');
    if (opened) closeLogModal(null, opened.id.replace('modal_log_', ''));
});

function updateCloseBtnPosition() {
    var lb = $('#img-lightbox');
    if (lb.is(':hidden')) return;
    var img = lb.find('.swiper-slide-active img');
    if (img.length === 0 || img[0].naturalWidth === 0) return;
    var rect = img[0].getBoundingClientRect();
    lb.find('.close-btn').css({ top: (rect.top - 20) + 'px', left: (rect.right - 20) + 'px', right: 'auto', display: 'block' });
}

$(document).on('click', '.uph-swiper .swiper-slide img, .lightbox_trigger', function(e) {
    var host = this.closest('.swiper');
    if (host && host.swiper && host.swiper.allowClick === false) return;

    e.preventDefault(); e.stopPropagation();

    var clickedSrc = $(this).attr('src');
    var images = [], initialSlide = 0;
    var $container = $(this).closest('.uph-swiper');

    $container.find('img').each(function(index) {
        var src = $(this).attr('src'); images.push(src);
        if (src === clickedSrc) initialSlide = index;
    });
    if (!images.length) { images = [clickedSrc]; initialSlide = 0; }

    var slidesHtml = '';
    for (var i = 0; i < images.length; i++) {
        slidesHtml += '<div class="swiper-slide"><img src="' + images[i] + '" onload="updateCloseBtnPosition()"></div>';
    }
    $('#img-lightbox .swiper-wrapper').html(slidesHtml);

    if (images.length > 1) {
        $('#img-lightbox .swiper-button-next, #img-lightbox .swiper-button-prev').show();
    } else {
        $('#img-lightbox .swiper-button-next, #img-lightbox .swiper-button-prev').hide();
    }

    $('#img-lightbox').css('display', 'flex').hide().fadeIn(200, function() {
        setTimeout(updateCloseBtnPosition, 50);
    });

    UPH.onReady(function(S) {
        if (lightboxSwiper) { lightboxSwiper.destroy(true, true); lightboxSwiper = null; }
        lightboxSwiper = new S('#img-lightbox .lightbox-swiper', {
            initialSlide: initialSlide, slidesPerView: 1, spaceBetween: 50,
            observer: true, observeParents: true, resizeObserver: true,
            allowTouchMove: (images.length > 1),
            navigation: { nextEl: '#img-lightbox .swiper-button-next', prevEl: '#img-lightbox .swiper-button-prev' },
            pagination: { el: '#img-lightbox .swiper-pagination', clickable: true },
            on: {
                init: function() { setTimeout(updateCloseBtnPosition, 100); },
                slideChangeTransitionEnd: updateCloseBtnPosition,
                resize: updateCloseBtnPosition
            }
        });
    });
});

$('#img-lightbox').on('click', function(e) {
    if ($(e.target).hasClass('close-btn') || $(e.target).closest('.close-btn').length > 0) { $('#img-lightbox').fadeOut(200); return; }
    if ($(e.target).hasClass('swiper-button-next') || $(e.target).hasClass('swiper-button-prev')) return;
    if ($(e.target).is('img')) { e.stopPropagation(); return; }
    $('#img-lightbox').fadeOut(200);
});

var UPH_TAG_ORDER = <?php echo json_encode($saved_tag_order, JSON_UNESCAPED_UNICODE|JSON_HEX_TAG|JSON_HEX_AMP|JSON_HEX_QUOT|JSON_HEX_APOS); ?>;

$(function() {
    var $container = $('#uph_tag_filter_container');
    var savedOrder = $.isArray(UPH_TAG_ORDER) ? UPH_TAG_ORDER : [];

    function escAttr(s) {
        return $('<i>').text(s).html().replace(/"/g, '&quot;');
    }

    function applyFilter() {
        var selected = [];
        $container.find('.uph-tag-btn.active').not('[data-tag="all"]').each(function() {
            selected.push(String($(this).attr('data-tag')).toLowerCase());
        });
        $('#log_list .gallery-item').each(function() {
            var $item = $(this);
            var itemTags = ($item.attr('data-tags') || '').split(',').map(function(s) {
                return $.trim(s).toLowerCase();
            });
            var ok = true;
            for (var i = 0; i < selected.length; i++) {
                if (itemTags.indexOf(selected[i]) === -1) { ok = false; break; }
            }
            $item.toggleClass('uph-hide', !ok);   // AND 조건
        });
    }

    function initTagFilter() {
        var allTags = [];
        $('#log_list .gallery-item').each(function() {
            var s = $(this).attr('data-tags');
            if (!s) return;
            s.split(',').forEach(function(t) {
                t = $.trim(t);
                if (t && allTags.indexOf(t) === -1) allTags.push(t);
            });
        });
        if (!allTags.length) { $container.hide(); return; }

        // 저장된 순서 우선, 없는 태그는 뒤로
        allTags.sort(function(a, b) {
            var ia = savedOrder.indexOf(a), ib = savedOrder.indexOf(b);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });

        var html = '<button type="button" class="uph-tag-btn active" data-tag="all">#전체태그</button>';
        allTags.forEach(function(tag) {
            html += '<button type="button" class="uph-tag-btn" data-tag="' + escAttr(tag) + '">#' + $('<i>').text(tag).html() + '</button>';
        });
        $container.html(html).show();

        <?php if ($is_admin) { ?>
        var dragging = false;
        $container.sortable({
            items: '.uph-tag-btn:not([data-tag="all"])',
            cancel: '',                       // button 드래그 허용 (핵심)
            distance: 5,                      // 5px 이상 움직여야 드래그 시작 (클릭과 구분)
            tolerance: 'pointer',
            cursor: 'grabbing',
            opacity: 0.8,
            placeholder: 'uph-tag-btn ui-sortable-placeholder',
            start: function() { dragging = true; },
            stop: function() { setTimeout(function() { dragging = false; }, 50); },
            update: function() {
                var order = [];
                $container.find('.uph-tag-btn').not('[data-tag="all"]').each(function() {
                    order.push(String($(this).attr('data-tag')));
                });
                savedOrder = order;
                $.ajax({
                    url: '<?php echo $board_skin_url; ?>/ajax.tag_order.php',
                    type: 'POST', dataType: 'json',
                    data: { bo_table: '<?php echo $bo_table; ?>', tags: order },
                    success: function(res) {
                        if (!res || res.result !== 'success') alert((res && res.message) || '태그 순서 저장 중 오류가 발생했습니다.');
                    },
                    error: function() { alert('서버 통신 오류가 발생했습니다.'); }
                });
            }
        });
        $container.on('click', '.uph-tag-btn', function(e) {
            if (dragging) { e.stopImmediatePropagation(); e.preventDefault(); }
        });
        <?php } ?>
    }

    initTagFilter();

    // 클릭: 다중 선택, 재클릭 시 해제
    $container.on('click', '.uph-tag-btn', function() {
        var $btn = $(this);
        var $all = $container.find('.uph-tag-btn[data-tag="all"]');

        if ($btn.attr('data-tag') === 'all') {
            $container.find('.uph-tag-btn').removeClass('active');
            $btn.addClass('active');
        } else {
            $all.removeClass('active');
            $btn.toggleClass('active');
            if ($container.find('.uph-tag-btn.active').not('[data-tag="all"]').length === 0) {
                $all.addClass('active');
            }
        }
        applyFilter();
    });
});

<?php if ($is_admin) { ?>
$(function() {
    $('#log_list').sortable({
        items: '.gallery-item',
        cursor: 'grabbing',
        opacity: 0.85,
        tolerance: 'pointer',
        placeholder: 'gallery-item ui-sortable-placeholder',
        forcePlaceholderSize: true,
        update: function(event, ui) {
            var orderList = [];
            $('#log_list .gallery-item').each(function(index) {
                var wrId = $(this).data('wr-id');
                if (wrId) orderList.push(wrId);
            });

            $.ajax({
                url: '<?php echo $board_skin_url; ?>/ajax.order_update.php',
                type: 'POST',
                dataType: 'json',
                data: {
                    bo_table: '<?php echo $bo_table; ?>',
                    wr_ids: orderList
                },
                success: function(res) {
                    if (!res || res.result !== 'success') {
                        alert(res.message || '순서 변경 저장 중 오류가 발생했습니다.');
                    }
                },
                error: function() {
                    alert('서버 통신 오류가 발생했습니다.');
                }
            });
        }
    }).disableSelection();

    // 패널 값을 바꾸면 저장 전에도 바로 화면에 반영
    function uphHexA(h, a) {
        var n = parseInt(h.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (a / 100) + ')';
    }
    function uphPreview() {
        var f = $('#uph-design-form'), r = document.documentElement.style;
        function v(n) { return f.find('[name="' + n + '"]').val(); }
        ['tag', 'paging'].forEach(function(p) {
            r.setProperty('--' + p + '-border', f.find('[name="' + p + '_border"]').is(':checked') ? '1px solid ' + v(p + '_border_color') : 'none');
            r.setProperty('--' + p + '-bg', uphHexA(v(p + '_bg_c'), v(p + '_bg_a')));
            r.setProperty('--' + p + '-color', v(p + '_color'));
            r.setProperty('--' + p + '-hover-bg', v(p + '_hover_bg'));
            r.setProperty('--' + p + '-hover-color', v(p + '_hover_color'));
        });
    }
    $('#uph-design-form').on('input change', uphPreview);

    // 관리자 패널 토글 제어
    $('#uph-open-panel').on('click', function() {
        $('#uph-admin-panel').fadeToggle(200);
    });
    $('#uph-panel-close').on('click', function() {
        $('#uph-admin-panel').fadeOut(200);
    });
    $('#uph-panel-save').on('click', function() {
        var formData = $('#uph-design-form').serialize();
        $.ajax({
            url: '<?php echo $board_skin_url; ?>/ajax.design_save.php',
            type: 'POST',
            dataType: 'json',
            data: 'bo_table=<?php echo $bo_table; ?>&' + formData,
            success: function(res) {
                if (res && res.result === 'success') {
                    alert('디자인 설정이 저장되었습니다.');
                    location.reload();
                } else {
                    alert((res && res.message) || '저장 중 오류가 발생했습니다.');
                }
            },
            error: function() {
                alert('서버 통신 오류가 발생했습니다.');
            }
        });
    });
});
<?php } ?>

<?php if ($auto_open_id) { ?>
$(function() {
    if (document.getElementById('modal_log_<?php echo $auto_open_id ?>')) openLogModal('<?php echo $auto_open_id ?>');
});
<?php } ?>
</script>

<?php
if (file_exists(G5_PATH.'/widget/widget_twt/widget.php')) {
    include_once(G5_PATH.'/widget/widget_twt/widget.php');
}
?>