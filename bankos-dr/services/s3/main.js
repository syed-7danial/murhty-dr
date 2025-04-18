// const AWS = require('aws-sdk');
// const fs = require('fs');
// const { promisify } = require('util');
// const { spawn } = require('child_process');
// const path = require('path');
// const { program } = require('commander');
// const chalk = require('chalk');
// const { custom_logging } = require('../../helper/helper.js');
// const { 
//   putBucketNotificationConfiguration,
//   getBucketNotificationConfiguration,
//   deleteBucketNotificationConfiguration
// } = require('../../helper/aws/s3.js');

// const readFileAsync = promisify(fs.readFile);
// global.DRY_RUN = false;

// AWS.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   sessionToken: process.env.AWS_SESSION_TOKEN,
//   maxRetries: 5,
//   retryDelayOptions: { base: 200 },
// });

// const readAndParseFile = async (file) => {
//   const data = await readFileAsync(file, { encoding: 'utf-8' });
//   return JSON.parse(data);
// };

// const updateArnRegion = (arn, sourceRegion, targetRegion) => {
//   if (arn.includes(`:${sourceRegion}:`)) {
//     return arn.replace(`:${sourceRegion}:`, `:${targetRegion}:`);
//   }
//   return arn;
// };

// const getObjectsCount = async (s3Client, bucketName) => {
//   try {
//     const result = await s3Client.listObjectsV2({ Bucket: bucketName }).promise();
//     return result.KeyCount || 0;
//   } catch (error) {
//     custom_logging(chalk.red(`Error counting objects in ${bucketName}: ${error.message}`));
//     return 0;
//   }
// };

// const syncS3Buckets = async (sourceRegion, targetRegion, sourceBucket, targetBucket, options = {}) => {
//   const {
//     prefix = '',
//     deleteExtraFiles = false,
//     maxConcurrency = 10,
//   } = options;

//   return new Promise((resolve, reject) => {
//     if (global.DRY_RUN) {
//       custom_logging(`[DRY RUN] Would sync from s3://${sourceBucket}/${prefix} to s3://${targetBucket}/${prefix}`);
//       return resolve({
//         success: true,
//         transferred: 0,
//         skipped: 0,
//         dryRun: true
//       });
//     }

//     custom_logging(`Checking for AWS CLI...`);
//     // Verify AWS CLI exists
//     const checkAwsCli = spawn('which', ['aws']);
    
//     checkAwsCli.on('close', (code) => {
//       if (code !== 0) {
//         return reject(new Error('AWS CLI is not installed or not in PATH. Please install AWS CLI first.'));
//       }
      
//       const args = [
//         's3', 'sync',
//         `s3://${sourceBucket}/${prefix}`,
//         `s3://${targetBucket}/${prefix}`,
//         '--region', targetRegion,
//         '--source-region', sourceRegion,
//         '--sse', // Enable server-side encryption
//         '--only-show-errors',
//         `--cli-connect-timeout`, '30'
//       ];

//       if (deleteExtraFiles) {
//         args.push('--delete');
//       }

//       custom_logging(`Starting S3 sync: aws ${args.join(' ')}`);

//       const env = {
//         ...process.env,
//         AWS_REGION: targetRegion,
//         AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
//         AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
//         AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
//         AWS_MAX_CONCURRENT_REQUESTS: maxConcurrency.toString()
//       };

//       const awsProcess = spawn('aws', args, { env });
      
//       let stdoutData = '';
//       let stderrData = '';

//       awsProcess.stdout.on('data', (data) => {
//         stdoutData += data.toString();
//         custom_logging(`[S3 SYNC] ${data.toString().trim()}`);
//       });

//       awsProcess.stderr.on('data', (data) => {
//         stderrData += data.toString();
//         custom_logging(`[S3 SYNC ERROR] ${data.toString().trim()}`);
//       });

//       awsProcess.on('close', (code) => {
//         if (code === 0) {
//           custom_logging(`S3 sync completed successfully from ${sourceBucket} to ${targetBucket}`);
//           resolve({
//             success: true,
//             output: stdoutData
//           });
//         } else {
//           custom_logging(`S3 sync failed with code ${code} from ${sourceBucket} to ${targetBucket}`);
//           reject(new Error(`S3 sync failed: ${stderrData}`));
//         }
//       });
//     });
//   });
// };

