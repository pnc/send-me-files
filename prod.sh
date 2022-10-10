#!/bin/bash

set -e

yarn parcel build index.html
aws s3 cp --acl=public-read --cache-control "max-age=5" dist/index.html s3://send-phil-files-production-sitebucket-1ovtvx21use6r/
aws s3 sync --exclude index.html --cache-control "max-age=31536000" --acl=public-read dist/ s3://send-phil-files-production-sitebucket-1ovtvx21use6r/
