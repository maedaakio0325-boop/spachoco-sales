#!/bin/sh
# Firebase Hosting に載せるファイルだけを dist/ にまとめる（議事録の原本など社内資料は入れない）
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/assets
cp minutes.html dist/
cp assets/*.js assets/*.css dist/assets/
printf '<meta http-equiv="refresh" content="0;url=minutes.html">\n' > dist/index.html
echo "dist/ を作りました"; ls dist dist/assets
