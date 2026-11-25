#!/bin/sh
# Builds to a temp file then renames atomically, so running engine processes keep their binary (no ETXTBSY).
set -eu
cd "$(dirname "$0")"
${CXX:-g++} -std=c++17 -O2 -DNDEBUG -Wall -Wextra -pthread chimera.cpp -o chimera.tmp.$$
mv -f chimera.tmp.$$ chimera
