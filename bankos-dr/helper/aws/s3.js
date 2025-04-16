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
  
const deleteBucketNotificationConfiguration = async (s3Client, bucket) => {
  if (!global.DRY_RUN) {
    await s3Client.putBucketNotificationConfiguration({
      Bucket: bucket,
      NotificationConfiguration: {}
    }).promise();
  }
};

const syncS3Buckets = async (s3, sourceRegion, sourceBucket, targetRegion, targetBucket) => {
  if (global.DRY_RUN) {
    console.log(`DRY RUN: Would sync from ${sourceBucket} (${sourceRegion}) to ${targetBucket} (${targetRegion})`);
    return;
  }
  
  await s3.sync(
    `s3://${sourceBucket}`,
    `s3://${targetBucket}`,
    {
      del: true,
      multipartUploadThreshold: 5 * 1024 * 1024, // 5MB
      multipartCopyThreshold: 5 * 1024 * 1024, // 5MB
      multipartUploadSize: 5 * 1024 * 1024, // 5MB per part
      concurrency: 10, // Number of concurrent uploads
    }
  );
};
  
module.exports = {
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration,
  syncS3Buckets
};