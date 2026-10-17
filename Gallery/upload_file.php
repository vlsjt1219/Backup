<?php
if (!defined("_GNUBOARD_")) exit; // 개별 페이지 접근 불가

function upload_c_file($name, $table) {
	global $config; // PHP 8: 함수 내에서 전역변수 명시 필요

	$files = array();
	$tmp_file  = $_FILES[$name]['tmp_name'];
	$filesize  = $_FILES[$name]['size'];
	$filename  = $_FILES[$name]['name'];
	$filename  = get_safe_filename($filename);

	$timg = @getimagesize($tmp_file);

	// image type 체크: 이미지/플래시 확장자인데 실제 이미지가 아니면 업로드 거부
	if (!empty($config['cf_image_extension']) && !empty($config['cf_flash_extension'])) {
		if ( preg_match("/\.({$config['cf_image_extension']})$/i", $filename) ||
		     preg_match("/\.({$config['cf_flash_extension']})$/i", $filename) ) {
			// PHP 8: continue는 루프 안에서만 사용 가능 → return [] 으로 대체
			if (empty($timg) || $timg[2] < 1 || $timg[2] > 16) {
				return array();
			}
		}
	}

	$files['img']    = $timg;
	$files['source'] = $filename;
	$files['size']   = $filesize;

	// 위험한 확장자는 -x 를 붙여 실행 불가 처리 (php5/php7/phar/shtml/svg 등 추가)
	$filename = preg_replace("/\.(php\d?|phtm|phar|htm[l]?|shtml|cgi|pl|exe|jsp|asp[x]?|inc|svg|xml|xhtml)/i", "$0-x", $filename);

	$chars_array = array_merge(range(0, 9), range('a', 'z'), range('A', 'Z'));
	shuffle($chars_array);
	$shuffle = implode('', $chars_array);

	$file_name = abs(ip2long($_SERVER['REMOTE_ADDR'])) . '_' . substr($shuffle, 0, 8) . '_' . replace_filename($filename);

	$dest_file = G5_DATA_PATH . '/file/' . $table . '/' . $file_name;

	// 업로드 실패 시 빈 배열 반환 (@ 로 오류를 묻지 않고 결과를 직접 확인)
	if (!@move_uploaded_file($tmp_file, $dest_file)) {
		return array();
	}
	@chmod($dest_file, G5_FILE_PERMISSION);

	$files['link'] = G5_DATA_URL . '/file/' . $table . '/' . $file_name;
	$files['name'] = $file_name;

	// PHP 8: get_magic_quotes_gpc() 삭제됨 → 항상 addslashes 적용
	$files['source'] = addslashes($files['source']);

	return $files;
}
?>
