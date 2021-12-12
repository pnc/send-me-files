const { STSClient, AssumeRoleCommand } = require("@aws-sdk/client-sts");
const { validate: uuidValidate } = require('uuid');
const AWSXRay = require('aws-xray-sdk');

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */
let client = new STSClient({ });
if (!process.env['AWS_SAM_LOCAL']) {
    client = AWSXRay.captureAWSv3Client(client);
}

exports.lambdaHandler = async (event, context) => {
    try {
        const parsedBody = JSON.parse(event.body);
        const sessionName = parsedBody.sessionName;
        if (!uuidValidate(sessionName)) {
            throw new Error(`sessionName must be a UUID; got ${sessionName}`);
        }
        const cmd = new AssumeRoleCommand({RoleArn: process.env['ANONYMOUS_ROLE_ARN'], RoleSessionName: sessionName, DurationSeconds: 900});
        const resp = await client.send(cmd);
        let response = {
            "isBase64Encoded": false,
            'statusCode': 200,
            'headers': {"Content-Type": "application/json"},
            'body': JSON.stringify({
                assumed_role_id: resp.AssumedRoleUser.AssumedRoleId,
                credentials: resp.Credentials,
                bucket: process.env['S3_BUCKET'],
                prefix: `uploads/${resp.AssumedRoleUser.AssumedRoleId}/`
            })
        }
        return response;
    } catch (err) {
        console.error(err);
        throw err;
    }
};
