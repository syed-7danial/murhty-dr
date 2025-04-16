const AWS = require('aws-sdk');
const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
// const { S3Client } = require('@aws-sdk/client-s3');
// const { S3SyncClient } = require('s3-sync-client');
// const { fromEnv } = require("@aws-sdk/credential-provider-env");
const { program } = require('commander');
const chalk = require('chalk');
// const s3p = require('s3p');
const { custom_logging } = require('../../helper/helper.js');
const { 
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration,
  syncS3Buckets
} = require('../../helper/aws/s3.js');

const readFileAsync = promisify(fs.readFile);
global.DRY_RUN = false;

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 },
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const updateArnRegion = (arn, sourceRegion, targetRegion) => {
  if (arn.includes(`:${sourceRegion}:`)) {
    return arn.replace(`:${sourceRegion}:`, `:${targetRegion}:`);
  }
  return arn;
};

const syncS3BucketContents = async (s3Settings) => {
  custom_logging(chalk.green("Starting S3 Bucket Content Synchronization Process"));

  const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
  const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

  for (const trigger of s3Settings.triggers) {
    const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
    const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;
    
    const sourceS3 = new AWS.S3({ region: sourceRegion });
    const targetS3 = new AWS.S3({ region: targetRegion });

    try {
      // Get object counts before sync for reporting
      // const sourceObjectCount = await getObjectsCount(sourceS3, sourceBucket);
      // const targetObjectCount = await getObjectsCount(targetS3, targetBucket);
      
      custom_logging(chalk.green(`Syncing contents from ${sourceBucket} in ${sourceRegion} to ${targetBucket} in ${targetRegion}`));
      
      const syncOptions = {
        prefix: '', 
        deleteExtraFiles: false, 
        maxConcurrency: 20,
      };

      const syncResults = await syncS3Buckets(
        sourceRegion,
        targetRegion,
        sourceBucket, 
        targetBucket, 
        syncOptions
      );

      // Get object count after sync for reporting
      const targetObjectCountAfter = await getObjectsCount(targetS3, targetBucket);
      
      custom_logging(chalk.green(`Sync completed for ${sourceBucket} → ${targetBucket}`));
      custom_logging(chalk.blue(`Target bucket now has ${targetObjectCountAfter} objects (was ${targetObjectCount} before sync)`));
      
    } catch (error) {
      custom_logging(chalk.red(`Error syncing buckets ${sourceBucket} to ${targetBucket}: ${error.message}`));
    }
  }
};

const copyS3EventNotifications = async (s3Settings, processCurrentEnv) => {
  custom_logging(chalk.green("Starting S3 Event Notification Copy Process"));

  const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
  const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

  for (const trigger of s3Settings.triggers) {
    const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
    const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;
    const sourceS3 = new AWS.S3({ region: sourceRegion });
    const targetS3 = new AWS.S3({ region: targetRegion });

    try {
      custom_logging(chalk.green(`Fetching event notifications from ${sourceBucket} in ${sourceRegion}`));
      const sourceNotificationConfig = await getBucketNotificationConfiguration(sourceS3, sourceBucket);

      custom_logging(chalk.blue(`Fetched Configuration for ${sourceBucket}:`));
      custom_logging(JSON.stringify(sourceNotificationConfig, null, 2));

      const updatedNotificationConfig = JSON.parse(JSON.stringify(sourceNotificationConfig));

      if (updatedNotificationConfig.TopicConfigurations) {
        updatedNotificationConfig.TopicConfigurations.forEach(config => {
          config.TopicArn = updateArnRegion(config.TopicArn, sourceRegion, targetRegion);
        });
      }
      if (updatedNotificationConfig.QueueConfigurations) {
        updatedNotificationConfig.QueueConfigurations.forEach(config => {
          config.QueueArn = updateArnRegion(config.QueueArn, sourceRegion, targetRegion);
        });
      }
      if (updatedNotificationConfig.LambdaFunctionConfigurations) {
        updatedNotificationConfig.LambdaFunctionConfigurations.forEach(config => {
          config.LambdaFunctionArn = updateArnRegion(config.LambdaFunctionArn, sourceRegion, targetRegion);
        });
      }

      custom_logging(chalk.yellow(`Updated Configuration for ${targetBucket}:`));
      custom_logging(JSON.stringify(updatedNotificationConfig, null, 2));

      await putBucketNotificationConfiguration(targetS3, targetBucket, updatedNotificationConfig);
    } catch (error) {
      custom_logging(chalk.red(`Error copying notifications for ${sourceBucket}: ${error.message}`));
    }
  }

  if (processCurrentEnv) {
    for (const trigger of s3Settings.triggers) {
      const currentRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
      const currentBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
      const s3Client = new AWS.S3({ region: currentRegion });
      custom_logging(chalk.yellow(`Deleting event notifications from ${currentBucket} in ${currentRegion}`));
      await deleteBucketNotificationConfiguration(s3Client, currentBucket);
      custom_logging(chalk.green(`Successfully deleted event notifications from ${currentBucket} in ${currentRegion}`));
    }
  }
};

const mainFunction = async () => {
  program
    .version('1.0.0')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Process current environment")
    .parse(process.argv);

  const options = program.opts();
  global.DRY_RUN = options.dryRun || false;
  const configFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 's3', 'configuration.json');
  let config = await readAndParseFile(configFile);
  config['switching_to'] = process.env.SWITCHING_TO;
  const processCurrentEnv = process.env.PROCESS_CURRENT_ENV === 'true';
  custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);

  await syncS3BucketContents(config);
  await copyS3EventNotifications(config, processCurrentEnv);
  custom_logging(chalk.green("Process completed"));
};

mainFunction().catch(error => {
  custom_logging(chalk.red("Error: ") + error.message);
  process.exit(1);
});
