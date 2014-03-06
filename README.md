# Send Phil Files

This is the tiniest, cheapest way to let people send you huge files
for cents per month.

__Send Phil Files__ is a Rails app that can be deployed to Heroku or a
similar provider and lets people send you large files from their
browser, without the constraints of email and without talking them
into installing Dropbox or Google Drive or whatever.

# Deploying Your Own

1. Clone (perhaps even fork and clone) this repository.
2. Create a Heroku account if you don't have one, or get an account with a similar provider.
3. Create an AWS account if you don't already have one.
4. Use the AWS Console to create an S3 bucket (for storing the upload files.)
5. Create an SNS topic (for notifying you of new files.)
6. Create an IAM user for your application to use. Give it this policy:

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

7. Add your own email address as a subscriber to the SNS topic. (Or subscribe via text messages, which is even more awesome.)
8. Deploy this application to Heroku or whatever (perhaps `git push heroku master`).
9. Define the required enviroment variables using `heroku config:set` or whatever your provider calls it.

    Supply the app with the key and secret of the IAM user by defining
    `AWS_KEY` and `AWS_SECRET` as environment variables.
    
    You also need to specify a `HOSTNAME` so the application can create
    the proper CORS policy for the S3 bucket.
    
    Specify the full ARN of your SNS topic as an environment variable
    called `SNS_TOPIC`.
    
    When deployed, you need to supply all of these environment variables:
    
        AWS_KEY=your-key
        AWS_SECRET=your-secret
        HOSTNAME=yourdomain.com
        S3_BUCKET=your-bucket
        SNS_TOPIC=arn:aws:sns:us-east-1:1234567:your-arn

10. Once your app is deployed and the configuration variables are defined, configure the bucket to accept cross-origin requests by running `rake deployment:configure_bucket` from your production environment (probably with `heroku run`.)

