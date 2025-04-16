const { custom_logging }  = require ("../helper.js");
const { spawn } = require('child_process');

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

const syncS3Buckets = async (sourceRegion, targetRegion, sourceBucket, targetBucket, options = {}) => {
  const {
    prefix = '',
    deleteExtraFiles = false,
    maxConcurrency = 10,
  } = options;

  return new Promise((resolve, reject) => {
    if (global.DRY_RUN) {
      custom_logging(`[DRY RUN] Would sync from s3://${sourceBucket}/${prefix} to s3://${targetBucket}/${prefix}`);
      return resolve({
        success: true,
        transferred: 0,
        skipped: 0,
        dryRun: true
      });
    }

    const args = [
      's3', 'sync',
      `s3://${sourceBucket}/${prefix}`,
      `s3://${targetBucket}/${prefix}`,
      '--region', sourceRegion,
      '--source-region', sourceRegion,
      '--sse', // Enable server-side encryption
      '--only-show-errors',
      `--cli-connect-timeout`, '30'
    ];

    // Add delete flag if needed
    if (deleteExtraFiles) {
      args.push('--delete');
    }

    // Add concurrency option
    args.push('--max-concurrent-requests', maxConcurrency.toString());

    custom_logging(`Starting S3 sync: aws ${args.join(' ')}`);

    // Create environment with AWS credentials
    const env = {
      ...process.env,
      AWS_REGION: targetRegion,
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
      AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN
    };

    const awsProcess = spawn('aws', args, { env });
    
    let stdoutData = '';
    let stderrData = '';

    awsProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      custom_logging(`[S3 SYNC] ${data.toString().trim()}`);
    });

    awsProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
      custom_logging(`[S3 SYNC ERROR] ${data.toString().trim()}`);
    });

    awsProcess.on('close', (code) => {
      if (code === 0) {
        custom_logging(`S3 sync completed successfully from ${sourceBucket} to ${targetBucket}`);
        resolve({
          success: true,
          output: stdoutData
        });
      } else {
        custom_logging(`S3 sync failed with code ${code} from ${sourceBucket} to ${targetBucket}`);
        reject(new Error(`S3 sync failed: ${stderrData}`));
      }
    });
  });
};

module.exports = {
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration,
  syncS3Buckets
 };