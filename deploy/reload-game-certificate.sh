#!/bin/sh
set -eu
# Only react to this game's successful certificate renewal.
if [ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/game.example.com ]; then
    /usr/sbin/apache2ctl configtest
    /usr/bin/systemctl reload apache2
fi
