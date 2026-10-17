<?php
if (!defined('_GNUBOARD_')) exit;
include_once(G5_LIB_PATH.'/thumbnail.lib.php');

echo '<link rel="stylesheet" href="'.$board_skin_url.'/style.css">';

// 게시판 설정
$gallery_cols = $board['bo_gallery_cols'] ?? 4;
$gallery_height = $board['bo_gallery_height'] ?? 150;
// 버전관리
$upskin_version = 'v260129_0';
$upskin_id = 'character_simple_up';

?>

<div id="bo_gall" class="char_list">
    <!-- 상단: 카테고리 + 버튼 -->
    <div class="char_list_top">
        <?php if ($is_category) { ?>
        <nav class="char_cate_nav">
            <ul><?php echo $category_option ?></ul>
        </nav>
        <?php } ?>

        <div class="char_list_btn">
            <?php if ($admin_href) { ?><a href="<?php echo $admin_href ?>" class="btn btn_admin">관리자</a><?php } ?>
            <?php if ($write_href) { ?><a href="<?php echo $write_href ?>" class="btn btn_write">글쓰기</a><?php } ?>
        </div>
    </div>

    <!-- 캐릭터 그리드 -->
    <ul class="char_grid" style="--cols: <?php echo $gallery_cols ?>; --thumb-height: <?php echo $gallery_height ?>px;">
        <?php
        for ($i=0; $i<count($list); $i++) {
            // 썸네일 가져오기 (width는 0으로 자동, height만 지정)
            $thumb = get_list_thumbnail($board['bo_table'], $list[$i]['wr_id'], 0, $gallery_height, false, true);
            $img_url = $thumb['src'] ? $thumb['src'] : G5_IMG_URL.'/no_image.png';
        ?>
        <li class="char_item">
            <a href="<?php echo $list[$i]['href'] ?>" class="char_link">
                <div class="char_thumb">
                    <img src="<?php echo $img_url ?>" alt="<?php echo get_text($list[$i]['wr_subject']) ?>">
                </div>
                <div class="char_info">
                    <strong class="char_subject"><?php echo get_text(cut_str($list[$i]['wr_subject'], 20)) ?></strong>
                    <span class="char_name"><?php echo $list[$i]['name'] ?></span>
                </div>
            </a>
        </li>
        <?php } ?>

        <?php if (count($list) == 0) { ?>
        <li class="char_empty">등록된 캐릭터가 없습니다.</li>
        <?php } ?>
    </ul>

    <!-- 페이지 -->
    <?php echo $write_pages; ?>
</div>
