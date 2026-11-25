#!/usr/bin/env bash
# Build mula-api and mula-web tagged with the git commit they come from, so a deployment names an
# exact version instead of a reused tag such as "latest". See docker/README.md, "Images tagged by
# commit". Options: none. Env: MULA_PLATFORM (for example linux/amd64).
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

if ! command -v docker >/dev/null 2>&1; then
  echo "build-images: Docker is not installed or not in this Terminal's PATH." >&2
  exit 1
fi

commit="$(git rev-parse --short HEAD)"
# An image built from uncommitted changes can't be rebuilt from Git, so its tag says so.
if [ -n "$(git status --porcelain)" ]; then
  tag="$commit-dirty"
  echo "build-images: uncommitted changes; tagging $tag. Don't deploy this image." >&2
else
  tag="$commit"
fi

platform_args=()
if [ -n "${MULA_PLATFORM:-}" ]; then
  platform_args=(--platform "$MULA_PLATFORM")
fi

for name in api web; do
  echo "build-images: building mula-$name:$tag"
  # The ${array[@]+...} form keeps an empty array working under `set -u` in macOS's bash 3.2.
  docker build ${platform_args[@]+"${platform_args[@]}"} \
    --file "Dockerfile.$name" \
    --build-arg "GIT_SHA=$tag" \
    --tag "mula-$name:$tag" \
    .
done

echo "build-images: built mula-api:$tag and mula-web:$tag"
