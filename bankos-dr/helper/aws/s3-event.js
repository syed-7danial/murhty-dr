// const AWS = require('aws-sdk');
// const chalk = require('chalk');
// const { custom_logging } = require('../helper.js');

// const updateArnRegion = (arn, sourceRegion, targetRegion) => {
//   if (arn.includes(`:${sourceRegion}:`)) {
//     return arn.replace(`:${sourceRegion}:`, `:${targetRegion}:`);
//   }
//   return arn;
// };

// const deleteEventNotifications = async (s3Client, bucket) => {
//   try {
//     custom_logging(chalk.yellow(`Deleting all event notifications from ${bucket}`));
//     if (global.DRY_RUN) return;
//     await s3Client.putBucketNotificationConfiguration({
//       Bucket: bucket,
//       NotificationConfiguration: {}
//     }).promise();
//     custom_logging(chalk.green(`Deleted all event notifications from ${bucket}`));
//   } catch (error) {
//     custom_logging(chalk.red(`Error deleting notifications from ${bucket}: ${error.message}`));
//   }
// };

// const copyS3EventNotifications = async (s3Settings, processCurrentEnv) => {
//   custom_logging(chalk.green("Starting S3 Event Notification Copy Process"));

//   const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
//   const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

//   for (const trigger of s3Settings.triggers) {
//     const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
//     const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;
//     const sourceS3 = new AWS.S3({ region: sourceRegion });
//     const targetS3 = new AWS.S3({ region: targetRegion });

//     try {
//       custom_logging(chalk.green(`Fetching event notifications from ${sourceBucket} in ${sourceRegion}`));
//       const sourceNotificationConfig = await sourceS3.getBucketNotificationConfiguration({ Bucket: sourceBucket }).promise();

//       custom_logging(chalk.blue(`Fetched Configuration for ${sourceBucket}:`));
//       custom_logging(JSON.stringify(sourceNotificationConfig, null, 2));

//       const updatedNotificationConfig = JSON.parse(JSON.stringify(sourceNotificationConfig));

//       if (updatedNotificationConfig.TopicConfigurations) {
//         updatedNotificationConfig.TopicConfigurations.forEach(config => {
//           config.TopicArn = updateArnRegion(config.TopicArn, sourceRegion, targetRegion);
//         });
//       }
//       if (updatedNotificationConfig.QueueConfigurations) {
//         updatedNotificationConfig.QueueConfigurations.forEach(config => {
//           config.QueueArn = updateArnRegion(config.QueueArn, sourceRegion, targetRegion);
//         });
//       }
//       if (updatedNotificationConfig.LambdaFunctionConfigurations) {
//         updatedNotificationConfig.LambdaFunctionConfigurations.forEach(config => {
//           config.LambdaFunctionArn = updateArnRegion(config.LambdaFunctionArn, sourceRegion, targetRegion);
//         });
//       }

//       custom_logging(chalk.yellow(`Updated Configuration for ${targetBucket}:`));
//       custom_logging(JSON.stringify(updatedNotificationConfig, null, 2));

//       if (!global.DRY_RUN) {
//         custom_logging(chalk.green(`Updating event notifications on ${targetBucket} in ${targetRegion}`));
//         await targetS3.putBucketNotificationConfiguration({
//           Bucket: targetBucket,
//           NotificationConfiguration: updatedNotificationConfig
//         }).promise();
//         custom_logging(chalk.green("Successfully replicated event notifications"));
//       } else {
//         custom_logging(chalk.green("[DRY RUN] Skipping update for event notifications"));
//       }
//     } catch (error) {
//       custom_logging(chalk.red(`Error copying notifications for ${sourceBucket}: ${error.message}`));
//     }
//   }

//   if (processCurrentEnv) {
//     for (const trigger of s3Settings.triggers) {
//       const currentRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
//       const currentBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
//       await deleteEventNotifications(new AWS.S3({ region: currentRegion }), currentBucket);
//     }
//   }
// };

// module.exports = {
//   updateArnRegion,
//   deleteEventNotifications,
//   copyS3EventNotifications
// };

const AWS = require('aws-sdk');
const chalk = require('chalk');
const { custom_logging } = require('../helper.js');

const putBucketNotificationConfiguration = async (s3Client, bucket, notificationConfig) => {
  if (global.DRY_RUN) {
    custom_logging(chalk.green(`[DRY RUN] Skipping update for event notifications on ${bucket}`));
    return;
  }
  try {
    custom_logging(chalk.green(`Updating event notifications on ${bucket}`));
    await s3Client.putBucketNotificationConfiguration({
      Bucket: bucket,
      NotificationConfiguration: notificationConfig
    }).promise();
    custom_logging(chalk.green("Successfully replicated event notifications"));
  } catch (error) {
    custom_logging(chalk.red(`Error updating event notifications on ${bucket}: ${error.message}`));
  }
};

const getBucketNotificationConfiguration = async (s3Client, bucket) => {
  try {
    custom_logging(chalk.green(`Fetching event notifications from ${bucket}`));
    return await s3Client.getBucketNotificationConfiguration({ Bucket: bucket }).promise();
  } catch (error) {
    custom_logging(chalk.red(`Error fetching event notifications from ${bucket}: ${error.message}`));
    return {};
  }
};

const deleteBucketNotificationConfiguration = async (s3Client, bucket) => {
  if (global.DRY_RUN) {
    custom_logging(chalk.green(`[DRY RUN] Skipping deletion of event notifications on ${bucket}`));
    return;
  }
  try {
    custom_logging(chalk.yellow(`Deleting all event notifications from ${bucket}`));
    await s3Client.putBucketNotificationConfiguration({
      Bucket: bucket,
      NotificationConfiguration: {}
    }).promise();
    custom_logging(chalk.green(`Deleted all event notifications from ${bucket}`));
  } catch (error) {
    custom_logging(chalk.red(`Error deleting notifications from ${bucket}: ${error.message}`));
  }
};

module.exports = {
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration
};
