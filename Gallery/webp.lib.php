<?php
if (!defined('_GNUBOARD_')) exit;

/* =========================================================================
   u_photo — WebP 변환 라이브러리 (서버 쪽)

   · 글 저장 직후 이 글의 첨부 이미지(JPG / PNG / BMP)를 WebP 로 바꿉니다.
     - 브라우저가 이미 WebP 로 바꿔서 올린 파일은 건드리지 않습니다.
     - GIF 는 움짤이 깨지므로 변환하지 않습니다.
     - 변환 결과가 원본보다 크면 원본을 그대로 둡니다.
   · 그누보드 썸네일 함수가 WebP 원본을 못 읽는 버전이라도
     목록 썸네일이 나오도록 WebP 썸네일을 직접 만들어 줍니다.

   아래 두 값은 write.skin.php 의 브라우저 변환에도 똑같이 적용됩니다.
   ========================================================================= */
if (!defined('UPH_WEBP_QUALITY'))  define('UPH_WEBP_QUALITY', 82);    // 화질 (1~100). 80 전후가 용량 대비 무난
if (!defined('UPH_WEBP_MAX_EDGE')) define('UPH_WEBP_MAX_EDGE', 2048);  // 긴 변 최대 px. 0 이면 크기 그대로 유지

/* 서버에서 WebP 인코딩이 가능한지 */
if (!function_exists('uph_webp_supported')) {
function uph_webp_supported() {
    if (!function_exists('imagewebp') || !function_exists('imagecreatetruecolor')) return false;
    if (function_exists('gd_info')) {
        $gi = gd_info();
        if (isset($gi['WebP Support']) && !$gi['WebP Support']) return false;
    }
    return true;
}
}

/* memory_limit 을 바이트로 */
if (!function_exists('uph_mem_limit_bytes')) {
function uph_mem_limit_bytes() {
    $v = trim((string)ini_get('memory_limit'));
    if ($v === '' || $v === '-1') return -1;
    $n = (float)$v;
    switch (strtolower(substr($v, -1))) {
        case 'g': $n *= 1024;
        case 'm': $n *= 1024;
        case 'k': $n *= 1024;
    }
    return (int)$n;
}
}

/* w×h 이미지를 다룰 메모리가 있는지 확인하고, 모자라면 한도를 올려 봄 */
if (!function_exists('uph_memory_ok')) {
function uph_memory_ok($w, $h) {
    $need  = (int)($w * $h * 4 * 2.6) + 12 * 1048576;    // 원본 + 결과 + 회전 여유
    $limit = uph_mem_limit_bytes();
    if ($limit < 0) return true;
    $used = memory_get_usage(true);
    if ($used + $need <= $limit) return true;

    $want = (int)ceil(($used + $need) / 1048576) + 8;
    @ini_set('memory_limit', $want.'M');
    $limit = uph_mem_limit_bytes();
    return ($limit < 0 || $used + $need <= $limit);
}
}

/* 이미지 불러오기 (JPEG 는 사진의 회전 정보까지 반영) */
if (!function_exists('uph_load_image')) {
function uph_load_image($path, $type) {
    $im = false;
    switch ($type) {
        case IMAGETYPE_JPEG: $im = @imagecreatefromjpeg($path); break;
        case IMAGETYPE_PNG:  $im = @imagecreatefrompng($path);  break;
        case IMAGETYPE_BMP:  $im = function_exists('imagecreatefrombmp')  ? @imagecreatefrombmp($path)  : false; break;
        case IMAGETYPE_WEBP: $im = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : false; break;
    }
    if (!$im) return false;

    // 휴대폰 사진은 픽셀은 눕혀 두고 "회전 정보"만 따로 저장하는 경우가 많습니다.
    // GD 는 이걸 자동으로 반영하지 않아서 직접 돌려줘야 옆으로 누운 사진이 안 생깁니다.
    if ($type == IMAGETYPE_JPEG && function_exists('exif_read_data')) {
        $exif = @exif_read_data($path);
        $ori  = isset($exif['Orientation']) ? (int)$exif['Orientation'] : 1;
        $rot  = false;
        if ($ori == 3) $rot = @imagerotate($im, 180, 0);
        else if ($ori == 6) $rot = @imagerotate($im, -90, 0);
        else if ($ori == 8) $rot = @imagerotate($im, 90, 0);
        else if ($ori == 2 && function_exists('imageflip')) imageflip($im, IMG_FLIP_HORIZONTAL);
        else if ($ori == 4 && function_exists('imageflip')) imageflip($im, IMG_FLIP_VERTICAL);
        if ($rot) { imagedestroy($im); $im = $rot; }
    }
    return $im;
}
}

