<?php
include_once('../../../common.php');

// 최고관리자 권한 체크
if (!isset($is_admin) || !$is_admin) {
    echo json_encode(array('result' => 'fail', 'message' => '최고관리자만 접근할 수 있습니다.'));
    exit;
}

$bo_table = isset($_POST['bo_table']) ? clean_xss_tags($_POST['bo_table']) : '';
$wr_ids = isset($_POST['wr_ids']) ? $_POST['wr_ids'] : array();

if (!$bo_table || empty($wr_ids) || !is_array($wr_ids)) {
    echo json_encode(array('result' => 'fail', 'message' => '잘못된 접근입니다.'));
    exit;
}

$write_table = $g5['write_prefix'] . $bo_table;

// 드래그된 순서 배열을 바탕으로 역순으로 wr_num 값을 부여하여 순서 정렬 유지
$count = count($wr_ids);
foreach ($wr_ids as $index => $wr_id) {
    $wr_id = (int)$wr_id;
    if ($wr_id <= 0) continue;
    
    $new_num = -($count - $index);
    sql_query(" UPDATE {$write_table} SET wr_num = '{$new_num}' WHERE wr_id = '{$wr_id}' ");
}

echo json_encode(array('result' => 'success'));
exit;