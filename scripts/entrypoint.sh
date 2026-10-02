#!/bin/sh
set -eu
umask 077
exec /app/docker/entrypoint.sh "$@"
