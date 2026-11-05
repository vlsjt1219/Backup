# MAFIAZ 사이트 파일 구성

```
index.html            메인 페이지
editor.js / editor.css  메인 페이지 블록 에디터 (메인에서만 사용)
site.css              세 페이지 공통 스타일 (창 틀·왼쪽 메뉴·배경·로그인 창)
common.js             세 페이지 공통 스크립트 (Supabase 키·관리자 로그인·이미지 주소 변환·배경·화면 맞춤)
Character/  index.html  character.js  character.css
Gallery/    index.html  gallery.js    gallery.css
Image/                그림 파일 (GitHub)
```

## 바꿀 곳이 한 군데인 것
- 라이트/다크 색상 → `site.css` 위쪽의 `:root`(다크)와 `:root[data-theme="light"]`(라이트)
- Supabase 주소/키, 관리자 아이디·비밀번호 → `common.js` 맨 위
- 로그인 창·왼쪽 메뉴 모양 → `site.css`

## characters 테이블 (Supabase SQL Editor에서 한 번 실행)
```sql
create table characters (
  id bigint generated always as identity primary key,
  category text default '',
  subject text not null,
  name text default '',
  content text default '',
  char_image text default '',
  thumb_image text default '',
  created_at timestamptz default now()
);
alter table characters disable row level security;
```
(테이블이 없으면 Character 페이지가 같은 내용을 화면에 보여 줍니다.)

## 삭제한 옛 파일
app.js, tag_filter.js, style.css, admin.html(루트·Character), editor.js 중복본, Character/characters.sql
