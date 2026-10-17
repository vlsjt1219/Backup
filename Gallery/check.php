<?php
/* =========================================================================
   u_photo 스킨 점검 / 정리 도구  (관리자 전용)
   목록 하단의 ☑ 버튼으로 들어옵니다.

   · 게시판 관리 설정이 실제로 어떻게 적용되는지 확인
   · 여분 컬럼(wr_text 등) 존재 확인 및 1회 생성
   · 좋아요(하트) 기록 테이블 자동 탐지 결과 확인
   · 썸네일 캐시 용량 확인 및 비우기
   ========================================================================= */
include_once(__DIR__.'/_lib.php');
include_once(__DIR__.'/webp.lib.php');

$bo_table = preg_replace('/[^a-zA-Z0-9_]/', '', (string)($_REQUEST['bo_table'] ?? ''));
if ($bo_table === '') { exit('bo_table 이 필요합니다.'); }

$board = get_board_db($bo_table);
if (!$board || empty($board['bo_table'])) { exit('게시판을 찾을 수 없습니다.'); }

if (!uph_is_board_admin($board)) {
    exit('이 게시판의 관리자만 사용할 수 있습니다.');
}

$write_table = $g5['write_prefix'].$bo_table;
$msg = array();

// --- CSRF 토큰 ---
$token = get_session('ss_uph_token');
if (!$token) { $token = md5(uniqid('', true)); set_session('ss_uph_token', $token); }

$posted_ok = ($_SERVER['REQUEST_METHOD'] === 'POST' && hash_equals((string)$token, (string)($_POST['token'] ?? '')));
$act = $posted_ok ? (string)($_POST['act'] ?? '') : '';

// --- 여분 컬럼 정의 ---
$need_cols = array(
    'wr_text'       => "ALTER TABLE `{$write_table}` ADD `wr_text` TEXT NOT NULL",
    'wr_video'      => "ALTER TABLE `{$write_table}` ADD `wr_video` TEXT NOT NULL",
    'wr_protect'    => "ALTER TABLE `{$write_table}` ADD `wr_protect` VARCHAR(255) NOT NULL DEFAULT ''",
    'wr_reply_more' => "ALTER TABLE `{$write_table}` ADD `wr_reply_more` INT(11) NOT NULL DEFAULT '0'",
);

// --- 썸네일 캐시 경로 ---
$thumb_dir = G5_DATA_PATH.'/file/'.$bo_table;

// =====================  동작 처리  =====================
if ($act === 'addcols') {
    foreach ($need_cols as $col => $alter) {
        $exists = sql_fetch(" SHOW COLUMNS FROM `{$write_table}` LIKE '{$col}' ", false);
        if ($exists) { $msg[] = "· {$col} : 이미 있음"; continue; }
        $r = sql_query($alter, false);
        $msg[] = "· {$col} : ".($r ? '추가 완료' : '추가 실패 (권한/구문 확인 필요)');
    }
}
else if ($act === 'clearthumb') {
    $n = 0; $bytes = 0;
    foreach ((array)glob($thumb_dir.'/thumb-*') as $f) {
        if (!is_file($f)) continue;
        $bytes += @filesize($f);
        if (@unlink($f)) $n++;
    }
    $msg[] = "썸네일 ".number_format($n)."개 삭제 (".number_format(round($bytes/1024))." KB 확보)";
    $msg[] = "목록을 새로고침하면 현재 설정 크기로 다시 생성됩니다.";
}
else if ($act === 'relike') {
    unset($_SESSION['uph_like_meta']);
    $msg[] = "좋아요 테이블 탐지 결과를 초기화했습니다.";
}

// =====================  현재 설정 계산  =====================
$bo_width_raw = trim((string)($board['bo_table_width'] ?? ''));
if ($bo_width_raw === '' || (float)$bo_width_raw <= 0)      $width_css = '700px (미지정 → 기본값)';
else if ((float)$bo_width_raw > 100)                        $width_css = (int)$bo_width_raw.'px';
else                                                        $width_css = rtrim(rtrim(sprintf('%.2f', (float)$bo_width_raw), '0'), '.').'%';

$gw = (int)($board['bo_gallery_width']  ?? 0);
$gh = (int)($board['bo_gallery_height'] ?? 0);
$tw = $gw > 19 ? $gw : 350;
$th = $gh > 19 ? $gh : 450;
$cols = (int)($board['bo_gallery_cols'] ?? 0); if ($cols < 1) $cols = 5; if ($cols > 12) $cols = 12;
$upload_cnt = array_key_exists('bo_upload_count', $board) ? (int)$board['bo_upload_count'] : 10;

