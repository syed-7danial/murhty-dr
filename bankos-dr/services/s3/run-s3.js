const { custom_logging } = require('../../helper/helper.js');
const AWS = require('aws-sdk');
const chalk = require('chalk');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const readFileAsync = promisify(fs.readFile);

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const replicateEventNotifications = async (config) => {
  try {
    const { active_bucket_name, failover_bucket_name, active_region, failover_region, event_notifications } = config;

    const s3Active = new AWS.S3({ region: active_region });
    const s3Failover = new AWS.S3({ region: failover_region });

    custom_logging(chalk.green(`Fetching event notifications from ${active_bucket_name} in ${active_region}`));

    const activeConfig = await s3Active.getBucketNotificationConfiguration({ Bucket: active_bucket_name }).promise();

    const updateArnRegion = (arn, newRegion) => {
      const arnParts = arn.split(":");
      arnParts[3] = newRegion; // AWS region is the 4th part in ARN
      return arnParts.join(":");
    };

    const newConfig = {
      LambdaFunctionConfigurations: activeConfig.LambdaFunctionConfigurations?.map(config => ({
        ...config,
        LambdaFunctionArn: updateArnRegion(config.LambdaFunctionArn, failover_region)
      })) || [],

      QueueConfigurations: activeConfig.QueueConfigurations?.map(config => ({
        ...config,
        QueueArn: updateArnRegion(config.QueueArn, failover_region)
      })) || [],

      TopicConfigurations: activeConfig.TopicConfigurations?.map(config => ({
        ...config,
        TopicArn: updateArnRegion(config.TopicArn, failover_region)
      })) || []
    };

    await s3Failover.putBucketNotificationConfiguration({
      Bucket: failover_bucket_name,
      NotificationConfiguration: newConfig
    }).promise();

    custom_logging(chalk.green(`Successfully replicated event notifications to ${failover_bucket_name} in ${failover_region}`));
  } catch (error) {
    custom_logging(chalk.red(`Error replicating event notifications: ${error.message}`));
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .parse(process.argv);

  const options = program.opts();
  const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');

  let config = await readAndParseFile(file);
  const { active_region, failover_region } = config;

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  custom_logging(`Switching to ${chalk.green(failover_region)} environment`);
  await replicateEventNotifications({ ...config.s3_trigger_configuration[0], active_region, failover_region });
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
