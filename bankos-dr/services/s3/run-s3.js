const AWS = require('aws-sdk');
const fs = require('fs');
const { promisify } = require('util');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { custom_logging } = require('../../helper/helper.js');

const readFileAsync = promisify(fs.readFile);

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
  custom_logging(chalk.green(`arn: ${arn}`));
  return arn;
};

const deleteEventNotifications = async (s3Client, bucket) => {
  try {
    custom_logging(chalk.yellow(`Deleting all event notifications from ${bucket}`));
    
    const emptyNotificationConfig = {};
    
    await s3Client.putBucketNotificationConfiguration({
      Bucket: bucket,
      NotificationConfiguration: emptyNotificationConfig
    }).promise();
    
    custom_logging(chalk.green(`Successfully deleted all event notifications from ${bucket}`));
    return true;
  } catch (error) {
    custom_logging(chalk.red(`Error deleting event notifications from ${bucket}: ${error.message}`));
    custom_logging(chalk.red(`Error stack: ${error.stack}`));
    return false;
  }
};

const copyS3EventNotifications = async (s3Settings, processCurrentEnv) => {
  custom_logging(chalk.green("Starting S3 Event Notification Copy Process"));

  let sourceRegion, targetRegion, sourceBucket, targetBucket, currentRegion, currentBucket;

  if (s3Settings.switching_to === "ACTIVE") {
    sourceRegion = s3Settings.failover_region;
    targetRegion = s3Settings.active_region;
    sourceBucket = s3Settings.triggers[0].failover_bucket;
    targetBucket = s3Settings.triggers[0].active_bucket;
    currentRegion = s3Settings.failover_region;
    currentBucket = s3Settings.triggers[0].failover_bucket;
  } else {
    sourceRegion = s3Settings.active_region;
    targetRegion = s3Settings.failover_region;
    sourceBucket = s3Settings.triggers[0].active_bucket;
    targetBucket = s3Settings.triggers[0].failover_bucket;
    currentRegion = s3Settings.active_region;
    currentBucket = s3Settings.triggers[0].active_bucket;
  }

  const sourceS3 = new AWS.S3({ region: sourceRegion });
  const targetS3 = new AWS.S3({ region: targetRegion });
  const currentS3 = new AWS.S3({ region: currentRegion });

  try {
    custom_logging(chalk.green(`Fetching event notifications from ${sourceBucket} in ${sourceRegion}`));
    
    const sourceNotificationConfig = await sourceS3.getBucketNotificationConfiguration({ Bucket: sourceBucket }).promise();
    custom_logging(chalk.green(`Retrieved source notification config: ${JSON.stringify(sourceNotificationConfig, null, 2)}`));

    const updatedNotificationConfig = JSON.parse(JSON.stringify(sourceNotificationConfig)); // Deep copy

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

    custom_logging(chalk.green(`Updated notification config: ${JSON.stringify(updatedNotificationConfig, null, 2)}`));

    custom_logging(chalk.green(`Updating event notifications on ${targetBucket} in ${targetRegion}`));

    await targetS3.putBucketNotificationConfiguration({
      Bucket: targetBucket,
      NotificationConfiguration: updatedNotificationConfig
    }).promise();

    custom_logging(chalk.green("Successfully replicated event notifications with region modification"));

    if (processCurrentEnv) {
      custom_logging(chalk.yellow(`Process Current Environment flag is enabled. Deleting notifications in current environment.`));
      await deleteEventNotifications(currentS3, currentBucket);
    } else {
      custom_logging(chalk.yellow(`Process Current Environment flag is disabled. Keeping current environment notifications.`));
    }
  } catch (error) {
    custom_logging(chalk.red("Error copying S3 event notifications: ") + error.message);
    custom_logging(chalk.red("Error stack: ") + error.stack);
    throw error; 
  }
};

const mainFunction = async () => {
  program
    .version('1.0.0')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .parse(process.argv);

  const options = program.opts();

  const configFile = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
  let config = await readAndParseFile(configFile);

  config['switching_to'] = process.env.SWITCHING_TO;

  const processCurrentEnv = process.env.PROCESS_CURRENT_ENV === 'true';

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);
  custom_logging(`Process Current Environment: ${processCurrentEnv ? chalk.green('ENABLED') : chalk.red('DISABLED')}`);

  await copyS3EventNotifications(config, processCurrentEnv);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => custom_logging(chalk.green("Exiting ...")))
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
    custom_logging(chalk.red("Error stack: ") + error.stack);
    process.exit(1);
  });