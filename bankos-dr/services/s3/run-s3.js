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

// Read and parse configuration file
const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

// Function to replace ARNs with the target region
const updateArnRegion = (arn, sourceRegion, targetRegion) => {
  if (arn.includes(`:${sourceRegion}:`)) {
    return arn.replace(`:${sourceRegion}:`, `:${targetRegion}:`);
  }
  custom_logging(chalk.green(`arn: ${arn}`));
  return arn;
};

// Function to copy and modify S3 event notifications
const copyS3EventNotifications = async (s3Settings) => {
  custom_logging(chalk.green("Starting S3 Event Notification Copy Process"));

  let sourceRegion, targetRegion, sourceBucket, targetBucket;

  if (s3Settings.switching_to === "ACTIVE") {
    // Switching to ACTIVE means we're copying FROM failover TO active
    sourceRegion = s3Settings.failover_region;
    targetRegion = s3Settings.active_region;
    sourceBucket = s3Settings.triggers[0].failover_bucket;
    targetBucket = s3Settings.triggers[0].active_bucket;
  } else {
    // Switching to FAILOVER means we're copying FROM active TO failover
    sourceRegion = s3Settings.active_region;
    targetRegion = s3Settings.failover_region;
    sourceBucket = s3Settings.triggers[0].active_bucket;
    targetBucket = s3Settings.triggers[0].failover_bucket;
  }

  // Create S3 clients with the correct regions
  const sourceS3 = new AWS.S3({ region: sourceRegion });
  const targetS3 = new AWS.S3({ region: targetRegion });

  try {
    custom_logging(chalk.green(`Fetching event notifications from ${sourceBucket} in ${sourceRegion}`));
    
    const sourceNotificationConfig = await sourceS3.getBucketNotificationConfiguration({ Bucket: sourceBucket }).promise();
    custom_logging(chalk.green(`Retrieved source notification config: ${JSON.stringify(sourceNotificationConfig, null, 2)}`));

    // Modify ARNs to match the target region
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

    // Apply the updated notification configuration to the target bucket
    custom_logging(chalk.green(`Updating event notifications on ${targetBucket} in ${targetRegion}`));

    await targetS3.putBucketNotificationConfiguration({
      Bucket: targetBucket,
      NotificationConfiguration: updatedNotificationConfig
    }).promise();

    custom_logging(chalk.green("Successfully replicated event notifications with region modification"));
  } catch (error) {
    custom_logging(chalk.red("Error copying S3 event notifications: ") + error.message);
    custom_logging(chalk.red("Error stack: ") + error.stack);
  }
};

// Main function
const mainFunction = async () => {
  program
    .version('1.0.0')
    .option('-dr --dryRun', "Dry run the process")
    .parse(process.argv);

  const options = program.opts();

  const configFile = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
  let config = await readAndParseFile(configFile);

  config['switching_to'] = process.env.SWITCHING_TO;

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);

  await copyS3EventNotifications(config);
  custom_logging(chalk.green("Process has been completed"));
};

// Run the script
mainFunction()
  .then(() => custom_logging(chalk.green("Exiting ...")))
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
    custom_logging(chalk.red("Stack: ") + error.stack);
    process.exit(1);
  });