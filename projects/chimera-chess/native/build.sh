#!/bin/sh
set -eu
cd "$(dirname "$0")"
${CXX:-g++} -std=c++17 -O2 -DNDEBUG -Wall -Wextra -pthread chimera.cpp -o chimera
