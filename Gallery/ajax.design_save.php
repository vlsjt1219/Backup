<?php
include_once(dirname(__FILE__).'/../../../common.php');   // ← ajax.tag_order.php 와 동일하게
header('Content-Type: application/json; charset=utf-8');

if ($is_admin !== 'super') {
    echo json_encode(array('result' => 'fail', 'message' => '권한이 없습니다.')); exit;
}
$bo = isset($_POST['bo_table']) ? preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['bo_table']) : '';
if ($bo === '') {
    echo json_encode(array('result' => 'fail', 'message' => '잘못된 요청입니다.')); exit;
}

function uph_p_hex($key, $fb) {
    $v = isset($_POST[$key]) ? strtolower(trim($_POST[$key])) : '';
    return preg_match('/^#[0-9a-f]{6}$/', $v) ? $v : $fb;
}
function uph_p_rgba($key, $fb) {
    $hex = uph_p_hex($key.'_c', $fb);
    $a = isset($_POST[$key.'_a']) ? max(0, min(100, (int)$_POST[$key.'_a'])) : 85;
    $n = hexdec(substr($hex, 1));
    return 'rgba('.(($n >> 16) & 255).', '.(($n >> 8) & 255).', '.($n & 255).', '.($a / 100).')';
}

$cfg = array();
foreach (array('tag', 'paging') as $p) {
    $cfg[$p.'_border']       = !empty($_POST[$p.'_border']) ? '1' : '';
    $cfg[$p.'_border_style'] = 'solid';
    $cfg[$p.'_border_width'] = '1px';
    $cfg[$p.'_border_color'] = uph_p_hex($p.'_border_color', '#dddddd');
    $cfg[$p.'_bg']           = uph_p_rgba($p.'_bg', '#ffffff');
    $cfg[$p.'_color']        = uph_p_hex($p.'_color', '#555555');
    $cfg[$p.'_hover_bg']     = uph_p_hex($p.'_hover_bg', '#97c3d1');
    $cfg[$p.'_hover_color']  = uph_p_hex($p.'_hover_color', '#ffffff');
}

$file = G5_DATA_PATH.'/u_photo_design_setting_'.$bo.'.json';
$ok = file_put_contents($file, json_encode($cfg, JSON_UNESCAPED_UNICODE), LOCK_EX);
echo json_encode($ok === false
    ? array('result' => 'fail', 'message' => '저장에 실패했습니다. data 폴더 권한을 확인해 주세요.')
    : array('result' => 'success'));