const { custom_logging } = require('../../helper/helper.js');
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const path = require('path');
const readFileAsync = promisify(fs.readFile);

const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 }
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const replicateS3EventNotifications = async (config) => {
  custom_logging(chalk.green("Starting S3 event notifications replication"));

  const activeRegion = config.active_region;
  const failoverRegion = config.failover_region;
  const activeBucket = config.s3_trigger_configuration[0].active_bucket_name;
  const failoverBucket = config.s3_trigger_configuration[0].failover_bucket_name;

  const activeS3 = new AWS.S3({ region: activeRegion });
  const failoverS3 = new AWS.S3({ region: failoverRegion });

  try {
    // Fetch event notification configuration from the active bucket
    const activeConfig = await activeS3.getBucketNotificationConfiguration({ Bucket: activeBucket }).promise();

    // Store events based on trigger type
    const failoverTriggers = config.s3_trigger_configuration[0].event_notifications;
    const updatedConfig = { LambdaFunctionConfigurations: [], QueueConfigurations: [], TopicConfigurations: [] };

    // Handle Lambda triggers
    if (activeConfig.LambdaFunctionConfigurations) {
      activeConfig.LambdaFunctionConfigurations.forEach((lambdaTrigger) => {
        const activeLambdaName = lambdaTrigger.LambdaFunctionArn.split(":function:")[1];
        const failoverLambda = failoverTriggers.lambda_triggers.find(lt => lt.active_lambda === activeLambdaName);

        if (failoverLambda) {
          updatedConfig.LambdaFunctionConfigurations.push({
            LambdaFunctionArn: lambdaTrigger.LambdaFunctionArn.replace(activeLambdaName, failoverLambda.failover_lambda),
            Events: lambdaTrigger.Events
          });
        }
      });
    }

    // Handle SQS triggers
    if (activeConfig.QueueConfigurations) {
      activeConfig.QueueConfigurations.forEach((sqsTrigger) => {
        const activeSqsName = sqsTrigger.QueueArn.split(":sqs:")[1];
        const failoverSqs = failoverTriggers.sqs_triggers.find(sq => sq.active_sqs === activeSqsName);

        if (failoverSqs) {
          updatedConfig.QueueConfigurations.push({
            QueueArn: sqsTrigger.QueueArn.replace(activeSqsName, failoverSqs.failover_sqs),
            Events: sqsTrigger.Events
          });
        }
      });
    }

    // Handle SNS triggers
    if (activeConfig.TopicConfigurations) {
      activeConfig.TopicConfigurations.forEach((snsTrigger) => {
        const activeSnsName = snsTrigger.TopicArn.split(":sns:")[1];
        const failoverSns = failoverTriggers.sns_triggers.find(st => st.active_sns === activeSnsName);

        if (failoverSns) {
          updatedConfig.TopicConfigurations.push({
            TopicArn: snsTrigger.TopicArn.replace(activeSnsName, failoverSns.failover_sns),
            Events: snsTrigger.Events
          });
        }
      });
    }

    // Apply updated event notifications to failover bucket
    await failoverS3.putBucketNotificationConfiguration({
      Bucket: failoverBucket,
      NotificationConfiguration: updatedConfig
    }).promise();

    custom_logging(chalk.green("Successfully replicated S3 event notifications to failover bucket"));
  } catch (error) {
    custom_logging(chalk.red("Error replicating S3 event notifications: ") + error.message);
  }
};

const mainFunction = async () => {
  program.version('0.0.1').option('-dr --dryRun', "Dry run the process").parse(process.argv);

  const options = program.opts();
  const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
  let config = await readAndParseFile(file);

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  await replicateS3EventNotifications(config);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
