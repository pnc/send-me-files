# Send Phil Files

You need to create an S3 bucket (for storing files) and an SNS topic
for delivering notifications when new files are uploaded. Define the
bucket name as an environment variable called `S3_BUCKET` and the ARN
of the SNS topic as an environment variable called `SNS_TOPIC`.

You need an IAM user with a policy like this:

    {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "Stmt1393987487000",
          "Effect": "Allow",
          "Action": [
            "s3:*"
          ],
          "Resource": [
            "arn:aws:s3:::your-bucket",
            "arn:aws:s3:::your-bucket/*"
          ]
        },
        {
          "Sid": "AllowSendingSNS",
          "Effect": "Allow",
          "Action": [
            "sns:publish"
          ],
          "Resource": [
            "arn:aws:sns:your-sns-topic"
          ]
        }
      ]
    }

Supply the app with the key and secret of this user by defining
`AWS_KEY` and `AWS_SECRET`.
