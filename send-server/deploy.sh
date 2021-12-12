#!/bin/bash

set -e

sam build && sam deploy --resolve-s3 --stack-name send-phil-files-test --capabilities CAPABILITY_IAM
