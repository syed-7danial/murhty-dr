const { custom_logging }  = require ("../helper.js")

const getBucketNotificationConfiguration = async(bucketClient, bucketName) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    return await bucketClient.getBucketNotificationConfiguration({
        Bucket: bucketName
    }).promise();
}

const putBucketNotificationConfiguration = async(bucketClient, bucketName, configuration) => {
    if (!global.DRY_RUN) {
        await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
        await bucketClient.putBucketNotificationConfiguration({
            Bucket: bucketName,
            NotificationConfiguration: configuration,
            SkipDestinationValidation: true
        }).promise();
    }
}

module.exports = { getBucketNotificationConfiguration, putBucketNotificationConfiguration }