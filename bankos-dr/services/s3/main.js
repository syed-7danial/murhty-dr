const AWS = require('aws-sdk');
const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
const { S3SyncClient } = require('s3-sync-client');
const { fromEnv } = require("@aws-sdk/credential-provider-env");
const { program } = require('commander');
const chalk = require('chalk');
const { custom_logging } = require('../../helper/helper.js');
const { 
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration,
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

const performS3BucketSync = async (s3Settings) => {
  custom_logging(chalk.green("Starting S3 Bucket Sync Process"));

  // Determine source and target regions based on switching_to value
  const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
  const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

  // For each trigger/bucket pair in the configuration
  for (const trigger of s3Settings.triggers) {
    // Determine source and target buckets based on switching_to value
    const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
    const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;

    try {
      custom_logging(chalk.yellow(`Syncing from ${sourceBucket} (${sourceRegion}) to ${targetBucket} (${targetRegion})`));
      
      // IMPORTANT: Create the source client with the correct region for the source bucket
      const sourceS3Client = new S3Client({
        region: sourceRegion,
        credentials: fromEnv(),
        forcePathStyle: true // This can sometimes help with endpoint issues
      });
      
      // Create target client with the correct region for the target bucket
      const targetS3Client = new S3Client({
        region: targetRegion,
        credentials: fromEnv(),
        forcePathStyle: true
      });
      
      if (global.DRY_RUN) {
        custom_logging(chalk.blue(`[DRY RUN] Would sync s3://${sourceBucket} to s3://${targetBucket}`));
      } else {
        // Use a different approach - download and upload instead of direct sync
        // First, list all objects in the source bucket
        custom_logging(chalk.blue(`Listing objects in s3://${sourceBucket}`));
        
        // Create the S3SyncClient with proper configuration
        const { S3SyncClient } = require('s3-sync-client');
        const syncClient = new S3SyncClient({ 
          client: sourceS3Client,
          // Add extra options for troubleshooting
          maxAttempts: 5,
          debug: true
        });
        
        // Configure sync options
        const syncOptions = {
          targetClient: targetS3Client,
          del: true,
          dryRun: false,
          // Use regional endpoints explicitly
          commandInput: (command) => {
            return {
              ...command,
              ACL: 'bucket-owner-full-control'
            };
          }
        };
        
        custom_logging(chalk.blue(`Starting sync from s3://${sourceBucket} to s3://${targetBucket}`));
        
        // Handle sync
        try {
          const result = await syncClient.sync(`s3://${sourceBucket}`, `s3://${targetBucket}`, syncOptions);
          custom_logging(chalk.green(`Sync completed: ${result.copied} copied, ${result.deleted} deleted, ${result.skipped} skipped`));
        } catch (syncError) {
          // Try alternative approach with AWS SDK if s3-sync-client fails
          custom_logging(chalk.yellow(`Sync client failed. Trying alternative approach: ${syncError.message}`));
          
          // Use the AWS SDK directly for manual sync
          const sourceS3 = new AWS.S3({ region: sourceRegion });
          const targetS3 = new AWS.S3({ region: targetRegion });
          
          // List all objects in source bucket
          const listParams = { Bucket: sourceBucket };
          const listedObjects = await sourceS3.listObjectsV2(listParams).promise();
          
          if (listedObjects.Contents && listedObjects.Contents.length > 0) {
            custom_logging(chalk.blue(`Found ${listedObjects.Contents.length} objects to copy`));
            
            // Copy each object
            for (const object of listedObjects.Contents) {
              const copyParams = {
                Bucket: targetBucket,
                CopySource: `/${sourceBucket}/${object.Key}`,
                Key: object.Key,
                ACL: 'bucket-owner-full-control'
              };
              
              await targetS3.copyObject(copyParams).promise();
              custom_logging(`Copied: ${object.Key}`);
            }
            
            custom_logging(chalk.green(`Manual sync completed: ${listedObjects.Contents.length} objects copied`));
          } else {
            custom_logging(chalk.yellow('No objects found in source bucket'));
          }
        }
      }
    } catch (error) {
      custom_logging(chalk.red(`Error syncing bucket ${sourceBucket} to ${targetBucket}: ${error.message}`));
      if (error.stack) {
        custom_logging(chalk.red(`Stack trace: ${error.stack}`));
      }
      throw error; // Re-throw to handle in the main function
    }
  }
  
  custom_logging(chalk.green("S3 Bucket Sync Process completed"));
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
  await performS3BucketSync(config);
  await copyS3EventNotifications(config, processCurrentEnv);
  custom_logging(chalk.green("Process completed"));
};

mainFunction().catch(error => {
  custom_logging(chalk.red("Error: ") + error.message);
  process.exit(1);
});
