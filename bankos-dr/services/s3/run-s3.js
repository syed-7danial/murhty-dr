// const { custom_logging } = require('../../helper/helper.js');
// const AWS = require('aws-sdk');
// const chalk = require('chalk');
// const { promisify } = require('util');
// const fs = require('fs');
// const path = require('path');
// const { program } = require('commander');

// const readFileAsync = promisify(fs.readFile);
// AWS.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   sessionToken: process.env.AWS_SESSION_TOKEN,
//   maxRetries: 5,
//   retryDelayOptions: { base: 200 }
// });

// const s3 = new AWS.S3();

// const readAndParseFile = async (file) => {
//   const data = await readFileAsync(file, { encoding: 'utf-8' });
//   return JSON.parse(data);
// };

// const copyEventNotifications = async (triggers) => {
//   custom_logging(chalk.green("Starting S3 Event Notification Copy"));
  
//   for (const trigger of triggers) {
//     const { active_bucket, failover_bucket } = trigger;
//     try {
//       const activeConfig = await s3.getBucketNotificationConfiguration({ Bucket: active_bucket }).promise();
      
//       await s3.putBucketNotificationConfiguration({
//         Bucket: failover_bucket,
//         NotificationConfiguration: activeConfig
//       }).promise();
      
//       custom_logging(chalk.green(`Copied event notifications from ${active_bucket} to ${failover_bucket}`));
//     } catch (error) {
//       custom_logging(chalk.red(`Error copying event notifications for ${active_bucket}: ${error.message}`));
//     }
//   }
// };

// const mainFunction = async () => {
//   program
//     .version('0.0.1')
//     .option('-dr --dryRun', "Dry run the process")
//     .option('-pce --processCurrentEnvironment', "Whether to perform the process on the current environment")
//     .parse(process.argv);

//   const options = program.opts();
//   const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
//   let envs = await readAndParseFile(file);
//   envs['switching_to'] = process.env.SWITCHING_TO;

//   if (options.dryRun) {
//     global.DRY_RUN = true;
//     custom_logging(chalk.yellow("DRY RUN is enabled"));
//   } else {
//     custom_logging(chalk.red("DRY RUN is disabled"));
//   }

//   if (options.processCurrentEnvironment) {
//     global.PROCESS_CURRENT_ENVIRONMENT = true;
//     custom_logging(chalk.red("Current environment will be processed"));
//   } else {
//     custom_logging(chalk.yellow("Current environment will not be processed"));
//   }

//   custom_logging(`Switching to ${chalk.green(envs.switching_to)} environment`);
//   await copyEventNotifications(envs.triggers);
//   custom_logging(chalk.green("Process has been completed"));
// };

// mainFunction()
//   .then(() => {
//     custom_logging(chalk.green("Exiting ..."));
//   })
//   .catch((error) => {
//     custom_logging(chalk.red("Error: ") + error.message);
//   });

const { custom_logging } = require('../../helper/helper.js');
const AWS = require('aws-sdk');
const chalk = require('chalk');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

const readFileAsync = promisify(fs.readFile);

// Configure AWS SDK
const configureAWS = (region) => {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: region,
    maxRetries: 5,
    retryDelayOptions: { base: 200 }
  });
  return new AWS.S3();
};

const readAndParseFile = async (file) => {
  try {
    const data = await readFileAsync(file, { encoding: 'utf-8' });
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read or parse file ${file}: ${error.message}`);
  }
};

const copyEventNotifications = async (triggers, config) => {
  custom_logging(chalk.green("Starting S3 Event Notification Copy"));
  
  // Initialize S3 clients for both regions
  const activeRegionS3 = configureAWS(config.active_region);
  const failoverRegionS3 = configureAWS(config.failover_region);
  
  for (const trigger of triggers) {
    const { active_bucket, failover_bucket } = trigger;
    try {
      custom_logging(chalk.yellow(`Getting notification config from: ${active_bucket} in ${config.active_region}`));
      
      // Get notifications from active bucket
      const activeConfig = await activeRegionS3.getBucketNotificationConfiguration({ Bucket: active_bucket }).promise();
      
      custom_logging(chalk.blue(`Notification config: ${JSON.stringify(activeConfig, null, 2)}`));
      
      if (global.DRY_RUN) {
        custom_logging(chalk.yellow(`[DRY RUN] Would copy to ${failover_bucket} in ${config.failover_region}`));
      } else {
        // Put notifications to failover bucket
        await failoverRegionS3.putBucketNotificationConfiguration({
          Bucket: failover_bucket,
          NotificationConfiguration: activeConfig
        }).promise();
        
        custom_logging(chalk.green(`Copied event notifications from ${active_bucket} to ${failover_bucket}`));
      }
    } catch (error) {
      custom_logging(chalk.red(`Error copying event notifications for ${active_bucket} to ${failover_bucket}: ${error.message}`));
      // Log the full error details for debugging
      custom_logging(chalk.red(`Error details: ${JSON.stringify(error, null, 2)}`));
    }
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr, --dryRun', "Dry run the process")
    .option('-pce, --processCurrentEnvironment', "Whether to perform the process on the current environment")
    .parse(process.argv);

  const options = program.opts();
  const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
  
  try {
    const config = await readAndParseFile(file);
    
    // Set global variables based on command line options
    global.DRY_RUN = options.dryRun || false;
    global.PROCESS_CURRENT_ENVIRONMENT = options.processCurrentEnvironment || false;
    
    if (global.DRY_RUN) {
      custom_logging(chalk.yellow("DRY RUN is enabled"));
    } else {
      custom_logging(chalk.red("DRY RUN is disabled"));
    }

    if (global.PROCESS_CURRENT_ENVIRONMENT) {
      custom_logging(chalk.red("Current environment will be processed"));
    } else {
      custom_logging(chalk.yellow("Current environment will not be processed"));
    }

    const switchingTo = process.env.SWITCHING_TO || 'unknown';
    custom_logging(`Switching to ${chalk.green(switchingTo)} environment`);
    
    // Use the config object directly
    await copyEventNotifications(config.triggers, config);
    
    custom_logging(chalk.green("Process has been completed"));
  } catch (error) {
    custom_logging(chalk.red(`Fatal error: ${error.message}`));
    process.exit(1);
  }
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
    process.exit(1);
  });