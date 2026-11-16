#!/usr/bin/env bash
# Builds the single-file app and publishes it to the gh-pages branch (served by GitHub Pages).
# Usage: npm run deploy
set -euo pipefail
cd "$(dirname "$0")/.."

npm test
npm run build:single
touch dist-single/.nojekyll

remote="$(git remote get-url origin)"
sha="$(git rev-parse --short HEAD)"
tmp="$(mktemp -d)"
cp -R dist-single/. "$tmp/"
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name || echo deploy)" \
    -c user.email="$(git -C "$OLDPWD" config user.email || echo deploy@localhost)" \
    commit -q -m "Deploy Zone Ten from ${sha}"
git push -f "$remote" gh-pages
rm -rf "$tmp"
echo "Deployed ${sha} to gh-pages."
