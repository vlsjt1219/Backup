<?php
if (!defined("_GNUBOARD_")) exit; // 개별 페이지 접근 불가

/* 이 스킨은 목록에서 모달로 글을 보여주므로 view 는 목록으로 되돌립니다.
   원본은 board.php?...&log=N 으로 보냈지만 목록 쪽에서 log 값을 쓰지 않아
   항상 1페이지로만 이동했습니다. 여기서는 해당 글이 실제로 있는 페이지를
   계산해서 이동하고, log_id 로 그 글의 모달을 자동으로 열어 줍니다. */

$wr_id = (int)$wr_id;   // 보안: 정수 강제 (SQL 인젝션 방지)

if ($wr_id) {

    $target_page = 1;
    $row = sql_fetch(" select wr_num, wr_reply from {$write_table} where wr_id = '{$wr_id}' ");

    if ($row) {
        // 한 페이지에 보여줄 글 수
        $page_rows = 0;
        if (defined('G5_IS_MOBILE') && G5_IS_MOBILE && !empty($board['bo_mobile_page_rows'])) {
            $page_rows = (int)$board['bo_mobile_page_rows'];
        }
        if ($page_rows < 1) $page_rows = (int)($board['bo_page_rows'] ?? 0);
        if ($page_rows < 1) $page_rows = (int)($config['cf_page_rows'] ?? 0);
        if ($page_rows < 1) $page_rows = 10;

        // 공지글은 목록의 일반 글 순서에서 빠지므로 계산에서 제외
        $notice_ids = array();
        if (!empty($board['bo_notice'])) {
            foreach (explode(',', trim($board['bo_notice'])) as $nid) {
                $nid = (int)$nid;
                if ($nid) $notice_ids[] = $nid;
            }
        }

        if (in_array($wr_id, $notice_ids, true)) {
            $target_page = 1;   // 공지글은 1페이지 상단
        } else {
            $notice_sql = count($notice_ids) ? " and wr_id not in (".implode(',', $notice_ids).") " : "";
            $num        = (int)$row['wr_num'];
            $reply      = sql_escape_string($row['wr_reply']);

            $cnt = sql_fetch(" select count(*) as cnt
                                 from {$write_table}
                                where wr_is_comment = 0
                                  {$notice_sql}
                                  and ( wr_num < '{$num}'
                                        or ( wr_num = '{$num}' and wr_reply <= '{$reply}' ) ) ");
            $pos = isset($cnt['cnt']) ? (int)$cnt['cnt'] : 1;
            if ($pos < 1) $pos = 1;
            $target_page = (int)ceil($pos / $page_rows);
            if ($target_page < 1) $target_page = 1;
        }
    }

    goto_url(G5_BBS_URL.'/board.php?bo_table='.$bo_table.'&page='.$target_page.'&log_id='.$wr_id);
}
?>
