<?php
include_once('../../../common.php');   // ← ajax.order_update.php 와 동일하게
header('Content-Type: application/json; charset=utf-8');

if ($is_admin !== 'super') {
    echo json_encode(array('result' => 'fail', 'message' => '권한이 없습니다.')); exit;
}

$bo = isset($_POST['bo_table']) ? preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['bo_table']) : '';
$tags = isset($_POST['tags']) && is_array($_POST['tags']) ? $_POST['tags'] : array();
if ($bo === '') {
    echo json_encode(array('result' => 'fail', 'message' => '잘못된 요청입니다.')); exit;
}

$clean = array();
foreach (array_slice($tags, 0, 500) as $t) {
    $t = mb_substr(trim((string)$t), 0, 100, 'UTF-8');
    if ($t !== '' && !in_array($t, $clean, true)) $clean[] = $t;
}

$file = G5_DATA_PATH.'/u_photo_tag_order_'.$bo.'.json';
$old = array();
if (is_file($file)) {
    $j = json_decode(file_get_contents($file), true);
    if (is_array($j)) $old = $j;
}
// 이번 페이지에 없던 태그(다른 페이지 태그)는 뒤에 유지
foreach ($old as $t) {
    if (!in_array($t, $clean, true)) $clean[] = $t;
}

$ok = file_put_contents($file, json_encode($clean, JSON_UNESCAPED_UNICODE), LOCK_EX);
echo json_encode($ok === false
    ? array('result' => 'fail', 'message' => '저장에 실패했습니다. data 폴더 권한을 확인해 주세요.')
    : array('result' => 'success'));