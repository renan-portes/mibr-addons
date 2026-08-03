#!/bin/sh

local_http_get() {
  local_http_port=$1
  local_http_path=$2
  local_http_headers=$3
  local_http_body=$4
  local_http_metadata=$5

  : > "$local_http_headers"
  : > "$local_http_body"
  : > "$local_http_metadata"
  chmod 600 "$local_http_headers" "$local_http_body" "$local_http_metadata"

  curl \
    --silent \
    --show-error \
    --fail \
    --http1.1 \
    --noproxy '*' \
    --proto '=http' \
    --connect-timeout 2 \
    --max-time 2 \
    --max-redirs 0 \
    --request GET \
    --dump-header "$local_http_headers" \
    --output "$local_http_body" \
    --write-out '%{http_code}\n%{content_type}\n' \
    "http://127.0.0.1:${local_http_port}/${local_http_path}" \
    > "$local_http_metadata" 2>/dev/null
}
