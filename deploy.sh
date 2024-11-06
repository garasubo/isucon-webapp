#!/bin/bash

set -euxo pipefail

HOST=${1:-isucon-webapp}

cd "$(dirname "$0")"

# deploy backend
pushd backend
cargo build --release
ssh $HOST 'mkdir -p /home/ubuntu/bin'
rsync -avrz target/release/backend $HOST:/home/ubuntu/bin/backend
ssh $HOST 'sudo systemctl restart isucon-webapp-backend.service'
