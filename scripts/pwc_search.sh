#!/usr/bin/env bash
# autoresearch — PapersWithCode search (with graceful failure for the web-search fallback).
# Usage: pwc_search.sh "<query>" [papers|datasets|methods|sota]
# Prints top hits as JSON. Exits non-zero if the API is unreachable/empty so the
# skill knows to fall back to WebSearch + arXiv + HF Papers (PwC was sunset by Meta in 2025).

set -u
query="${1:?usage: pwc_search.sh \"<query>\" [papers|datasets|methods|sota]}"
kind="${2:-papers}"
limit="${PWC_LIMIT:-8}"

case "$kind" in
  papers|datasets|methods|sota) ;;
  *) echo "second arg must be one of: papers datasets methods sota" >&2; exit 2 ;;
esac

q="$(printf '%s' "$query" | jq -sRr @uri)"
base="https://paperswithcode.com/api/v1"

case "$kind" in
  papers)   url="${base}/papers/?q=${q}&items_per_page=${limit}" ;;
  datasets) url="${base}/datasets/?q=${q}&items_per_page=${limit}" ;;
  methods)  url="${base}/methods/?q=${q}&items_per_page=${limit}" ;;
  sota)     url="${base}/search/?q=${q}&items_per_page=${limit}" ;;
esac

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

# Project the useful fields per kind; keep it compact (no page dumps).
case "$kind" in
  papers)
    printf '%s' "$resp" | jq '[.results[] | {id, title, url_abs, url_pdf, published, proceeding}]' ;;
  datasets)
    printf '%s' "$resp" | jq '[.results[] | {id, name, full_name, url, paper}]' ;;
  methods)
    printf '%s' "$resp" | jq '[.results[] | {id, name, full_name, description: (.description[0:160])}]' ;;
  sota)
    printf '%s' "$resp" | jq '.' ;;
esac
