const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

function decodeQueryParam(p) {
    return decodeURIComponent(p.replace(/\+/g, ' '));
}

exports.lambdaHandler = async (event, context) => {
    console.log(event);
    const client = new S3Client();
    const downloadUrls = await Promise.all(event.Records.map(record => {
        console.log(record.s3.object, record.s3.bucket);
        // Could set ResponseContentDisposition: attachment if we wanted to
        // force these to be downloaded and not viewed in the browser.
        const key = decodeQueryParam(record.s3.object.key);
        const command = new GetObjectCommand({Bucket: record.s3.bucket.name, Key: key});
        const url = getSignedUrl(client, command, { expiresIn: 3600 * 24 * 7 });
        return url;
    }));
    const publish = new PublishCommand({
        Message: `You have new downloads: \n\n${downloadUrls.join("\n\n")}`,
        Subject: "Download link",
        TopicArn: process.env["TOPIC_ARN"]
    });
    const snsClient = new SNSClient();
    await snsClient.send(publish);
    return null;
};
