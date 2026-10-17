<?php
if (!defined("_GNUBOARD_")) exit;

$update_href = $delete_href = '';
$is_owner = (!empty($member['mb_id']) && !empty($list_item['mb_id']) && $member['mb_id'] === $list_item['mb_id']);

if ($is_owner || $is_admin) {
	$update_href = './write.php?w=u&amp;bo_table='.$bo_table.'&amp;wr_id='.$list_item['wr_id'].'&amp;page='.$page.$qstr;
	set_session('ss_delete_token', $token = uniqid(time()));
	$delete_href = './delete.php?bo_table='.$bo_table.'&amp;wr_id='.$list_item['wr_id'].'&amp;token='.$token.'&amp;page='.$page.urldecode($qstr);
}

// 이미지 슬라이드 생성
$slider_images = array();
$wr_id_cur = (int)$list_item['wr_id'];

// 1) 업로드 파일
$files = get_file($bo_table, $wr_id_cur);
if (is_array($files)) {
    foreach ($files as $fitem) {
        if (!empty($fitem) && !empty($fitem['file'])) {
            $img_src = G5_DATA_URL.'/file/'.$bo_table.'/'.$fitem['file'];
            $slider_images[] = '<img src="'.htmlspecialchars($img_src, ENT_QUOTES).'" alt="image" loading="lazy" decoding="async">';
        }
    }
}

// 2) 외부 URL (줄바꿈으로 여러 개 저장된 경우 모두 처리)
if (($list_item['wr_type'] ?? '') == 'URL' && !empty($list_item['wr_url'])) {
    $url_list = array_filter(explode("\n", str_replace("\r", "", $list_item['wr_url'])));
    foreach ($url_list as $one_url) {
        $one_url = trim($one_url);
        if ($one_url && preg_match('/^https?:\/\//i', $one_url)) {
            $slider_images[] = '<img src="'.htmlspecialchars($one_url, ENT_QUOTES).'" alt="url image" loading="lazy" decoding="async">';
        }
    }
}

$img_count = count($slider_images);
?>

<div class="item" id="log_<?php echo $wr_id_cur ?>">
    <div class="item-inner">

        <div class="polaroid-frame">

            <div class="pic-data">
                <?php if ($img_count > 0) { ?>
                    <div class="swiper uph-swiper" id="swiper_<?php echo $wr_id_cur ?>">
                        <div class="swiper-wrapper">
                            <?php foreach($slider_images as $img_tag) { ?>
                                <div class="swiper-slide"><?php echo $img_tag; ?></div>
                            <?php } ?>
                        </div>
                        <?php if($img_count > 1) { ?>
                            <div class="swiper-button-next"></div>
                            <div class="swiper-button-prev"></div>
                        <?php } ?>
                    </div>
                <?php } else { ?>
                    <div class="swiper uph-swiper" style="background:#eee; display:flex; justify-content:center; align-items:center; color:#ccc;">NO IMAGE</div>
                <?php } ?>
            </div>

            <div class="polaroid-text-area">

                <?php if($img_count > 1) { ?>
                <div class="photo-pagination" id="pagination_<?php echo $wr_id_cur ?>">
                    <?php for($d = 0; $d < $img_count; $d++) { ?>
                    <span class="photo-dot<?php echo $d === 0 ? ' active' : '' ?>"></span>
                    <?php } ?>
                </div>
                <?php } ?>

                <span class="polaroid-title" style="font-size:20px !important; font-weight:bold !important;">
                    <?php if(!empty($list_item['is_notice'])) { ?><span class="notice-badge" style="font-size:12px; background:#eee; padding:2px 5px; border-radius:3px;">NOTICE</span> <?php } ?>
                    <?php echo get_text($list_item['wr_subject']) ?>
                </span>

                <span class="polaroid-date" style="font-size:12px !important;">
                    <?php echo date('Y.m.d H:i', strtotime($list_item['wr_datetime'])) ?>
                </span>

                <?php
                $raw_content = (($list_item['wr_type'] ?? '') == 'TEXT') ? ($list_item['wr_text'] ?? '') : ($list_item['wr_content'] ?? '');
                if (trim((string)$raw_content) !== '') {
                    $view_content = conv_content($raw_content, 1);
                    if (function_exists('emote_ev'))    $view_content = emote_ev($view_content);
                    if (function_exists('autolink'))    $view_content = autolink($view_content, $bo_table, $stx);
                    if (function_exists('markup_text')) $view_content = markup_text($view_content);
                ?>
                    <div class="polaroid-desc" style="font-size:17px !important;"><?php echo trim($view_content); ?></div>
                <?php } ?>

                <?php if ($delete_href || $update_href) { ?>
                <div class="admin-btns">
                    <?php if ($update_href) { ?><a href="<?php echo $update_href ?>" class="mod">수정</a><?php } ?>
                    <?php if ($delete_href) { ?><a href="<?php echo $delete_href ?>" class="del" onclick="del(this.href); return false;">삭제</a><?php } ?>
                </div>
                <?php } ?>
            </div>

        </div>

    </div>
</div>

<?php if($img_count > 1) { ?>
<script>
(function() {
    var swiperEl     = document.getElementById('swiper_<?php echo $wr_id_cur ?>');
    var paginationEl = document.getElementById('pagination_<?php echo $wr_id_cur ?>');
    if (!swiperEl || !paginationEl) return;

    var dots = paginationEl.querySelectorAll('.photo-dot');
    var lastIndex = 0;

    function setActiveDot(index) {
        if (index === lastIndex) return;
        lastIndex = index;
        dots.forEach(function(d, i) { d.classList.toggle('active', i === index); });
    }

    var observer = new MutationObserver(function() {
        var slides = swiperEl.querySelectorAll('.swiper-slide');
        slides.forEach(function(slide, i) {
            if (slide.classList.contains('swiper-slide-active')) setActiveDot(i);
        });
    });
    observer.observe(swiperEl, { subtree: true, attributes: true, attributeFilter: ['class'] });

    dots.forEach(function(dot, i) {
        dot.addEventListener('click', function(e) {
            e.stopPropagation();
            if (swiperEl.swiper) swiperEl.swiper.slideTo(i);
        });
    });
})();
</script>
<?php } ?>