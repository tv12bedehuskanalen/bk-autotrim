#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"
EXPECTED_REMOTE='https://github.com/tv12bedehuskanalen/bk-autotrim.git'

command -v gh >/dev/null || { echo 'GitHub CLI mangler. Installer med: brew install gh'; exit 1; }
command -v git >/dev/null || { echo 'Git mangler.'; exit 1; }

# Diagnose connectivity before authentication. A DNS/network failure must never
# be interpreted as an expired token or start a new login.
command -v curl >/dev/null || { echo 'curl mangler.'; exit 1; }
if ! curl --silent --show-error --head --connect-timeout 5 --max-time 15 https://github.com/ >/dev/null; then
  echo 'Kan ikke koble til github.com. Ingen innlogging eller Git-endringer er utført.'
  exit 1
fi
if ! curl --silent --show-error --head --connect-timeout 5 --max-time 15 https://api.github.com/ >/dev/null; then
  echo 'Kan ikke koble til api.github.com. Ingen innlogging eller Git-endringer er utført.'
  exit 1
fi

# gh stores a token using the system credential storage, never in app files.
# Browser login avoids requesting or recording an account password.
if ! gh api user --jq .login >/dev/null 2>&1; then
  echo 'GitHub-autentisering kunne ikke verifiseres. Ingen innlogging eller endringer er startet.'
  exit 1
fi
ACCOUNT="$(gh api user --jq .login)"
if [ "$ACCOUNT" != 'tv12bedehuskanalen' ]; then
  echo "Feil GitHub-konto: $ACCOUNT. Bytt til tv12bedehuskanalen først."
  exit 1
fi
# Read-only authenticated repository check. A public ls-remote alone does not prove authentication.
gh api repos/tv12bedehuskanalen/bk-autotrim --jq '.permissions.push' | {
  read -r CAN_PUSH
  [ "$CAN_PUSH" = true ] || { echo 'Kontoen har ikke skrivetilgang til repositoriet.'; exit 1; }
}

if [ ! -d .git ]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    echo 'Appmappen ligger inne i et annet Git-repository. Avbryter uten endringer.'
    exit 1
  fi
  git init -b main .
fi
ACTUAL_ROOT="$(cd "$(git rev-parse --show-toplevel)" && pwd)"
[ "$ACTUAL_ROOT" = "$PROJECT_DIR" ] || { echo 'Feil Git-rot. Avbryter.'; exit 1; }
CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = main ] || { echo "Gjeldende gren er $CURRENT_BRANCH. Forventet main. Ingen grener endres automatisk."; exit 1; }
if git remote get-url origin >/dev/null 2>&1; then
  [ "$(git remote get-url origin)" = "$EXPECTED_REMOTE" ] || { echo 'Origin peker til et annet repository. Avbryter.'; exit 1; }
else
  git remote add origin "$EXPECTED_REMOTE"
fi
# Repository-local helper only; do not replace global credentials.
git config --local credential.https://github.com.helper ''
git config --local --add credential.https://github.com.helper '!gh auth git-credential'
git config --local credential.https://github.com.username tv12bedehuskanalen

echo 'Kontrollerer lesetilgang til origin ...'
git ls-remote origin

# Preserve existing staged work: never mix it into this publication.
if ! git diff --cached --quiet; then
  echo 'Det finnes allerede staged endringer. Behandle dem først. Ingen commit eller push utført.'
  exit 1
fi
node --check desktop/main.cjs
node --check lib/media.cjs
node --check lib/updates.cjs
npm test
# Explicit app paths; no NAS recordings, credentials, dependencies or neighbouring projects.
git add -- .gitignore package.json README.md LICENSE THIRD_PARTY_NOTICES.md docs assets desktop lib renderer test scripts .github 'Publish to GitHub.command'
if [ -f package-lock.json ]; then git add -- package-lock.json; fi
echo 'Filer som publiseres:'
git diff --cached --stat
if ! git diff --cached --quiet; then
  git commit -m 'Add BK Autotrim application'
fi
# No history rewrites or force pushes. Divergent remote history is rejected by Git.
git push -u origin main
echo 'Kildekoden er publisert. Ingen versjonstag eller installasjonsutgivelse er publisert.'
