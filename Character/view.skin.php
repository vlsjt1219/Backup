<?php
if (!defined("_GNUBOARD_")) exit;
include_once(G5_LIB_PATH.'/thumbnail.lib.php');

echo '<link rel="stylesheet" href="'.$board_skin_url.'/style.css">';

// 캐릭터 이미지 가져오기 (wr_url)
$char_image = '';
if ($view['wr_url']) {
    if (strpos($view['wr_url'], 'http') === 0) {
        $char_image = $view['wr_url'];
    } else {
        $char_image = G5_DATA_URL . '/file/' . $bo_table . '/' . $view['wr_url'];
    }
}

// 썸네일 이미지 가져오기 (wr_img)
$thumb_image = '';
if (isset($view['wr_img']) && $view['wr_img']) {
    if (strpos($view['wr_img'], 'http') === 0) {
        $thumb_image = $view['wr_img'];
    } else {
        $thumb_image = G5_DATA_URL . '/file/' . $bo_table . '/' . $view['wr_img'];
    }
}
?>

<article id="bo_v" class="char_view">
    <!-- 헤더: 제목 + 버튼 -->
    <header class="char_header">
        <div class="char_meta">
            <span class="char_name"><?php echo $view['name'] ?></span>
            <span class="char_date"><?php echo date("Y-m-d", strtotime($view['wr_datetime'])) ?></span>
        </div>

        <div class="char_buttons">
            <a href="<?php echo $list_href ?>" class="btn">목록</a>
            <?php if ($update_href) { ?><a href="<?php echo $update_href ?>" class="btn">수정</a><?php } ?>
            <?php if ($delete_href) { ?><a href="<?php echo $delete_href ?>" class="btn" onclick="return confirm('정말 삭제하시겠습니까?');">삭제</a><?php } ?>
            <a href="<?php echo G5_BBS_URL; ?>/share_popup.php?bo_table=<?php echo $bo_table; ?>&wr_id=<?php echo $view['wr_id']; ?>" class="btn" onclick="window.open(this.href, 'share_popup', 'width=500,height=400'); return false;">공유</a>
        </div>
    </header>

    <!-- 본문: 왼쪽 이미지 + 오른쪽 내용 -->
    <div class="char_body">
        <!-- 왼쪽: 캐릭터 이미지 -->
        <div class="char_image_area">
            <?php if ($char_image) { ?>
            <img src="<?php echo $char_image; ?>" alt="<?php echo get_text($view['wr_subject']); ?>" class="char_image">
            <?php } else { ?>
            <div class="char_noimg">No Image</div>
            <?php } ?>
        </div>

        <!-- 오른쪽: 본문 내용 -->
        <div class="char_content_area">
            <?php if ($thumb_image) { ?>
            <div class="char_thumb_area">
                <img src="<?php echo $thumb_image; ?>" alt="썸네일" class="char_thumb_img">
            </div>
            <?php } ?>

            <div id="bo_v_con" class="char_content">
            <?php
            // 사용되지 않은 이미지 상단 출력
            if (!empty($view['unused_images'])) {
                echo '<div class="unused-images-area">';
                foreach ($view['unused_images'] as $img_html) {
                    echo $img_html;
                }
                echo '</div>';
            }

            // 본문 내용
            echo $view['rich_content'];
            ?>
            </div>
        </div>
    </div>

    <?php
    // 첨부파일 (bf_no > 0, 이미지가 아닌 파일들)
    $file_cnt = 0;
    if ($view['file']['count']) {
        for ($i=1; $i<count($view['file']); $i++) {
            if (isset($view['file'][$i]['source']) && $view['file'][$i]['source'] && !$view['file'][$i]['view'])
                $file_cnt++;
        }
    }
    ?>

    <?php if($file_cnt) { ?>
    <section class="char_files">
        <h3>첨부파일</h3>
        <ul>
        <?php
        for ($i=1; $i<count($view['file']); $i++) {
            if (isset($view['file'][$i]['source']) && $view['file'][$i]['source'] && !$view['file'][$i]['view']) {
        ?>
            <li>
                <a href="<?php echo $view['file'][$i]['href']; ?>">
                    <?php echo $view['file'][$i]['source'] ?> (<?php echo $view['file'][$i]['size'] ?>)
                </a>
            </li>
        <?php
            }
        }
        ?>
        </ul>
    </section>
    <?php } ?>

    <?php if ($prev_href || $next_href) { ?>
    <ul class="char_nav">
        <?php if ($prev_href) { ?><li class="prev"><span>이전</span><a href="<?php echo $prev_href ?>"><?php echo $prev_wr_subject; ?></a></li><?php } ?>
        <?php if ($next_href) { ?><li class="next"><span>다음</span><a href="<?php echo $next_href ?>"><?php echo $next_wr_subject; ?></a></li><?php } ?>
    </ul>
    <?php } ?>
</article>
