<?php
if (!defined('_GNUBOARD_')) exit; // 개별 페이지 접근 불가

include_once($board_skin_path.'/upload_file.php');

/* PHP 8 대응: 모든 외부 입력은 기본값을 보장하고,
   SQL 에 넣는 값은 반드시 sql_escape_string() / (int) 로 처리합니다.
   또 "폼이 실제로 보낸 항목만" 업데이트하도록 바꿔서,
   그누보드 write_update.php 가 이미 저장해 둔 값(wr_option 등)을
   빈 값으로 덮어쓰지 않게 했습니다. */

$cookie = $_POST['cookie'] ?? '';
if ($cookie) {
	setcookie('MMB_PW',   $_POST['wr_password'] ?? '', time() + 2678400, '/');
	setcookie('MMB_NAME', $_POST['wr_name']     ?? '', time() + 2678400, '/');
} else {
	setcookie('MMB_PW',   '', time() - 3600, '/');
	setcookie('MMB_NAME', '', time() - 3600, '/');
}

$customer_sql = "";

// --- 공개범위 / HTML / 보호 옵션 (폼이 보낸 경우에만 반영) ---
if (($w ?? '') != 'c' && ($w ?? '') != 'cu' && (isset($_POST['set_secret']) || isset($_POST['wr_protect']))) {

	$set_secret = $_POST['set_secret'] ?? '';
	$html       = $_POST['html']       ?? '';
	$wr_protect = $_POST['wr_protect'] ?? '';

	$sec = "";
	$mem = 0;
	if ($set_secret) {
		if ($set_secret == 'secret')      { $sec = "secret"; }
		else if ($set_secret == 'member') { $mem = 1; }
	}

	$customer_sql .= " ,wr_option = '".sql_escape_string($html.','.$sec)."'"
	               . " ,wr_secret = '".(int)$mem."'"
	               . " ,wr_protect = '".sql_escape_string($wr_protect)."'";
}

// --- 주사위 ---
if (($_POST['game'] ?? '') == "dice") {
	$customer_sql .= " , wr_dice1 = '".rand(1, 6)."', wr_dice2 = '".rand(1, 6)."'";
}

/* --- 여분 컬럼 자동 생성 -------------------------------------------------
   글을 쓸 때마다 SHOW COLUMNS 4번이 돌지 않도록 요청당 1회만 실행합니다.
   (원본은 전역 스코프에서 static 을 써서 opcache 설정에 따라
    중복 실행되거나 반대로 동작하지 않을 수 있었습니다) */
if (empty($GLOBALS['u_photo_cols_checked'])) {
	$GLOBALS['u_photo_cols_checked'] = true;

	$need_cols = array(
		'wr_video'      => "ALTER TABLE `{$write_table}` ADD `wr_video` TEXT NOT NULL AFTER `wr_url`",
		'wr_text'       => "ALTER TABLE `{$write_table}` ADD `wr_text` TEXT NOT NULL AFTER `wr_url`",
		'wr_protect'    => "ALTER TABLE `{$write_table}` ADD `wr_protect` VARCHAR(255) NOT NULL DEFAULT '' AFTER `wr_url`",
		'wr_reply_more' => "ALTER TABLE `{$write_table}` ADD `wr_reply_more` INT(11) NOT NULL DEFAULT '0' AFTER `wr_plip`",
	);
	foreach ($need_cols as $col => $alter_sql) {
		$check = sql_fetch(" SHOW COLUMNS FROM `{$write_table}` LIKE '{$col}' ");
		if (!$check) sql_query($alter_sql, false);   // 실패해도 글쓰기는 계속 진행
	}
}

// --- 여분 필드: 폼이 보낸 것만 저장 (MySQL strict 모드에서 int 컬럼에 '' 넣는 오류 방지) ---
if (isset($_POST['wr_reply_more'])) {
	$customer_sql .= " ,wr_reply_more = '".(int)$_POST['wr_reply_more']."'";
}
if (isset($_POST['wr_video'])) {
	$customer_sql .= " ,wr_video = '".sql_escape_string($_POST['wr_video'])."'";
}
if (isset($_POST['wr_text'])) {
	$customer_sql .= " ,wr_text = '".sql_escape_string($_POST['wr_text'])."'";
}
?>