/* 투명 배경을 유지하는 트루컬러 캔버스 */
if (!function_exists('uph_new_canvas')) {
function uph_new_canvas($w, $h) {
    $dst = imagecreatetruecolor($w, $h);
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    $clear = imagecolorallocatealpha($dst, 0, 0, 0, 127);
    imagefilledrectangle($dst, 0, 0, $w, $h, $clear);
    return $dst;
}
}

/* 파일 하나를 WebP 로 변환. 성공하면 array(폭, 높이, 바이트), 실패/이득 없음이면 false */
if (!function_exists('uph_convert_to_webp')) {
function uph_convert_to_webp($src, $dst, $max_edge = UPH_WEBP_MAX_EDGE, $quality = UPH_WEBP_QUALITY) {
    $info = @getimagesize($src);
    if (!$info) return false;
    list($sw, $sh, $type) = $info;
    if (!in_array($type, array(IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_BMP), true)) return false;
    if (!uph_memory_ok($sw, $sh)) return false;

    $im = uph_load_image($src, $type);
    if (!$im) return false;
    $sw = imagesx($im); $sh = imagesy($im);      // 회전 후 크기

    $dw = $sw; $dh = $sh;
    if ($max_edge > 0 && max($sw, $sh) > $max_edge) {
        $scale = $max_edge / max($sw, $sh);
        $dw = max(1, (int)round($sw * $scale));
        $dh = max(1, (int)round($sh * $scale));
    }

    // 팔레트 PNG 는 WebP 로 바로 못 쓰므로 항상 트루컬러로 옮겨 담음
    $out = uph_new_canvas($dw, $dh);
    imagecopyresampled($out, $im, 0, 0, 0, 0, $dw, $dh, $sw, $sh);
    imagedestroy($im);

    $ok = @imagewebp($out, $dst, (int)$quality);
    imagedestroy($out);
    if (!$ok || !is_file($dst)) { @unlink($dst); return false; }

    clearstatcache(true, $dst);
    $new_size = (int)@filesize($dst);
    $old_size = (int)@filesize($src);
    if ($new_size < 1 || ($old_size > 0 && $new_size >= $old_size && $dw == $sw && $dh == $sh)) {
        @unlink($dst);            // 줄지 않았으면 원본 유지
        return false;
    }
    return array($dw, $dh, $new_size);
}
}

/* 글 하나의 첨부 이미지를 모두 WebP 로 교체 (DB 정보까지 갱신)
   반환: array('done'=>변환 수, 'saved'=>절약 바이트) */
