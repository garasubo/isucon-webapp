#!/bin/bash

set -euxo pipefail

HOST=${1:-isucon-webapp}

cd "$(dirname "$0")"

# deploy backend
pushd backend
cross build --release
ssh $HOST 'mkdir -p /home/ubuntu/api-server'
ssh $HOST 'touch /home/ubuntu/api-server/.env'
rsync -avrz target/x86_64-unknown-linux-gnu/release/backend $HOST:/home/ubuntu/api-server/backend
ssh $HOST 'sudo systemctl restart isucon-webapp-backend.service'
popd

# deploy frontend
pushd frontend
npm run build
rsync -avr --delete ./build/client/ "${HOST}":/var/www/isucon-webapp
popd
