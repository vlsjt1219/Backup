<?php
if (!defined("_GNUBOARD_")) exit;

// wr_url 처리 (wr_img 방식과 동일)
$wr_url = '';
$char_img_type = isset($_POST['char_img_type']) ? $_POST['char_img_type'] : 'file';

if ($char_img_type == 'url') {
    // URL 입력 방식
    $wr_url = isset($_POST['wr_url_input']) ? clean_xss_tags(trim($_POST['wr_url_input'])) : '';
} else {
    // 파일 업로드 방식
    if (isset($_FILES['wr_url_file']) && $_FILES['wr_url_file']['error'] == 0) {
        $tmp_file = $_FILES['wr_url_file']['tmp_name'];
        $filename = $_FILES['wr_url_file']['name'];

        // 파일 확장자 체크
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $allowed_ext = array('jpg', 'jpeg', 'png', 'gif', 'webp');

        if (in_array($ext, $allowed_ext)) {
            // 파일명 생성 (char_ 접두사로 구분)
            $wr_url_filename = 'char_'.md5(uniqid(time(), true)).'.'.$ext;
            $dest_path = G5_DATA_PATH.'/file/'.$bo_table.'/'.$wr_url_filename;

            // 디렉토리 생성
            @mkdir(G5_DATA_PATH.'/file/'.$bo_table, G5_DIR_PERMISSION, true);

            // 파일 이동
            if (move_uploaded_file($tmp_file, $dest_path)) {
                $wr_url = $wr_url_filename;
            }
        }
    } else if ($w == 'u' && !isset($_POST['wr_url_del'])) {
        // 수정 시 기존 이미지 유지
        $wr_url = isset($_POST['wr_url_keep']) ? $_POST['wr_url_keep'] : '';
    }
}

// 삭제 체크박스 처리
if ($w == 'u' && isset($_POST['wr_url_del']) && $_POST['wr_url_del'] == '1') {
    // 기존 파일 삭제 (URL이 아닌 경우만)
    if (isset($_POST['wr_url_keep']) && $_POST['wr_url_keep'] && strpos($_POST['wr_url_keep'], 'http') !== 0) {
        @unlink(G5_DATA_PATH.'/file/'.$bo_table.'/'.$_POST['wr_url_keep']);
    }
    $wr_url = '';
}

// wr_url 업데이트
$sql = "UPDATE {$write_table} SET wr_url = '".sql_real_escape_string($wr_url)."' WHERE wr_id = '".(int)$wr_id."'";
sql_query($sql);
