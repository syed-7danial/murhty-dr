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

const copyEventNotifications = async (triggers) => {
  custom_logging(chalk.green("Starting S3 Event Notification Copy"));
  
  for (const trigger of triggers) {
    const { active_bucket, failover_bucket } = trigger;
    try {
      const activeConfig = await s3.getBucketNotificationConfiguration({ Bucket: active_bucket }).promise();
      
      await s3.putBucketNotificationConfiguration({
        Bucket: failover_bucket,
        NotificationConfiguration: activeConfig
      }).promise();
      
      custom_logging(chalk.green(`Copied event notifications from ${active_bucket} to ${failover_bucket}`));
    } catch (error) {
      custom_logging(chalk.red(`Error copying event notifications for ${active_bucket}: ${error.message}`));
    }
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on the current environment")
    .parse(process.argv);

  const options = program.opts();
  const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
  let envs = await readAndParseFile(file);
  envs['switching_to'] = process.env.SWITCHING_TO;

  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  if (options.processCurrentEnvironment) {
    global.PROCESS_CURRENT_ENVIRONMENT = true;
    custom_logging(chalk.red("Current environment will be processed"));
  } else {
    custom_logging(chalk.yellow("Current environment will not be processed"));
  }

  custom_logging(`Switching to ${chalk.green(envs.switching_to)} environment`);
  await copyEventNotifications(envs.triggers);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });