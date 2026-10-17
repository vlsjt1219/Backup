<?php
/* 하트를 누른 사람 명단 — 관리자 또는 글쓴이만 조회 가능 */
include_once(__DIR__.'/_lib.php');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function uph_json($a) { echo json_encode($a, JSON_UNESCAPED_UNICODE); exit; }

$bo_table = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($_GET['bo_table'] ?? ''));
$wr_id    = (int)($_GET['wr_id'] ?? 0);

if ($bo_table === '' || $wr_id < 1) {
    uph_json(array('result' => 'fail', 'message' => '잘못된 요청입니다.'));
}

$board = get_board_db($bo_table);
if (!$board || empty($board['bo_table'])) {
    uph_json(array('result' => 'fail', 'message' => '게시판을 찾을 수 없습니다.'));
}

$write_table = $g5['write_prefix'].$bo_table;
$write = sql_fetch(" select wr_id, mb_id from `{$write_table}` where wr_id = '{$wr_id}' ", false);
if (!$write || empty($write['wr_id'])) {
    uph_json(array('result' => 'fail', 'message' => '글을 찾을 수 없습니다.'));
}

// --- 권한 확인 (화면에서 버튼을 숨기는 것과 별개로 서버에서 한 번 더) ---
$is_board_admin = uph_is_board_admin($board);
$is_writer      = (!empty($member['mb_id']) && !empty($write['mb_id']) && $member['mb_id'] === $write['mb_id']);

if (!$is_board_admin && !$is_writer) {
    uph_json(array('result' => 'fail', 'message' => '관리자와 글쓴이만 볼 수 있습니다.'));
}

// --- 총 개수 ---
if (function_exists('init_like_table')) init_like_table();
$expected = function_exists('get_like_count') ? (int)get_like_count($bo_table, $wr_id) : -1;

if ($expected === 0) {
    uph_json(array('result' => 'success', 'count' => 0, 'list' => array()));
}
if ($expected < 0) {
    uph_json(array('result' => 'fail', 'message' => '좋아요 기능을 찾을 수 없습니다.'));
}

// --- 기록 테이블 탐지 ---
$m = uph_like_meta($bo_table, $wr_id, $expected);
if (!$m) {
    uph_json(array('result' => 'fail', 'message' => '하트 기록 테이블을 찾지 못했습니다.'));
}

$order = $m['dt'] ? " order by `{$m['dt']}` desc " : "";
$sql   = " select * from `{$m['table']}` where ".uph_like_where($m, $bo_table, $wr_id).$order." limit 300 ";
$res   = sql_query($sql, false);

$list = array();
if ($res) {
    while ($row = sql_fetch_array($res)) {
        $mb = $m['mb'] ? trim((string)($row[$m['mb']] ?? '')) : '';

        if ($mb !== '') {
            $name  = uph_member_name($mb);
            $guest = false;
        } else {
            $name  = '외부인';
            $guest = true;
        }

        $date = '';
        if ($m['dt'] && !empty($row[$m['dt']])) {
            $ts = strtotime($row[$m['dt']]);
            if ($ts > 0) $date = date('y.m.d H:i', $ts);
        }

        $list[] = array('name' => $name, 'guest' => $guest, 'date' => $date);
    }
}

uph_json(array('result' => 'success', 'count' => count($list), 'list' => $list));