// const syncS3BucketContents = async (s3Settings) => {
//   custom_logging(chalk.green("Starting S3 Bucket Content Synchronization Process"));

//   const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
//   const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

//   for (const trigger of s3Settings.triggers) {
//     const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
//     const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;
    
//     const sourceS3 = new AWS.S3({ region: sourceRegion });
//     const targetS3 = new AWS.S3({ region: targetRegion });

//     try {
//       const sourceObjectCount = await getObjectsCount(sourceS3, sourceBucket);
//       const targetObjectCount = await getObjectsCount(targetS3, targetBucket);
      
//       custom_logging(chalk.green(`Syncing contents from ${sourceBucket} in ${sourceRegion} to ${targetBucket} in ${targetRegion}`));
//       custom_logging(chalk.blue(`Source bucket has ${sourceObjectCount} objects. Target bucket has ${targetObjectCount} objects before sync.`));
      
//       const syncOptions = {
//         prefix: '', 
//         deleteExtraFiles: false, 
//         maxConcurrency: 20,
//       };

//       const syncResults = await syncS3Buckets(
//         sourceRegion,
//         targetRegion,
//         sourceBucket, 
//         targetBucket, 
//         syncOptions
//       );

//       const targetObjectCountAfter = await getObjectsCount(targetS3, targetBucket);
      
//       custom_logging(chalk.green(`Sync completed for ${sourceBucket} → ${targetBucket}`));
//       custom_logging(chalk.blue(`Target bucket now has ${targetObjectCountAfter} objects (was ${targetObjectCount} before sync)`));
      
//     } catch (error) {
//       custom_logging(chalk.red(`Error syncing buckets ${sourceBucket} to ${targetBucket}: ${error.message}`));
//       throw error;
//     }
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
//       const sourceNotificationConfig = await getBucketNotificationConfiguration(sourceS3, sourceBucket);

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
//         await putBucketNotificationConfiguration(targetS3, targetBucket, updatedNotificationConfig);
//         custom_logging(chalk.green(`Successfully applied event notifications to ${targetBucket} in ${targetRegion}`));
//       } else {
//         custom_logging(chalk.yellow(`[DRY RUN] Would apply event notifications to ${targetBucket} in ${targetRegion}`));
//       }
//     } catch (error) {
//       custom_logging(chalk.red(`Error copying notifications for ${sourceBucket}: ${error.message}`));
//       throw error;
//     }
//   }

//   if (processCurrentEnv) {
//     for (const trigger of s3Settings.triggers) {
//       const currentRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
//       const currentBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
//       const s3Client = new AWS.S3({ region: currentRegion });
      
//       custom_logging(chalk.yellow(`Deleting event notifications from ${currentBucket} in ${currentRegion}`));
      
//       if (!global.DRY_RUN) {
//         await deleteBucketNotificationConfiguration(s3Client, currentBucket);
//         custom_logging(chalk.green(`Successfully deleted event notifications from ${currentBucket} in ${currentRegion}`));
//       } else {
//         custom_logging(chalk.yellow(`[DRY RUN] Would delete event notifications from ${currentBucket} in ${currentRegion}`));
//       }
//     }
//   }
// };

// const mainFunction = async () => {
//   program
//     .version('1.0.0')
//     .option('-dr, --dryRun', "Dry run the process")
//     .option('-pce, --processCurrentEnvironment', "Process current environment")
//     .parse(process.argv);

//   const options = program.opts();
//   global.DRY_RUN = options.dryRun || false;
  
//   if (global.DRY_RUN) {
//     custom_logging(chalk.yellow("Running in DRY RUN mode - no changes will be made"));
//   }
  
//   const configFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 's3', 'configuration.json');
  
//   try {
//     let config = await readAndParseFile(configFile);
//     config['switching_to'] = process.env.SWITCHING_TO;
//     const processCurrentEnv = process.env.PROCESS_CURRENT_ENV === 'true' || options.processCurrentEnvironment;
    
