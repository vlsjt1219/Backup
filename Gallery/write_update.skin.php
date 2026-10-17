<?php
if (!defined("_GNUBOARD_")) exit; // 개별 페이지 접근 불가

/* 이 스킨의 글쓰기 폼이 보내는 항목(제목·분류·wr_type·wr_url·첨부·내용)은
   모두 라공에디션의 write_update.php 가 직접 저장합니다.
   여기서는 첨부 이미지의 WebP 변환과 이동만 처리합니다.
   (여분 컬럼 점검은 스킨의 check.php — 목록 하단 ☑ 버튼으로 옮겼습니다) */

$wr_id = (int)$wr_id;

/* 첨부 이미지 WebP 변환
   - 대부분은 글쓰기 화면(브라우저)에서 이미 WebP 로 바뀌어 올라오므로 건너뜁니다.
   - 브라우저가 WebP 를 못 만드는 경우(아이폰 사파리 등)만 여기서 처리됩니다.
   - 어떤 오류가 나도 글 저장 자체에는 영향이 없도록 감쌌습니다. */
if ($wr_id && file_exists($board_skin_path.'/webp.lib.php')) {
	include_once($board_skin_path.'/webp.lib.php');
	try {
		uph_webp_board_files($bo_table, $wr_id);
	} catch (Throwable $e) {
		// 변환 실패 시 원본 그대로 둠
	}
}

if (!empty($file_upload_msg)) {
	alert($file_upload_msg, G5_HTTP_BBS_URL.'/board.php?bo_table='.$bo_table);
} else {
	// 저장한 글의 모달이 바로 열리도록 log_id 를 붙여서 이동
	goto_url(G5_HTTP_BBS_URL.'/board.php?bo_table='.$bo_table.'&log_id='.$wr_id);
}
?>