if (!function_exists('uph_webp_board_files')) {
function uph_webp_board_files($bo_table, $wr_id) {
    global $g5;
    $stat = array('done' => 0, 'saved' => 0);
    if (!uph_webp_supported()) return $stat;

    $bo_esc = sql_escape_string($bo_table);
    $wr_id  = (int)$wr_id;
    $dir    = G5_DATA_PATH.'/file/'.$bo_table;

    $res = sql_query(" select * from {$g5['board_file_table']}
                        where bo_table = '{$bo_esc}' and wr_id = '{$wr_id}' and bf_file <> ''
                        order by bf_no ", false);
    if (!$res) return $stat;

    @set_time_limit(60);

    while ($f = sql_fetch_array($res)) {
        if (!empty($f['bf_storage']) || !empty($f['bf_fileurl'])) continue;   // 외부 저장소 파일 제외
        if (preg_match('/\.webp$/i', $f['bf_file'])) continue;                  // 이미 WebP
        if (!preg_match('/\.(jpe?g|png|bmp)$/i', $f['bf_file'])) continue;     // GIF·일반 파일 제외

        $src = $dir.'/'.$f['bf_file'];
        if (!is_file($src)) continue;

        $base = preg_replace('/\.[^.]+$/', '', $f['bf_file']);
        $new  = $base.'.webp';
        if (is_file($dir.'/'.$new)) $new = $base.'_'.substr(md5(uniqid('', true)), 0, 6).'.webp';
        $dst  = $dir.'/'.$new;

        $old_size = (int)@filesize($src);
        $r = uph_convert_to_webp($src, $dst);
        if (!$r) continue;
        list($nw, $nh, $nsize) = $r;

        if (defined('G5_FILE_PERMISSION')) @chmod($dst, G5_FILE_PERMISSION);

        $new_source = preg_replace('/\.[^.]+$/', '', (string)$f['bf_source']).'.webp';
        $ok = sql_query(" update {$g5['board_file_table']}
                             set bf_file     = '".sql_escape_string($new)."',
                                 bf_source   = '".sql_escape_string($new_source)."',
                                 bf_filesize = '{$nsize}',
                                 bf_width    = '".(int)$nw."',
                                 bf_height   = '".(int)$nh."',
                                 bf_type     = '".IMAGETYPE_WEBP."'
                           where bo_table = '{$bo_esc}' and wr_id = '{$wr_id}' and bf_no = '".(int)$f['bf_no']."' ", false);

        if (!$ok) { @unlink($dst); continue; }     // DB 갱신 실패 시 원본 유지

        // 원본과 원본 썸네일 정리
        @unlink($src);
        foreach ((array)glob($dir.'/thumb-'.$base.'_*') as $t) { if (is_file($t)) @unlink($t); }

        $stat['done']++;
        $stat['saved'] += max(0, $old_size - $nsize);
    }
    return $stat;
}
}

/* WebP 원본용 목록 썸네일 (그누보드 썸네일 함수가 WebP 를 못 읽을 때 대체)
   get_list_thumbnail() 과 같은 모양의 배열을 돌려줍니다. */
if (!function_exists('uph_webp_thumb')) {
function uph_webp_thumb($bo_table, $wr_id, $tw, $th) {
    global $g5;
    $empty = array('src' => '', 'ori' => '', 'alt' => '');
    if (!function_exists('imagecreatefromwebp') || !uph_webp_supported()) return $empty;

    $f = sql_fetch(" select bf_file from {$g5['board_file_table']}
                      where bo_table = '".sql_escape_string($bo_table)."' and wr_id = '".(int)$wr_id."'
                        and bf_file like '%.webp'
                      order by bf_no limit 1 ", false);
    if (!$f || empty($f['bf_file'])) return $empty;

    $dir  = G5_DATA_PATH.'/file/'.$bo_table;
    $url  = G5_DATA_URL.'/file/'.$bo_table;
    $src  = $dir.'/'.$f['bf_file'];
    if (!is_file($src)) return $empty;

    $tw = max(1, (int)$tw); $th = max(1, (int)$th);
    $base  = preg_replace('/\.[^.]+$/', '', $f['bf_file']);
    $tname = 'thumb-'.$base.'_'.$tw.'x'.$th.'.webp';
    $tpath = $dir.'/'.$tname;

    if (!is_file($tpath)) {
        $info = @getimagesize($src);
        if (!$info || !uph_memory_ok($info[0], $info[1])) {
            return array('src' => $url.'/'.$f['bf_file'], 'ori' => $url.'/'.$f['bf_file'], 'alt' => '');
        }
        $im = @imagecreatefromwebp($src);
        if (!$im) return $empty;

        $sw = imagesx($im); $sh = imagesy($im);
        // 가운데 기준으로 꽉 채우기(cover) 크롭
        $scale = max($tw / $sw, $th / $sh);
        $cw = (int)round($tw / $scale); $ch = (int)round($th / $scale);
        $cx = (int)floor(($sw - $cw) / 2); $cy = (int)floor(($sh - $ch) / 2);

        $out = uph_new_canvas($tw, $th);
        imagecopyresampled($out, $im, 0, 0, $cx, $cy, $tw, $th, $cw, $ch);
        imagedestroy($im);
        @imagewebp($out, $tpath, 80);
        imagedestroy($out);
        if (defined('G5_FILE_PERMISSION') && is_file($tpath)) @chmod($tpath, G5_FILE_PERMISSION);
    }

    if (!is_file($tpath)) return $empty;
    return array('src' => $url.'/'.$tname, 'ori' => $url.'/'.$f['bf_file'], 'alt' => '');
}
}
?>
