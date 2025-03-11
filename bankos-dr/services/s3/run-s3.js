const { custom_logging } = require('../../helper/helper.js');
const AWS = require('aws-sdk');
const chalk = require('chalk');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const readFileAsync = promisify(fs.readFile);
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 }
});

const s3 = new AWS.S3();

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const replicateEventNotifications = async (config) => {
  try {
    const { active_bucket_name, failover_bucket_name, event_notifications } = config;
    custom_logging(chalk.green(`Fetching event notifications for ${active_bucket_name}`));
    const activeConfig = await s3.getBucketNotificationConfiguration({ Bucket: active_bucket_name }).promise();
    
    const newConfig = {
      LambdaFunctionConfigurations: activeConfig.LambdaFunctionConfigurations?.map(config => {
        const failoverLambda = event_notifications.lambda_triggers.find(trigger => trigger.active_lambda === config.LambdaFunctionArn.split(':').pop());
        return failoverLambda ? { ...config, LambdaFunctionArn: config.LambdaFunctionArn.replace(config.LambdaFunctionArn.split(':').pop(), failoverLambda.failover_lambda) } : null;
      }).filter(Boolean) || [],
      
      QueueConfigurations: activeConfig.QueueConfigurations?.map(config => {
        const failoverSqs = event_notifications.sqs_triggers.find(trigger => trigger.active_sqs === config.QueueArn.split(':').pop());
        return failoverSqs ? { ...config, QueueArn: config.QueueArn.replace(config.QueueArn.split(':').pop(), failoverSqs.failover_sqs) } : null;
      }).filter(Boolean) || [],
      
      TopicConfigurations: activeConfig.TopicConfigurations?.map(config => {
        const failoverSns = event_notifications.sns_triggers.find(trigger => trigger.active_sns === config.TopicArn.split(':').pop());
        return failoverSns ? { ...config, TopicArn: config.TopicArn.replace(config.TopicArn.split(':').pop(), failoverSns.failover_sns) } : null;
      }).filter(Boolean) || []
    };
    
    await s3.putBucketNotificationConfiguration({
      Bucket: failover_bucket_name,
      NotificationConfiguration: newConfig
    }).promise();
    
    custom_logging(chalk.green(`Successfully copied event notifications from ${active_bucket_name} to ${failover_bucket_name}`));
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
  let envs = await readAndParseFile(file);

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  custom_logging(`Switching to ${chalk.green(envs.failover_region)} environment`);
  await replicateEventNotifications(envs.s3_trigger_configuration[0]);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