//     custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);
//     custom_logging(`Process Current Environment: ${processCurrentEnv ? chalk.green('Yes') : chalk.red('No')}`);

//     // First verify AWS CLI is installed
//     try {
//       const checkAwsCli = spawn('which', ['aws']);
//       let found = false;
      
//       checkAwsCli.stdout.on('data', (data) => {
//         custom_logging(chalk.green(`AWS CLI found at: ${data.toString().trim()}`));
//         found = true;
//       });
      
//       await new Promise((resolve) => {
//         checkAwsCli.on('close', (code) => {
//           if (code !== 0 || !found) {
//             custom_logging(chalk.red("AWS CLI not found! Please install AWS CLI before running this script."));
//             process.exit(1);
//           }
//           resolve();
//         });
//       });
      
//       // Check AWS CLI version
//       const versionProcess = spawn('aws', ['--version']);
//       versionProcess.stdout.on('data', (data) => {
//         custom_logging(chalk.green(`Using AWS CLI: ${data.toString().trim()}`));
//       });
      
//       await new Promise((resolve) => {
//         versionProcess.on('close', resolve);
//       });
//     } catch (error) {
//       custom_logging(chalk.red(`Error checking AWS CLI: ${error.message}`));
//       process.exit(1);
//     }

//     await syncS3BucketContents(config);
//     await copyS3EventNotifications(config, processCurrentEnv);
//     custom_logging(chalk.green("Process completed successfully"));
//   } catch (error) {
//     custom_logging(chalk.red(`Error in main function: ${error.message}`));
//     process.exit(1);
//   }
// };

// mainFunction().catch(error => {
//   custom_logging(chalk.red("Uncaught Error: ") + error.message);
//   process.exit(1);
// });

const AWS = require('aws-sdk');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { spawn } = require('child_process');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { custom_logging } = require('../../helper/helper.js');
const { 
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration
} = require('../../helper/aws/s3.js');

const readFileAsync = promisify(fs.readFile);
global.DRY_RUN = false;

// Default S3 sync transfer settings
const DEFAULT_MAX_CONCURRENCY = 20;
const DEFAULT_MULTIPART_THRESHOLD = '8MB';
const DEFAULT_MULTIPART_CHUNKSIZE = '16MB';
const DEFAULT_MAX_QUEUE = 10000;

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

const getObjectsCount = async (s3Client, bucketName) => {
  try {
    const result = await s3Client.listObjectsV2({ Bucket: bucketName }).promise();
    return result.KeyCount || 0;
  } catch (error) {
    custom_logging(chalk.red(`Error counting objects in ${bucketName}: ${error.message}`));
    return 0;
  }
};