// 카드 표시 크기 계산
$fixed_mode = ($gw > 0 && $gh > 0);
$px_width   = ((float)$bo_width_raw > 100) ? (int)$bo_width_raw : 0;   // % 폭이면 화면에 따라 달라짐
$row_need   = $tw * $cols + ($cols - 1) * 10;                            // 한 줄에 필요한 폭
$cell_px    = (int)floor((($px_width ?: 700) - ($cols - 1) * 10) / max(1, $cols));

// 썸네일 캐시 현황
$thumb_n = 0; $thumb_bytes = 0;
foreach ((array)glob($thumb_dir.'/thumb-*') as $f) {
    if (!is_file($f)) continue;
    $thumb_n++; $thumb_bytes += (int)@filesize($f);
}

// 컬럼 현황
$col_state = array();
foreach ($need_cols as $col => $alter) {
    $col_state[$col] = (bool)sql_fetch(" SHOW COLUMNS FROM `{$write_table}` LIKE '{$col}' ", false);
}
$missing_cols = count(array_filter($col_state, function($v) { return !$v; }));

// 좋아요 테이블 탐지
$like_report = array('found' => null, 'sample_wr' => 0, 'sample_cnt' => 0, 'cands' => array());
if (function_exists('get_like_count')) {
    if (function_exists('init_like_table')) init_like_table();
    $rs = sql_query(" select wr_id from `{$write_table}` where wr_is_comment = 0 order by wr_id desc limit 50 ", false);
    if ($rs) {
        while ($row = sql_fetch_array($rs)) {
            $c = (int)get_like_count($bo_table, $row['wr_id']);
            if ($c > 0) { $like_report['sample_wr'] = (int)$row['wr_id']; $like_report['sample_cnt'] = $c; break; }
        }
    }
    if ($like_report['sample_wr']) {
        $like_report['found'] = uph_like_meta($bo_table, $like_report['sample_wr'], $like_report['sample_cnt'], true);
    }
    $like_report['cands'] = uph_like_candidates();
}

