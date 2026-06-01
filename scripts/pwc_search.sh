#!/usr/bin/env bash
# autoresearch — PapersWithCode search (with graceful failure for the web-search fallback).
# Usage: pwc_search.sh "<query>" [papers|datasets|methods]
# Prints top hits as JSON. Exits non-zero if the API is unreachable/empty so the
# skill knows to fall back to WebSearch + arXiv + HF Papers.
#
# NOTE: the live API now lives at paperswithcode.co (the old .com was retired).
# Override with PWC_BASE if it moves again.

set -u
query="${1:?usage: pwc_search.sh \"<query>\" [papers|datasets|methods]}"
kind="${2:-papers}"
limit="${PWC_LIMIT:-8}"
base="${PWC_BASE:-https://paperswithcode.co/api/v1}"

case "$kind" in
  papers|datasets|methods) ;;
  *) echo "second arg must be one of: papers datasets methods" >&2; exit 2 ;;
esac

q="$(printf '%s' "$query" | jq -sRr @uri)"
url="${base}/${kind}/?q=${q}&items_per_page=${limit}"

resp="$(curl -fsS -m 15 -H 'Accept: application/json' "$url" 2>/dev/null)" || {
  echo "pwc_search.sh: PapersWithCode API unreachable for '${query}' (${kind}) — fall back to WebSearch/arXiv/HF Papers" >&2
  exit 3
}

# Empty result set → signal fallback too.
count="$(printf '%s' "$resp" | jq -r '(.count // (.results | length) // 0)' 2>/dev/null || echo 0)"
if [ -z "$count" ] || [ "$count" = "0" ] || [ "$count" = "null" ]; then
  echo "pwc_search.sh: no PapersWithCode results for '${query}' (${kind}) — fall back to WebSearch" >&2
  exit 3
fi

# Project the useful fields per kind; keep it compact (no page dumps). // null guards missing keys.
case "$kind" in
  papers)
    printf '%s' "$resp" | jq '[.results[] | {id, title, arxiv_id: (.arxiv_id // null), url_abs: (.url_abs // null), url_pdf: (.url_pdf // null), published: (.published // null)}]' ;;
  datasets)
    printf '%s' "$resp" | jq '[.results[] | {id, name, full_name: (.full_name // null), slug: (.slug // null), url: (.url // null)}]' ;;
  methods)
    printf '%s' "$resp" | jq '[.results[] | {id, name, full_name: (.full_name // null), slug: (.slug // null), description: (.description[0:160])}]' ;;
esac