const syncS3Buckets = async (sourceRegion, targetRegion, sourceBucket, targetBucket, options = {}) => {
  const {
    prefix = '',
    deleteExtraFiles = false,
  } = options;

  return new Promise((resolve, reject) => {
    if (global.DRY_RUN) {
      custom_logging(`[DRY RUN] Would sync from s3://${sourceBucket}/${prefix} to s3://${targetBucket}/${prefix}`);
      return resolve({
        success: true,
        transferred: 0,
        skipped: 0,
        dryRun: true
      });
    }

    // Create a temporary config file for S3 transfer settings
    const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-config-'));
    const tempConfigFile = path.join(tempConfigDir, 'config');
    
    // Write S3 transfer configuration with default values
    const configContent = `
[profile s3transfer]
region = ${targetRegion}
aws_access_key_id = ${process.env.AWS_ACCESS_KEY_ID}
aws_secret_access_key = ${process.env.AWS_SECRET_ACCESS_KEY}
aws_session_token = ${process.env.AWS_SESSION_TOKEN}
s3 =
  max_concurrent_requests = ${DEFAULT_MAX_CONCURRENCY}
  multipart_threshold = ${DEFAULT_MULTIPART_THRESHOLD}
  multipart_chunksize = ${DEFAULT_MULTIPART_CHUNKSIZE}
  max_queue_size = ${DEFAULT_MAX_QUEUE}
`;
    
    fs.writeFileSync(tempConfigFile, configContent);
    custom_logging(`Created temporary AWS config at: ${tempConfigFile}`);

    // Continue with AWS CLI check
    const checkAwsCli = spawn('which', ['aws']);
    
    checkAwsCli.on('close', (code) => {
      if (code !== 0) {
        fs.rmdirSync(tempConfigDir, { recursive: true });
        return reject(new Error('AWS CLI is not installed or not in PATH. Please install AWS CLI first.'));
      }
      
      const args = [
        's3', 'sync',
        `s3://${sourceBucket}/${prefix}`,
        `s3://${targetBucket}/${prefix}`,
        '--region', targetRegion,
        '--source-region', sourceRegion,
        '--sse', // Enable server-side encryption
        '--only-show-errors',
        '--cli-connect-timeout', '30',
        '--profile', 's3transfer' // Use the temporary profile
      ];

      if (deleteExtraFiles) {
        args.push('--delete');
      }

      custom_logging(`Starting S3 sync: aws ${args.join(' ')}`);

      // Set environment to point to our temporary config
      const env = {
        ...process.env,
        AWS_CONFIG_FILE: tempConfigFile,
        AWS_REGION: targetRegion,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN
      };

      const awsProcess = spawn('aws', args, { env });
      
      let stdoutData = '';
      let stderrData = '';

      awsProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        custom_logging(`[S3 SYNC] ${data.toString().trim()}`);
      });

      awsProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        custom_logging(`[S3 SYNC ERROR] ${data.toString().trim()}`);
      });

      awsProcess.on('close', (code) => {
        // Clean up the temporary config directory
        try {
          fs.rmSync(tempConfigDir, { recursive: true });
        } catch (err) {
          custom_logging(`Error cleaning up temp config: ${err.message}`);
        }
        
        if (code === 0) {
          custom_logging(`S3 sync completed successfully from ${sourceBucket} to ${targetBucket}`);
          resolve({
            success: true,
            output: stdoutData
          });
        } else {
          custom_logging(`S3 sync failed with code ${code} from ${sourceBucket} to ${targetBucket}`);
          reject(new Error(`S3 sync failed: ${stderrData}`));
        }
      });
    });
  });
};

const syncS3BucketContents = async (s3Settings) => {
  custom_logging(chalk.green("Starting S3 Bucket Content Synchronization Process"));

  const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
  const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

  for (const trigger of s3Settings.triggers) {
    const sourceBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
    const targetBucket = s3Settings.switching_to === "ACTIVE" ? trigger.active_bucket : trigger.failover_bucket;
    
    const sourceS3 = new AWS.S3({ region: sourceRegion });
    const targetS3 = new AWS.S3({ region: targetRegion });

    try {
      const sourceObjectCount = await getObjectsCount(sourceS3, sourceBucket);
      const targetObjectCount = await getObjectsCount(targetS3, targetBucket);
      
      custom_logging(chalk.green(`Syncing contents from ${sourceBucket} in ${sourceRegion} to ${targetBucket} in ${targetRegion}`));
      custom_logging(chalk.blue(`Source bucket has ${sourceObjectCount} objects. Target bucket has ${targetObjectCount} objects before sync.`));
      
      // Using default options set at the top of the file
      const syncOptions = {
        prefix: '', 
        deleteExtraFiles: false
      };

      const syncResults = await syncS3Buckets(
        sourceRegion,
        targetRegion,
        sourceBucket, 
        targetBucket, 
        syncOptions
      );

      const targetObjectCountAfter = await getObjectsCount(targetS3, targetBucket);
      
      custom_logging(chalk.green(`Sync completed for ${sourceBucket} → ${targetBucket}`));
      custom_logging(chalk.blue(`Target bucket now has ${targetObjectCountAfter} objects (was ${targetObjectCount} before sync)`));
      
    } catch (error) {
      custom_logging(chalk.red(`Error syncing buckets ${sourceBucket} to ${targetBucket}: ${error.message}`));
      throw error;
    }
  }
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

      if (!global.DRY_RUN) {
        await putBucketNotificationConfiguration(targetS3, targetBucket, updatedNotificationConfig);
        custom_logging(chalk.green(`Successfully applied event notifications to ${targetBucket} in ${targetRegion}`));
      } else {
        custom_logging(chalk.yellow(`[DRY RUN] Would apply event notifications to ${targetBucket} in ${targetRegion}`));
      }
    } catch (error) {
      custom_logging(chalk.red(`Error copying notifications for ${sourceBucket}: ${error.message}`));
      throw error;
    }
  }

  if (processCurrentEnv) {
    for (const trigger of s3Settings.triggers) {
      const currentRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
      const currentBucket = s3Settings.switching_to === "ACTIVE" ? trigger.failover_bucket : trigger.active_bucket;
      const s3Client = new AWS.S3({ region: currentRegion });
      
      custom_logging(chalk.yellow(`Deleting event notifications from ${currentBucket} in ${currentRegion}`));
      
      if (!global.DRY_RUN) {
        await deleteBucketNotificationConfiguration(s3Client, currentBucket);
        custom_logging(chalk.green(`Successfully deleted event notifications from ${currentBucket} in ${currentRegion}`));
      } else {
        custom_logging(chalk.yellow(`[DRY RUN] Would delete event notifications from ${currentBucket} in ${currentRegion}`));
      }
    }
  }
};

