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
    const { active_region, failover_region, active_bucket_name, failover_bucket_name, event_notifications } = config;

    custom_logging(chalk.green(`Fetching event notifications from ${active_bucket_name} in ${active_region}`));

    // Set AWS SDK to active region
    const activeS3 = new AWS.S3({ region: active_region });
    const activeConfig = await activeS3.getBucketNotificationConfiguration({ Bucket: active_bucket_name }).promise();

    // Switch to failover region
    const failoverS3 = new AWS.S3({ region: failover_region });

    // Function to map triggers based on config
    const mapTriggers = (configurations, triggerType, mappingKey) =>
      configurations?.map(config => {
        const triggerMapping = event_notifications[mappingKey].find(trigger => trigger[`active_${triggerType}`] === config[`${triggerType}Arn`].split(':').pop());
        return triggerMapping ? { ...config, [`${triggerType}Arn`]: config[`${triggerType}Arn`].replace(/[^:]+$/, triggerMapping[`failover_${triggerType}`]) } : null;
      }).filter(Boolean) || [];

    // Generate new event configuration for failover
    const newConfig = {
      LambdaFunctionConfigurations: mapTriggers(activeConfig.LambdaFunctionConfigurations, "LambdaFunction", "lambda_triggers"),
      QueueConfigurations: mapTriggers(activeConfig.QueueConfigurations, "Queue", "sqs_triggers"),
      TopicConfigurations: mapTriggers(activeConfig.TopicConfigurations, "Topic", "sns_triggers")
    };

    // Apply updated event notifications to the failover bucket
    await failoverS3.putBucketNotificationConfiguration({
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

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  custom_logging(`Switching to ${chalk.green(config.failover_region)} environment`);
  await replicateEventNotifications(config.s3_trigger_configuration[0]);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
