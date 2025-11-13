#!/bin/bash
# upload-secrets.sh

REPO="art-of-Technology/collab"

gh secret set ENV_FILE_DEV -b "$(cat .env.dev)" -r $REPO
gh secret set ENV_FILE_UAT -b "$(cat .env.uat)" -r $REPO
gh secret set ENV_FILE_PROD -b "$(cat .env.prod)" -r $REPO