const mainFunction = async () => {
  program
    .version('1.0.0')
    .option('-dr, --dryRun', "Dry run the process")
    .option('-pce, --processCurrentEnvironment', "Process current environment")
    .parse(process.argv);

  const options = program.opts();
  global.DRY_RUN = options.dryRun || false;
  
  if (global.DRY_RUN) {
    custom_logging(chalk.yellow("Running in DRY RUN mode - no changes will be made"));
  }
  
  // Log the default S3 transfer settings being used
  custom_logging(chalk.blue(`Using S3 transfer settings:`));
  custom_logging(chalk.blue(`- Max Concurrency: ${DEFAULT_MAX_CONCURRENCY}`));
  custom_logging(chalk.blue(`- Multipart Threshold: ${DEFAULT_MULTIPART_THRESHOLD}`));
  custom_logging(chalk.blue(`- Chunk Size: ${DEFAULT_MULTIPART_CHUNKSIZE}`));
  custom_logging(chalk.blue(`- Max Queue Size: ${DEFAULT_MAX_QUEUE}`));
  
  const configFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 's3', 'configuration.json');
  
  try {
    let config = await readAndParseFile(configFile);
    config['switching_to'] = process.env.SWITCHING_TO;
    const processCurrentEnv = process.env.PROCESS_CURRENT_ENV === 'true' || options.processCurrentEnvironment;
    
    custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);
    custom_logging(`Process Current Environment: ${processCurrentEnv ? chalk.green('Yes') : chalk.red('No')}`);

    // First verify AWS CLI is installed
    try {
      const checkAwsCli = spawn('which', ['aws']);
      let found = false;
      
      checkAwsCli.stdout.on('data', (data) => {
        custom_logging(chalk.green(`AWS CLI found at: ${data.toString().trim()}`));
        found = true;
      });
      
      await new Promise((resolve) => {
        checkAwsCli.on('close', (code) => {
          if (code !== 0 || !found) {
            custom_logging(chalk.red("AWS CLI not found! Please install AWS CLI before running this script."));
            process.exit(1);
          }
          resolve();
        });
      });
      
      // Check AWS CLI version
      const versionProcess = spawn('aws', ['--version']);
      versionProcess.stdout.on('data', (data) => {
        custom_logging(chalk.green(`Using AWS CLI: ${data.toString().trim()}`));
      });
      
      await new Promise((resolve) => {
        versionProcess.on('close', resolve);
      });
    } catch (error) {
      custom_logging(chalk.red(`Error checking AWS CLI: ${error.message}`));
      process.exit(1);
    }

    await syncS3BucketContents(config);
    await copyS3EventNotifications(config, processCurrentEnv);
    custom_logging(chalk.green("Process completed successfully"));
  } catch (error) {
    custom_logging(chalk.red(`Error in main function: ${error.message}`));
    process.exit(1);
  }
};

mainFunction().catch(error => {
  custom_logging(chalk.red("Uncaught Error: ") + error.message);
  process.exit(1);
});