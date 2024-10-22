#!/bin/bash

set -euxo pipefail

CPUS=${CPUS:-2}
MEMORY=${MEMORY:-4G}
DISK=${DISK:-16G}

cd "$(dirname "$0")"

multipass launch --name isucon-webapp --cpus "$CPUS" --memory "$MEMORY" --disk "$DISK" --cloud-init cloud-config.yaml jammy
