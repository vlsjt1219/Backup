<?php
/* =========================================================================
   u_photo 스킨 공용 라이브러리
   - 스킨 폴더에서 직접 호출되는 ajax.heart.php / check.php 가 사용합니다.
   - 그누보드 루트를 스스로 찾아 common.php 를 읽으므로,
     스킨이 /skin/board/ 밑에 있든 /theme/xxx/skin/board/ 밑에 있든 동작합니다.
   ========================================================================= */

if (!defined('_GNUBOARD_')) {
    $__root = __DIR__;
    for ($__i = 0; $__i < 12; $__i++) {
        if (file_exists($__root.'/common.php') && file_exists($__root.'/config.php')) break;
        $__parent = dirname($__root);
        if ($__parent === $__root) break;
        $__root = $__parent;
    }
    if (!file_exists($__root.'/common.php')) {
        header('Content-Type: text/plain; charset=utf-8');
        exit('그누보드 common.php 를 찾지 못했습니다. 스킨 위치를 확인해 주세요.');
    }
    @chdir($__root);
    include_once($__root.'/common.php');
}
if (!defined('_GNUBOARD_')) exit;


/* -------------------------------------------------------------------------
   좋아요(하트) 기록 테이블 자동 탐지

   라공에디션의 init_like_table() / get_like_count() 가 어떤 테이블에
   기록하는지는 에디션 버전마다 다를 수 있어서, 테이블 이름을 고정하지 않고
   "get_like_count() 가 알려주는 개수와 딱 맞는 테이블"을 찾아서 씁니다.
   한 번 찾으면 세션에 캐시합니다.
   ------------------------------------------------------------------------- */

// 후보 테이블 이름 수집
function uph_like_candidates() {
    $names = array();
    foreach (array('%like%', '%heart%', '%good%') as $pat) {
        $res = sql_query(" SHOW TABLES LIKE '{$pat}' ", false);
        if (!$res) continue;
        while ($row = sql_fetch_array($res)) {
            $t = $row[0];
            if ($t !== '' && !in_array($t, $names, true)) $names[] = $t;
        }
    }
    return $names;
}

// 테이블의 컬럼 구조를 보고 역할별 컬럼을 추정
function uph_table_meta($t) {
    $cols = array();
    $res = sql_query(" SHOW COLUMNS FROM `{$t}` ", false);
    if (!$res) return null;
    while ($c = sql_fetch_array($res)) $cols[] = $c[0];
    if (!$cols) return null;

    $low = array_map('strtolower', $cols);
    $pick = function($exact, $contains) use ($cols, $low) {
        foreach ($exact as $e) {
            $k = array_search(strtolower($e), $low, true);
            if ($k !== false) return $cols[$k];
        }
        foreach ($contains as $n) {
            foreach ($low as $i => $c) if (strpos($c, $n) !== false) return $cols[$i];
        }
        return '';
    };

    $m = array('table' => $t, 'cols' => $cols, 'use_flag' => false);
    $m['bo']   = $pick(array('bo_table'),                                      array('bo_table'));
    $m['wr']   = $pick(array('wr_id'),                                         array('wr_id'));
    $m['mb']   = $pick(array('mb_id'),                                         array('mb_id'));
    $m['dt']   = $pick(array('bg_datetime','lk_datetime','wr_datetime','datetime','reg_date'), array('datetime','_date','_time'));
    $m['ip']   = $pick(array('mb_ip','bg_ip','lk_ip','wr_ip'),                 array('_ip'));
    $m['flag'] = $pick(array('bg_flag','lk_flag','flag'),                      array('flag'));

    if (!$m['bo'] || !$m['wr']) return null;   // 게시판/글번호 구분이 안 되면 후보에서 제외
    return $m;
}

function uph_like_where($m, $bo_table, $wr_id) {
    $w = " `{$m['bo']}` = '".sql_escape_string($bo_table)."' and `{$m['wr']}` = '".(int)$wr_id."' ";
    if (!empty($m['use_flag']) && $m['flag']) {
        $w .= " and `{$m['flag']}` in ('good','like','1','y','Y') ";
    }
    return $w;
}

function uph_like_count_of($m, $bo_table, $wr_id) {
    $row = sql_fetch(" select count(*) as cnt from `{$m['table']}` where ".uph_like_where($m, $bo_table, $wr_id), false);
    return $row ? (int)$row['cnt'] : -1;
}

/* $expected(= get_like_count 결과) 와 개수가 일치하는 테이블을 찾아서 돌려줍니다.
   찾지 못하면 null. $force = true 면 세션 캐시를 무시하고 다시 탐지합니다. */
function uph_like_meta($bo_table, $wr_id, $expected, $force = false) {
    $key = 'uph_like_meta';

    if (!$force && !empty($_SESSION[$key]['table'])) {
        $m = $_SESSION[$key];
        if (uph_like_count_of($m, $bo_table, $wr_id) === (int)$expected) return $m;
    }

    foreach (uph_like_candidates() as $t) {
        $base = uph_table_meta($t);
        if (!$base) continue;

        $tries = array($base);
        if ($base['flag']) { $f = $base; $f['use_flag'] = true; $tries[] = $f; }

        foreach ($tries as $m) {
            if (uph_like_count_of($m, $bo_table, $wr_id) === (int)$expected) {
                $_SESSION[$key] = $m;
                return $m;
            }
        }
    }
    return null;
}

/* 현재 접속자가 이 게시판의 관리자인지 */
function uph_is_board_admin($board) {
    global $member, $g5;
    if (empty($member['mb_id'])) return false;
    if ((int)($member['mb_level'] ?? 0) >= 10) return true;
    if (!empty($board['bo_admin']) && $board['bo_admin'] === $member['mb_id']) return true;
    if (!empty($board['gr_id'])) {
        $grp = sql_fetch(" select gr_admin from {$g5['group_table']} where gr_id = '".sql_escape_string($board['gr_id'])."' ", false);
        if ($grp && !empty($grp['gr_admin']) && $grp['gr_admin'] === $member['mb_id']) return true;
    }
    return false;
}

/* 회원 표시 이름 — 라공에디션은 mb_nick 이 없을 수 있어 단계별로 폴백 */
function uph_member_name($mb_id) {
    $mem = get_member($mb_id);
    foreach (array('mb_nick', 'mb_name', 'mb_id') as $k) {
        if (!empty($mem[$k])) return $mem[$k];
    }
    return $mb_id;
}
?>