// WebP 변환 현황
$webp_ok    = uph_webp_supported();
$exif_ok    = function_exists('exif_read_data');
$img_ext    = strtolower((string)($config['cf_image_extension'] ?? ''));
$ext_has_wp = (bool)preg_match('/(^|\|)webp(\||$)/', $img_ext);
$fmt = array('webp' => 0, 'jpg' => 0, 'png' => 0, 'gif' => 0, 'etc' => 0);
$fmt_bytes = array('webp' => 0, 'other' => 0);
$fr = sql_query(" select bf_file, bf_filesize from {$g5['board_file_table']}
                   where bo_table = '".sql_escape_string($bo_table)."' and bf_file <> '' ", false);
if ($fr) {
    while ($row = sql_fetch_array($fr)) {
        $e = strtolower(pathinfo($row['bf_file'], PATHINFO_EXTENSION));
        if ($e === 'jpeg') $e = 'jpg';
        $k = isset($fmt[$e]) ? $e : 'etc';
        $fmt[$k]++;
        $fmt_bytes[$k === 'webp' ? 'webp' : 'other'] += (int)$row['bf_filesize'];
    }
}

// 정리 대상(옛 파일) 확인
$legacy = array();
foreach (array('upload_file.php', 'write_update.inc.php') as $f) {
    if (file_exists(__DIR__.'/'.$f)) $legacy[] = $f;
}
foreach (array('txtggu') as $d) {
    if (is_dir(__DIR__.'/'.$d)) $legacy[] = $d.'/ (폴더)';
}

function uph_h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function uph_kb($b) { return $b >= 1048576 ? number_format($b/1048576, 1).' MB' : number_format($b/1024).' KB'; }
?><!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>u_photo 스킨 점검 — <?php echo uph_h($board['bo_subject']) ?></title>
<style>
* { box-sizing: border-box; }
body { margin:0; padding:30px 16px 80px; background:#f6f7f9; color:#333;
       font-family:-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif; font-size:13px; line-height:1.7; }
.wrap { max-width:720px; margin:0 auto; }
h1 { font-size:17px; margin:0 0 4px; }
.sub { color:#999; font-size:12px; margin-bottom:22px; }
.card { background:#fff; border:1px solid #e9e9ee; border-radius:12px; padding:18px 20px; margin-bottom:14px; }
.card h2 { font-size:13px; margin:0 0 12px; color:#444; letter-spacing:-0.3px; }
table { width:100%; border-collapse:collapse; }
th, td { text-align:left; padding:6px 0; border-bottom:1px solid #f4f4f6; vertical-align:top; }
th { width:38%; color:#888; font-weight:normal; }
tr:last-child th, tr:last-child td { border-bottom:none; }
.ok   { color:#3a9a6a; }
.warn { color:#d08a2c; }
.bad  { color:#c0564e; }
code { background:#f4f4f7; padding:1px 5px; border-radius:4px; font-size:12px; }
button { background:#4a5568; color:#fff; border:none; border-radius:8px; padding:8px 16px;
         font-size:12px; cursor:pointer; font-family:inherit; }
button:hover { background:#2d3748; }
button.ghost { background:#fff; color:#666; border:1px solid #ddd; }
button.ghost:hover { background:#f4f4f7; color:#222; }
.note { color:#999; font-size:11.5px; margin-top:8px; }
.msg { background:#eef6f1; border:1px solid #cfe5da; color:#2f6b4f; border-radius:10px;
       padding:12px 16px; margin-bottom:14px; white-space:pre-line; }
.back { display:inline-block; margin-top:6px; color:#888; text-decoration:none; font-size:12px; }
.back:hover { color:#333; text-decoration:underline; }
ul.plain { margin:6px 0 0; padding-left:18px; color:#777; }
</style>
</head>
<body>
<div class="wrap">

<h1>☑ u_photo 스킨 점검</h1>
<div class="sub"><?php echo uph_h($board['bo_subject']) ?> (<code><?php echo uph_h($bo_table) ?></code>)</div>

<?php if ($msg) { ?>
<div class="msg"><?php echo uph_h(implode("\n", $msg)) ?></div>
<?php } ?>

<!-- 1. 설정 적용 현황 -->
<div class="card">
    <h2>1. 지금 적용 중인 설정</h2>
    <table>
        <tr><th>게시판 폭 지정</th><td><code><?php echo uph_h($bo_width_raw === '' ? '(비어 있음)' : $bo_width_raw) ?></code> → <strong><?php echo uph_h($width_css) ?></strong><div class="note">100 이하는 %, 100 초과는 px 로 해석합니다.</div></td></tr>
        <tr><th>갤러리 이미지 폭 / 높이</th><td><strong><?php echo $tw ?> × <?php echo $th ?></strong><?php if (!$gw || !$gh) { ?> <span class="warn">(미지정 → 기본값, 카드 비율은 기존 160% 유지)</span><?php } ?></td></tr>
        <tr><th>갤러리 이미지 수</th><td><strong><?php echo $cols ?>칸</strong> · 태블릿 <?php echo min($cols,3) ?>칸 · 모바일 <?php echo min($cols,2) ?>칸</td></tr>
        <tr><th>업로드 개수</th><td><strong><?php echo $upload_cnt ?>개</strong><?php if ($upload_cnt < 1) { ?> <span class="bad">(0이면 파일 첨부가 막히고 URL 방식만 쓸 수 있습니다)</span><?php } ?></td></tr>
        <tr><th>카드 표시 크기</th><td>
            <?php if ($fixed_mode) { ?>
                <strong><?php echo $tw ?> × <?php echo $th ?>px 고정</strong> <span class="ok">(설정값 그대로)</span>
                <div class="note">한 줄 <?php echo $cols ?>칸에 필요한 폭은 <?php echo number_format($row_need) ?>px 입니다.
                <?php if ($px_width && $row_need > $px_width) { ?><span class="warn">게시판 폭(<?php echo $px_width ?>px)보다 넓어서 카드가 비율을 유지한 채 약 <?php echo $cell_px ?>px 로 줄어듭니다.</span>
                <?php } else if ($px_width) { ?>게시판 폭(<?php echo $px_width ?>px) 안에 들어가며 남는 공간은 가운데 정렬됩니다.
                <?php } else { ?>게시판 폭이 % 이므로 화면이 좁으면 비율을 유지하며 줄어듭니다.<?php } ?></div>
            <?php } else { ?>
                칸 폭에 맞춰 늘어나는 방식 (약 <?php echo $cell_px ?>px · 세로 160%)
                <div class="note">갤러리 이미지 폭과 높이를 <strong>둘 다</strong> 입력하면 그 px 크기로 고정됩니다.</div>
            <?php } ?>
        </td></tr>
    </table>
    <div class="note">값을 바꾸려면 <a href="<?php echo G5_ADMIN_URL ?>/board_form.php?bo_table=<?php echo urlencode($bo_table) ?>&amp;w=u" target="_blank" rel="noopener">게시판 관리</a>에서 수정한 뒤, 아래 3번에서 썸네일 캐시를 비우세요.</div>
</div>

<!-- 2. 여분 컬럼 -->
<div class="card">
    <h2>2. 여분 컬럼</h2>
    <table>
        <?php foreach ($col_state as $col => $exists) { ?>
        <tr><th><code><?php echo uph_h($col) ?></code></th>
            <td><?php echo $exists ? '<span class="ok">있음</span>' : '<span class="warn">없음</span>' ?></td></tr>
        <?php } ?>
    </table>
    <div class="note">
        이 스킨의 글쓰기 폼은 위 컬럼을 사용하지 않으므로 <strong>없어도 정상 동작</strong>합니다.
        예전 버전에서 넘어왔거나 다른 스킨과 같은 게시판을 함께 쓸 때만 추가하세요.
    </div>
    <?php if ($missing_cols) { ?>
    <form method="post" style="margin-top:12px;" onsubmit="return confirm('테이블 구조를 변경합니다. 진행할까요?');">
        <input type="hidden" name="bo_table" value="<?php echo uph_h($bo_table) ?>">
        <input type="hidden" name="token" value="<?php echo uph_h($token) ?>">
        <input type="hidden" name="act" value="addcols">
        <button type="submit">없는 컬럼 추가하기</button>
    </form>
    <?php } ?>
</div>

<!-- 3. 썸네일 캐시 -->
<div class="card">
    <h2>3. 썸네일 캐시</h2>
    <table>
        <tr><th>경로</th><td><code><?php echo uph_h(str_replace(G5_PATH, '', $thumb_dir)) ?></code></td></tr>
        <tr><th>파일 수 / 용량</th><td><strong><?php echo number_format($thumb_n) ?>개 · <?php echo uph_kb($thumb_bytes) ?></strong></td></tr>
    </table>
    <div class="note">썸네일 크기 설정을 바꾼 뒤에는 비워야 새 크기로 다시 만들어집니다. 원본 이미지는 지워지지 않습니다.</div>
    <?php if ($thumb_n) { ?>
    <form method="post" style="margin-top:12px;" onsubmit="return confirm('<?php echo number_format($thumb_n) ?>개의 썸네일을 삭제합니다. (원본은 그대로)');">
        <input type="hidden" name="bo_table" value="<?php echo uph_h($bo_table) ?>">
        <input type="hidden" name="token" value="<?php echo uph_h($token) ?>">
        <input type="hidden" name="act" value="clearthumb">
        <button type="submit" class="ghost">썸네일 캐시 비우기</button>
    </form>
    <?php } ?>
</div>

<!-- WebP -->
<div class="card">
    <h2>3-1. WebP 자동 변환</h2>
    <table>
        <tr><th>서버 WebP 변환</th><td><?php echo $webp_ok ? '<span class="ok">가능</span>' : '<span class="bad">불가 — 브라우저 변환만 동작합니다 (아이폰 사파리에서 올린 사진은 원본 유지)</span>' ?></td></tr>
        <tr><th>사진 회전 정보(EXIF) 읽기</th><td><?php echo $exif_ok ? '<span class="ok">가능</span>' : '<span class="warn">불가 — 서버 변환 시 일부 휴대폰 사진이 옆으로 누울 수 있습니다</span>' ?></td></tr>
        <tr><th>메모리 한도</th><td><code><?php echo uph_h(ini_get('memory_limit')) ?></code></td></tr>
        <tr><th>변환 설정</th><td>화질 <strong><?php echo (int)UPH_WEBP_QUALITY ?></strong> · 긴 변 최대 <strong><?php echo UPH_WEBP_MAX_EDGE ? (int)UPH_WEBP_MAX_EDGE.'px' : '제한 없음' ?></strong>
            <div class="note">webp.lib.php 맨 위 두 줄에서 바꿀 수 있습니다.</div></td></tr>
        <tr><th>환경설정 이미지 확장자</th><td><code><?php echo uph_h($img_ext ?: '(비어 있음)') ?></code>
            <?php if ($ext_has_wp) { ?> <span class="ok">webp 포함</span>
            <?php } else { ?><div class="note warn">webp 가 없습니다. 스킨이 자체 썸네일을 만들어 목록은 정상 표시되지만, 그누보드가 WebP 를 "이미지"로 인식하게 하려면
            <a href="<?php echo G5_ADMIN_URL ?>/config_form.php" target="_blank" rel="noopener">환경설정 → 기본환경설정</a>의 이미지 업로드 확장자 끝에 <code>|webp</code> 를 추가하세요.</div><?php } ?></td></tr>
        <tr><th>이 게시판 첨부 현황</th><td>WebP <strong><?php echo number_format($fmt['webp']) ?></strong> · JPG <?php echo number_format($fmt['jpg']) ?> · PNG <?php echo number_format($fmt['png']) ?> · GIF <?php echo number_format($fmt['gif']) ?><?php if ($fmt['etc']) { ?> · 기타 <?php echo number_format($fmt['etc']) ?><?php } ?>
            <div class="note">WebP <?php echo uph_kb($fmt_bytes['webp']) ?> / 그 외 <?php echo uph_kb($fmt_bytes['other']) ?> · 새로 올리는 이미지부터 변환됩니다. (GIF 는 움짤 보호를 위해 변환하지 않음)</div></td></tr>
    </table>
</div>

<!-- 4. 하트 기록 테이블 -->
<div class="card">
    <h2>4. 하트 기록 테이블</h2>
    <?php if (!function_exists('get_like_count')) { ?>
        <div class="bad">이 사이트에서 좋아요 함수를 찾을 수 없습니다. 하트 기능 자체가 동작하지 않습니다.</div>
    <?php } else if (!$like_report['sample_wr']) { ?>
        <div class="warn">최근 글 50개 중 하트가 눌린 글이 없어 탐지할 수 없습니다. 아무 글에나 하트를 한 번 누른 뒤 다시 열어 보세요.</div>
    <?php } else if (!$like_report['found']) { ?>
        <div class="bad">기록 테이블을 찾지 못했습니다. (기준 글 <?php echo $like_report['sample_wr'] ?>번 · 하트 <?php echo $like_report['sample_cnt'] ?>개)</div>
        <div class="note">아래 후보 테이블 중 하트를 저장하는 것이 있다면 알려 주세요. 없다면 좋아요 기능이 별도 저장소를 쓰는 구조입니다.</div>
        <ul class="plain">
            <?php foreach ($like_report['cands'] as $c) { ?><li><code><?php echo uph_h($c) ?></code></li><?php } ?>
            <?php if (!$like_report['cands']) { ?><li>후보 없음</li><?php } ?>
        </ul>
    <?php } else { $f = $like_report['found']; ?>
        <table>
            <tr><th>테이블</th><td><code><?php echo uph_h($f['table']) ?></code> <span class="ok">확인됨</span></td></tr>
            <tr><th>게시판 / 글번호 컬럼</th><td><code><?php echo uph_h($f['bo']) ?></code> · <code><?php echo uph_h($f['wr']) ?></code></td></tr>
            <tr><th>회원 컬럼</th><td><?php echo $f['mb'] ? '<code>'.uph_h($f['mb']).'</code>' : '<span class="warn">없음 — 전부 &ldquo;외부인&rdquo;으로 표시됩니다</span>' ?></td></tr>
            <tr><th>날짜 컬럼</th><td><?php echo $f['dt'] ? '<code>'.uph_h($f['dt']).'</code>' : '<span class="warn">없음 — 누른 시각은 표시되지 않습니다</span>' ?></td></tr>
            <?php if ($f['flag']) { ?>
            <tr><th>구분 컬럼</th><td><code><?php echo uph_h($f['flag']) ?></code> <?php echo $f['use_flag'] ? '(값 필터 적용)' : '(필터 없이 전체 집계)' ?></td></tr>
            <?php } ?>
            <tr><th>검증 기준</th><td><?php echo $like_report['sample_wr'] ?>번 글 · 하트 <?php echo $like_report['sample_cnt'] ?>개와 일치</td></tr>
        </table>
    <?php } ?>
    <form method="post" style="margin-top:12px;">
        <input type="hidden" name="bo_table" value="<?php echo uph_h($bo_table) ?>">
        <input type="hidden" name="token" value="<?php echo uph_h($token) ?>">
        <input type="hidden" name="act" value="relike">
        <button type="submit" class="ghost">탐지 결과 다시 찾기</button>
    </form>
</div>

<!-- 5. 정리 대상 -->
<div class="card">
    <h2>5. 정리 대상 파일</h2>
    <?php if ($legacy) { ?>
        <div class="warn">아래 파일/폴더는 이제 사용하지 않습니다. 지워도 됩니다.</div>
        <ul class="plain">
            <?php foreach ($legacy as $l) { ?><li><code><?php echo uph_h($l) ?></code></li><?php } ?>
        </ul>
    <?php } else { ?>
        <div class="ok">정리할 파일이 없습니다.</div>
    <?php } ?>
</div>

<a class="back" href="<?php echo G5_BBS_URL ?>/board.php?bo_table=<?php echo urlencode($bo_table) ?>">← 게시판으로 돌아가기</a>

</div>
</body>
</html>
