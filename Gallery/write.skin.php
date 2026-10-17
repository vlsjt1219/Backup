<?php
if (!defined('_GNUBOARD_')) exit; 
add_stylesheet('<link rel="stylesheet" href="'.$board_skin_url.'/style.css">', 0);

$is_error = false;
$option = '';
$option_hidden = '';

if(!$is_error) { 
	$is_category = false;
	$category_option = '';
	if ($board['bo_use_category']) {
		$ca_name = "";
		if (isset($write['ca_name'])) $ca_name = $write['ca_name'];
		$category_option = get_category_option($bo_table, $ca_name);
		$is_category = true;
	}

	// PHP 8: $write 배열 기본값 세팅
	$wr_subject  = $write['wr_subject'] ?? '';
	$wr_type     = $write['wr_type']    ?? '';
	$wr_text     = $write['wr_text']    ?? '';
	$wr_content  = $write['wr_content'] ?? '';
	$use_chick   = $board['bo_use_chick'] ?? false; // PHP 8: 키 없을 때 경고 방지

	// 다중 URL: wr_url에 줄바꿈으로 저장된 값을 배열로 분리
	$wr_url_raw    = $write['wr_url'] ?? '';
	$wr_urls_saved = array_values(array_filter(explode("\n", str_replace("\r", "", $wr_url_raw))));

	/* [설정 연동] 첨부파일 수는 게시판 관리의 "업로드 개수"(bo_upload_count)를 따릅니다.
	   원본은 10장으로 고정돼 있어서, 관리자가 2로 설정해 놓으면
	   3번째 이후 파일이 조용히 버려지는 문제가 있었습니다. */
	$max_file = array_key_exists('bo_upload_count', $board) ? (int)$board['bo_upload_count'] : 10;
	if ($max_file < 0)  $max_file = 0;
	if ($max_file > 30) $max_file = 30;
	$can_upload = ($max_file > 0);

	$file ??= array();

	// WebP 변환 설정 (값은 webp.lib.php 상단에서 변경)
	include_once($board_skin_path.'/webp.lib.php');
?>

<div id="load_log_board" style="max-width:1000px; margin:0 auto; width:100%;">
	<section id="bo_w" class="mmb-board<?php echo $use_chick ? ' chick' : ''; ?>" style="width:100%;">
		<form name="fwrite" id="fwrite" action="<?php echo $action_url ?>" onsubmit="return fwrite_submit(this);" method="post" enctype="multipart/form-data" autocomplete="off">
		<input type="hidden" name="uid" value="<?php echo get_uniqid(); ?>">
		<input type="hidden" name="w" value="<?php echo $w ?>">
		<input type="hidden" name="bo_table" value="<?php echo $bo_table ?>">
		<input type="hidden" name="wr_id" value="<?php echo $wr_id ?>">
		<input type="hidden" name="sca" value="<?php echo $sca ?>">
		<input type="hidden" name="sfl" value="<?php echo $sfl ?>">
		<input type="hidden" name="stx" value="<?php echo $stx ?>">
		<input type="hidden" name="spt" value="<?php echo $spt ?>">
		<input type="hidden" name="sst" value="<?php echo $sst ?>">
		<input type="hidden" name="sod" value="<?php echo $sod ?>">
		<input type="hidden" name="page" value="<?php echo $page ?>">
		<input type="hidden" name="wr_url" id="wr_url_combined" value="<?php echo htmlspecialchars($wr_url_raw) ?>">
		
        <div style="margin-bottom:15px; text-align:center;">
            <input type="text" name="wr_subject" value="<?php echo htmlspecialchars($wr_subject) ?>" required class="frm_input full" placeholder="제목을 입력하세요" style="width:100%; max-width:600px; padding:10px; font-weight:bold; font-size:14px; text-align:center;">
        </div>

        <?php if(!$is_member) { ?> 
        <div class="guest-box" style="margin-bottom:10px; text-align:center;">
            <input type="text" name="wr_name" value="<?php echo htmlspecialchars($name ?? '') ?>" placeholder="이름" required class="frm_input" style="width:120px;"> 
            <input type="password" name="wr_password" value="<?php echo htmlspecialchars($password ?? '') ?>" placeholder="비밀번호" required class="frm_input" style="width:120px;">
        </div> 
		<?php } ?>

        <div class="txt-center option_box" style="margin-bottom:15px;">
    		<?php if ($is_category) { ?>
    			<select name="ca_name" id="ca_name" required class="required">
    			<option value="">카테고리 선택</option>
    			<?php echo $category_option ?>
    			</select> 
    		<?php } ?>
            <select name="wr_type" id="wr_type_select" onchange="fn_log_type(this.value);">
                <?php if ($can_upload) { ?>
                <option value="UPLOAD" <?php echo $wr_type == "UPLOAD" ? "selected" : "" ?>>이미지 업로드</option>
                <?php } ?>
                <option value="URL"    <?php echo (!$can_upload || $wr_type == "URL") ? "selected" : "" ?>>외부 이미지(URL)</option>
            </select>
        </div>

        <div class="upload_box" style="background:#f9f9f9; padding:15px; border-radius:10px;">

			<div id="add_UPLOAD" <?php echo ($can_upload && ($wr_type == "UPLOAD" || $wr_type == "")) ? "" : "style='display:none;'" ?>>
                <div id="file_input_list">
                    <?php
                    // 수정 시 기존 파일 표시, 신규는 1칸 (관리자 설정 개수를 넘지 않음)
                    $init_file_count = ($w == 'u' && !empty($file)) ? max(1, count($file)) : 1;
                    if ($max_file > 0 && $init_file_count > $max_file) $init_file_count = $max_file;
                    for($i=0; $i < $init_file_count; $i++) {
                    ?>
                    <div class="file-row" style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
                        <span style="font-size:11px; color:#888; min-width:50px;">FILE #<span class="file-num"><?php echo $i+1 ?></span></span>
                        <input type="file" name="bf_file[]" class="frm_file frm_input" style="flex:1;" />
                        <?php if($w == 'u' && !empty($file[$i]['file'])) { ?>
                            <label style="font-size:11px; color:#888;">
                                <input type="checkbox" name="bf_file_del[<?php echo $i ?>]" value="1">
                                <?php echo $file[$i]['source'].'('.$file[$i]['size'].')' ?> 삭제
                            </label>
                        <?php } ?>
                        <button type="button" onclick="removeFileRow(this)" style="padding:2px 8px; background:#eee; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:11px; color:#999; <?php echo $i==0 ? 'visibility:hidden;' : '' ?>">✕</button>
                    </div>
                    <?php } ?>
                </div>
                <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
                    <button type="button" id="btn_add_file" onclick="addFileRow()" style="padding:4px 12px; background:#fff; border:1px solid #ccc; border-radius:4px; cursor:pointer; font-size:12px; color:#666;">+ 파일 추가</button>
                    <span id="file_count_info" style="font-size:11px; color:#aaa;"><?php echo $init_file_count ?> / <?php echo $max_file ?>장</span>
                </div>
                <p style="font-size:11px; color:#aaa; margin-top:6px;">최대 <?php echo $max_file ?>장까지 첨부할 수 있습니다. (게시판 관리 &gt; 업로드 개수 설정)</p>
			</div>
			
            <div id="add_URL" <?php echo $wr_type == "URL" ? "" : "style='display:none;'" ?>>
				<div id="url_input_list">
					<?php
					$init_count = max(1, count($wr_urls_saved));
					for ($u = 0; $u < $init_count; $u++) {
					    $saved_val = htmlspecialchars($wr_urls_saved[$u] ?? '');
					?>
					<div class="url-row" style="display:flex; align-items:center; gap:5px; margin-bottom:5px;">
						<span style="font-size:11px; color:#888; min-width:40px;">URL #<span class="url-num"><?php echo $u+1 ?></span></span>
						<input type="text" class="wr_url_input frm_input"
						       value="<?php echo $saved_val ?>"
						       placeholder="https://i.imgur.com/..."
						       style="flex:1; box-sizing:border-box;" />
						<button type="button" onclick="removeUrlRow(this)" style="padding:2px 8px; background:#eee; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:11px; color:#999; <?php echo $u==0 ? 'visibility:hidden;' : '' ?>">✕</button>
					</div>
					<?php } ?>
				</div>
				<div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
					<button type="button" id="btn_add_url" onclick="addUrlRow()" style="padding:4px 12px; background:#fff; border:1px solid #ccc; border-radius:4px; cursor:pointer; font-size:12px; color:#666;">+ URL 추가</button>
					<span id="url_count_info" style="font-size:11px; color:#aaa;"><?php echo $init_count ?> / 20장</span>
				</div>
				<p style="font-size:11px; color:#aaa; margin-top:6px;">이미지 URL을 직접 붙여넣으세요. 최대 20장까지 추가할 수 있습니다.</p>
			</div>
			
		</div>

        <div class="comments" style="margin-top:15px;"> 
            <textarea name="wr_content" id="wr_content" class="frm_input" style="width:100%; height:80px;" placeholder="코멘트 / 설명 (선택사항)"><?php echo htmlspecialchars($wr_content) ?></textarea>
		</div>	
	
        <div class="txt-center" style="margin-top:20px; display:flex; justify-content:center; gap:5px;">
            <button type="submit" id="btn_submit" accesskey="s" class="ui-btn point" style="padding:0 30px; border-radius:20px; font-weight:bold; height:35px;"><?php echo $w=='u' ? "수정완료" : "등록하기"; ?></button>
			<a href="./board.php?bo_table=<?php echo $bo_table ?>" class="ui-btn point" style="padding:0 20px; border-radius:20px; font-weight:bold; height:35px; opacity:0.5;">취소</a>
		</div>

		</form>
	</section>
</div>

<script>
	var FILE_MAX = <?php echo (int)$max_file ?>;   // 게시판 관리 > 업로드 개수
	var URL_MAX  = 20;

	function updateFileNumbers() {
		var listEl = document.getElementById('file_input_list');
		if (!listEl) return;
		var rows = document.querySelectorAll('#file_input_list .file-row');
		rows.forEach(function(row, idx) {
			var numSpan = row.querySelector('.file-num');
			if (numSpan) numSpan.textContent = idx + 1;
			var btn = row.querySelector('button');
			if (btn) btn.style.visibility = idx === 0 ? 'hidden' : 'visible';
		});
		var count = rows.length;
		document.getElementById('file_count_info').textContent = count + ' / ' + FILE_MAX + '장';
		var addBtn = document.getElementById('btn_add_file');
		addBtn.disabled = (count >= FILE_MAX);
		addBtn.style.opacity = (count >= FILE_MAX) ? '0.4' : '1';
	}

	function addFileRow() {
		var list = document.getElementById('file_input_list');
		if (list.querySelectorAll('.file-row').length >= FILE_MAX) return;
		var div = document.createElement('div');
		div.className = 'file-row';
		div.style.cssText = 'display:flex; align-items:center; gap:5px; margin-bottom:5px;';
		div.innerHTML = '<span style="font-size:11px; color:#888; min-width:50px;">FILE #<span class="file-num"></span></span>'
		              + '<input type="file" name="bf_file[]" class="frm_file frm_input" style="flex:1;" />'
		              + '<button type="button" onclick="removeFileRow(this)" style="padding:2px 8px; background:#eee; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:11px; color:#999;">✕</button>';
		list.appendChild(div);
		updateFileNumbers();
	}

	function removeFileRow(btn) {
		btn.closest('.file-row').remove();
		updateFileNumbers();
	}

	function fn_log_type(type) { 
		$('#add_UPLOAD').hide();
		$('#add_URL').hide();
		$('#add_'+type).show();
	}

	function updateUrlNumbers() {
		var rows = document.querySelectorAll('#url_input_list .url-row');
		rows.forEach(function(row, idx) {
			var numSpan = row.querySelector('.url-num');
			if (numSpan) numSpan.textContent = idx + 1;
			var btn = row.querySelector('button');
			if (btn) btn.style.visibility = idx === 0 ? 'hidden' : 'visible';
		});
		var count = rows.length;
		document.getElementById('url_count_info').textContent = count + ' / ' + URL_MAX + '장';
		var addBtn = document.getElementById('btn_add_url');
		addBtn.disabled = (count >= URL_MAX);
		addBtn.style.opacity = (count >= URL_MAX) ? '0.4' : '1';
	}

	function addUrlRow() {
		var list = document.getElementById('url_input_list');
		if (list.querySelectorAll('.url-row').length >= URL_MAX) return;
		var div = document.createElement('div');
		div.className = 'url-row';
		div.style.cssText = 'display:flex; align-items:center; gap:5px; margin-bottom:5px;';
		div.innerHTML = '<span style="font-size:11px; color:#888; min-width:40px;">URL #<span class="url-num"></span></span>'
		              + '<input type="text" class="wr_url_input frm_input" placeholder="https://i.imgur.com/..." style="flex:1; box-sizing:border-box;" />'
		              + '<button type="button" onclick="removeUrlRow(this)" style="padding:2px 8px; background:#eee; border:1px solid #ddd; border-radius:4px; cursor:pointer; font-size:11px; color:#999;">✕</button>';
		list.appendChild(div);
		updateUrlNumbers();
		div.querySelector('input').focus();
	}

	function removeUrlRow(btn) {
		btn.closest('.url-row').remove();
		updateUrlNumbers();
	}

	/* =================================================================
	   [WebP 자동 변환 — 브라우저 단계]
	   파일을 고르는 순간 브라우저에서 WebP 로 바꿔 파일칸에 다시 넣습니다.
	   · 올리는 용량 자체가 줄어서 업로드가 빠르고 서버 부담도 적습니다.
	   · GIF(움짤) · 이미 WebP 인 파일은 그대로 둡니다.
	   · 변환 결과가 원본보다 크면 원본을 그대로 올립니다.
	   · 브라우저가 WebP 를 못 만들면(아이폰 사파리 등) 원본을 올리고
	     서버(write_update.skin.php)가 대신 변환합니다.
	   ================================================================= */
	var UPH_WEBP = {
		quality: <?php echo round(UPH_WEBP_QUALITY / 100, 2) ?>,
		maxEdge: <?php echo (int)UPH_WEBP_MAX_EDGE ?>,
		busy: 0,
		canEncode: null
	};

	function uphCanEncodeWebp() {
		if (UPH_WEBP.canEncode !== null) return UPH_WEBP.canEncode;
		try {
			var c = document.createElement('canvas'); c.width = c.height = 1;
			UPH_WEBP.canEncode = (c.toDataURL('image/webp').indexOf('data:image/webp') === 0);
		} catch (e) { UPH_WEBP.canEncode = false; }
		return UPH_WEBP.canEncode;
	}

	function uphFmtSize(b) {
		return b >= 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
	}

	function uphNote(input, text, color) {
		var n = input.parentNode.querySelector('.uph-webp-note');
		if (!n) {
			n = document.createElement('span');
			n.className = 'uph-webp-note';
			n.style.cssText = 'font-size:10.5px; white-space:nowrap; margin-left:4px;';
			input.parentNode.insertBefore(n, input.nextSibling);
		}
		n.textContent = text;
		n.style.color = color || '#aaa';
	}

	function uphDecode(file) {
		// 사진의 회전 정보(EXIF)를 반영해서 불러오기
		if (window.createImageBitmap) {
			return createImageBitmap(file, { imageOrientation: 'from-image' })
				.catch(function() { return createImageBitmap(file); })
				.catch(function() { return uphDecodeImg(file); });
		}
		return uphDecodeImg(file);
	}
	function uphDecodeImg(file) {
		return new Promise(function(resolve, reject) {
			var url = URL.createObjectURL(file), img = new Image();
			img.onload  = function() { URL.revokeObjectURL(url); resolve(img); };
			img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('decode')); };
			img.src = url;
		});
	}

	function uphConvertInput(input) {
		var file = input.files && input.files[0];
		if (!file) { uphNote(input, ''); return; }
		if (!/^image\/(jpeg|png|bmp)$/i.test(file.type)) {
			uphNote(input, /gif/i.test(file.type) ? 'GIF · 원본 유지' : '');
			return;
		}
		if (!uphCanEncodeWebp() || !window.DataTransfer || !window.Promise) {
			uphNote(input, '저장할 때 서버에서 WebP 변환');
			return;
		}

		UPH_WEBP.busy++;
		uphNote(input, 'WebP 변환 중…', '#999');

		uphDecode(file).then(function(img) {
			var sw = img.width, sh = img.height, dw = sw, dh = sh;
			if (UPH_WEBP.maxEdge > 0 && Math.max(sw, sh) > UPH_WEBP.maxEdge) {
				var k = UPH_WEBP.maxEdge / Math.max(sw, sh);
				dw = Math.max(1, Math.round(sw * k));
				dh = Math.max(1, Math.round(sh * k));
			}
			var c = document.createElement('canvas');
			c.width = dw; c.height = dh;
			var ctx = c.getContext('2d');
			ctx.imageSmoothingQuality = 'high';
			ctx.drawImage(img, 0, 0, dw, dh);
			if (img.close) img.close();

			return new Promise(function(resolve) {
				c.toBlob(function(blob) { resolve(blob); }, 'image/webp', UPH_WEBP.quality);
			});
		}).then(function(blob) {
			// 브라우저가 WebP 대신 PNG 를 돌려주는 경우도 있으므로 형식을 꼭 확인
			if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) {
				uphNote(input, '원본 유지 (' + uphFmtSize(file.size) + ')');
				return;
			}
			var name = file.name.replace(/\.[^.]+$/, '') + '.webp';
			var dt = new DataTransfer();
			dt.items.add(new File([blob], name, { type: 'image/webp', lastModified: Date.now() }));
			input.files = dt.files;
			uphNote(input, uphFmtSize(file.size) + ' → ' + uphFmtSize(blob.size), '#3a9a6a');
		}).catch(function() {
			uphNote(input, '저장할 때 서버에서 WebP 변환');
		}).then(function() {
			UPH_WEBP.busy = Math.max(0, UPH_WEBP.busy - 1);
		});
	}

	// 동적으로 추가되는 파일칸까지 모두 처리
	document.addEventListener('change', function(e) {
		var t = e.target;
		if (t && t.tagName === 'INPUT' && t.type === 'file' && t.name === 'bf_file[]') uphConvertInput(t);
	});

    function fwrite_submit(f) {
        if (UPH_WEBP.busy > 0) {
            alert('이미지를 WebP 로 변환하는 중입니다. 잠시 후 다시 눌러 주세요.');
            return false;
        }
        var type = document.getElementById('wr_type_select').value;
        if (type === 'URL') {
            var urls = [];
            document.querySelectorAll('.wr_url_input').forEach(function(inp) {
                var v = inp.value.trim();
                if (v) urls.push(v);
            });
            document.getElementById('wr_url_combined').value = urls.join('\n');
        }
        document.getElementById('btn_submit').disabled = true;
        return true;
    }

	document.addEventListener('DOMContentLoaded', function() {
		updateUrlNumbers();
		updateFileNumbers();
	});
</script>
<?php } ?>
