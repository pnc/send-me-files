#!/bin/bash

set -e

rm -Rf dist
yarn parcel build index.html
aws s3 cp --acl=public-read --cache-control "max-age=5" dist/index.html s3://$S3_BUCKET/
aws s3 sync --exclude index.html --cache-control "max-age=31536000" --acl=public-read dist/ s3://$S3_BUCKET/
