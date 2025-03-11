// const { custom_logging } = require('../../helper/helper.js');
// const fs = require('fs');
// const { program } = require('commander');
// const { promisify } = require('util');
// const chalk = require('chalk');
// const path = require('path');
// const readFileAsync = promisify(fs.readFile);

// const AWS = require('aws-sdk');

// AWS.config.update({
//   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//   sessionToken: process.env.AWS_SESSION_TOKEN,
//   maxRetries: 5,
//   retryDelayOptions: { 
//     base: 200
//   }
// });

// const readAndParseFile = async (file) => {
//   const data = await readFileAsync(file, { encoding: 'utf-8' });
//   const dataToJson = JSON.parse(data);
//   return dataToJson;
// };

// const getS3BucketNotificationConfiguration = async (s3Client, bucketName) => {
//   try {
//     const params = {
//       Bucket: bucketName
//     };
    
//     const notificationConfig = await s3Client.getBucketNotificationConfiguration(params).promise();
//     custom_logging(chalk.cyan(`Retrieved notification configuration for bucket: ${bucketName}`));
//     return notificationConfig;
//   } catch (error) {
//     custom_logging(chalk.red(`Error getting notification configuration for bucket ${bucketName}: ${error.message}`));
//     throw error;
//   }
// };

// const putS3BucketNotificationConfiguration = async (s3Client, bucketName, notificationConfig) => {
//   try {
//     const params = {
//       Bucket: bucketName,
//       NotificationConfiguration: notificationConfig
//     };
    
//     if (global.DRY_RUN) {
//       custom_logging(chalk.yellow(`DRY RUN: Would put notification configuration for bucket: ${bucketName}`));
//       custom_logging(chalk.yellow(`Configuration: ${JSON.stringify(notificationConfig, null, 2)}`));
//       return;
//     }
    
//     await s3Client.putBucketNotificationConfiguration(params).promise();
//     custom_logging(chalk.green(`Successfully updated notification configuration for bucket: ${bucketName}`));
//   } catch (error) {
//     custom_logging(chalk.red(`Error updating notification configuration for bucket ${bucketName}: ${error.message}`));
//     throw error;
//   }
// };

// const getLambdaArnByName = async (lambdaClient, lambdaName) => {
//   try {
//     const params = {
//       FunctionName: lambdaName
//     };
    
//     const lambdaInfo = await lambdaClient.getFunction(params).promise();
//     return lambdaInfo.Configuration.FunctionArn;
//   } catch (error) {
//     custom_logging(chalk.red(`Error getting Lambda ARN for ${lambdaName}: ${error.message}`));
//     throw error;
//   }
// };

// const getSnsArnByName = async (snsClient, snsName) => {
//   try {
//     const snsTopics = await snsClient.listTopics({}).promise();
//     const foundTopic = snsTopics.Topics.find(topic => {
//       const topicNameFromArn = topic.TopicArn.split(':').pop();
//       return topicNameFromArn === snsName;
//     });
    
//     if (!foundTopic) {
//       throw new Error(`SNS topic with name ${snsName} not found`);
//     }
    
//     return foundTopic.TopicArn;
//   } catch (error) {
//     custom_logging(chalk.red(`Error getting SNS ARN for ${snsName}: ${error.message}`));
//     throw error;
//   }
// };

// const getSqsArnByName = async (sqsClient, sqsName) => {
//   try {
//     const queueUrl = await sqsClient.getQueueUrl({ QueueName: sqsName }).promise();
//     const queueAttributes = await sqsClient.getQueueAttributes({
//       QueueUrl: queueUrl.QueueUrl,
//       AttributeNames: ['QueueArn']
//     }).promise();
    
//     return queueAttributes.Attributes.QueueArn;
//   } catch (error) {
//     custom_logging(chalk.red(`Error getting SQS ARN for ${sqsName}: ${error.message}`));
//     throw error;
//   }
// };

// const processS3NotificationConfigurations = async (config) => {
//   custom_logging(chalk.green("Starting process for S3 notification configurations"));
  
//   const activeRegion = config.active_region;
//   const failoverRegion = config.failover_region;
  
//   // Get the chosen region from environment variable
//   const chosenRegion = process.env.SWITCHING_TO;
  
//   if (!chosenRegion || (chosenRegion !== "ACTIVE" && chosenRegion !== "FAILOVER")) {
//     throw new Error('SWITCHING_TO environment variable must be either "ACTIVE" or "FAILOVER"');
//   }
  
//   // Initialize AWS clients
//   const activeS3 = new AWS.S3({ region: activeRegion });
//   const failoverS3 = new AWS.S3({ region: failoverRegion });
//   const activeLambda = new AWS.Lambda({ region: activeRegion });
//   const failoverLambda = new AWS.Lambda({ region: failoverRegion });
//   const activeSns = new AWS.SNS({ region: activeRegion });
//   const failoverSns = new AWS.SNS({ region: failoverRegion });
//   const activeSqs = new AWS.SQS({ region: activeRegion });
//   const failoverSqs = new AWS.SQS({ region: failoverRegion });
  
//   // Determine source and target based on chosen region
//   const sourceRegion = chosenRegion === "ACTIVE" ? activeRegion : failoverRegion;
//   const targetRegion = chosenRegion === "ACTIVE" ? failoverRegion : activeRegion;
  
//   custom_logging(chalk.cyan(`Source region: ${sourceRegion}, Target region: ${targetRegion}`));
  
//   for (const s3Config of config.s3_trigger_configuration) {
//     const activeBucketName = s3Config.active_bucket_name;
//     const failoverBucketName = s3Config.failover_bucket_name;
    
//     // Determine source and target buckets based on chosen region
//     const sourceBucketName = chosenRegion === "ACTIVE" ? activeBucketName : failoverBucketName;
//     const targetBucketName = chosenRegion === "ACTIVE" ? failoverBucketName : activeBucketName;
//     const sourceS3 = chosenRegion === "ACTIVE" ? activeS3 : failoverS3;
//     const targetS3 = chosenRegion === "ACTIVE" ? failoverS3 : activeS3;
    
//     custom_logging(chalk.cyan(`Processing bucket pair: ${sourceBucketName} -> ${targetBucketName}`));
    
//     // Create resource name mappings
//     const resourceNameMappings = {
//       lambda: {},
//       sns: {},
//       sqs: {}
//     };
    
//     // Process Lambda mappings
//     if (s3Config.event_notifications.lambda_triggers && s3Config.event_notifications.lambda_triggers.length > 0) {
//       custom_logging(chalk.cyan("Building Lambda name mappings"));
      
//       for (const lambdaTrigger of s3Config.event_notifications.lambda_triggers) {
//         const activeLambdaName = lambdaTrigger.active_lambda;
//         const failoverLambdaName = lambdaTrigger.failover_lambda;
        
//         // Map appropriately based on chosen region
//         if (chosenRegion === "ACTIVE") {
//           resourceNameMappings.lambda[activeLambdaName] = failoverLambdaName;
//         } else {
//           resourceNameMappings.lambda[failoverLambdaName] = activeLambdaName;
//         }
//       }
//     }
    
//     // Process SNS mappings
//     if (s3Config.event_notifications.sns_triggers && s3Config.event_notifications.sns_triggers.length > 0) {
//       custom_logging(chalk.cyan("Building SNS name mappings"));
      
//       for (const snsTrigger of s3Config.event_notifications.sns_triggers) {
//         const activeSnsName = snsTrigger.active_sns;
//         const failoverSnsName = snsTrigger.failover_sns;
        
//         // Map appropriately based on chosen region
//         if (chosenRegion === "ACTIVE") {
//           resourceNameMappings.sns[activeSnsName] = failoverSnsName;
//         } else {
//           resourceNameMappings.sns[failoverSnsName] = activeSnsName;
//         }
//       }
//     }
    
//     // Process SQS mappings
//     if (s3Config.event_notifications.sqs_triggers && s3Config.event_notifications.sqs_triggers.length > 0) {
//       custom_logging(chalk.cyan("Building SQS name mappings"));
      
//       for (const sqsTrigger of s3Config.event_notifications.sqs_triggers) {
//         const activeSqsName = sqsTrigger.active_sqs;
//         const failoverSqsName = sqsTrigger.failover_sqs;
        
//         // Map appropriately based on chosen region
//         if (chosenRegion === "ACTIVE") {
//           resourceNameMappings.sqs[activeSqsName] = failoverSqsName;
//         } else {
//           resourceNameMappings.sqs[failoverSqsName] = activeSqsName;
//         }
//       }
//     }
    
//     // Get current notification configuration from source bucket
//     const sourceNotificationConfig = await getS3BucketNotificationConfiguration(sourceS3, sourceBucketName);
    
//     // Create a new notification configuration for target bucket
//     const targetNotificationConfig = {
//       LambdaFunctionConfigurations: [],
//       TopicConfigurations: [],
//       QueueConfigurations: []
//     };
    
//     // Copy and transform Lambda configurations
//     if (sourceNotificationConfig.LambdaFunctionConfigurations) {
//       for (const lambdaConfig of sourceNotificationConfig.LambdaFunctionConfigurations) {
//         // Extract the Lambda function name from the ARN
//         const arnParts = lambdaConfig.LambdaFunctionArn.split(':');
//         const sourceLambdaName = arnParts[arnParts.length - 1];
        
//         // Check if we have a mapping for this Lambda function
//         const targetLambdaName = resourceNameMappings.lambda[sourceLambdaName];
        
//         if (targetLambdaName) {
//           // Create a new configuration with the target Lambda function
//           const targetLambdaArn = await getLambdaArnByName(
//             chosenRegion === "ACTIVE" ? failoverLambda : activeLambda, 
//             targetLambdaName
//           );
          
//           const newLambdaConfig = JSON.parse(JSON.stringify(lambdaConfig));
//           newLambdaConfig.LambdaFunctionArn = targetLambdaArn;
          
//           targetNotificationConfig.LambdaFunctionConfigurations.push(newLambdaConfig);
          
//           custom_logging(chalk.cyan(`Added Lambda configuration for ${targetLambdaName}`));
//         } else {
//           custom_logging(chalk.yellow(`No mapping found for Lambda function ${sourceLambdaName}, skipping`));
//         }
//       }
//     }
    
//     // Copy and transform SNS configurations
//     if (sourceNotificationConfig.TopicConfigurations) {
//       for (const topicConfig of sourceNotificationConfig.TopicConfigurations) {
//         // Extract the SNS topic name from the ARN
//         const arnParts = topicConfig.TopicArn.split(':');
//         const sourceTopicName = arnParts[arnParts.length - 1];
        
//         // Check if we have a mapping for this SNS topic
//         const targetTopicName = resourceNameMappings.sns[sourceTopicName];
        
//         if (targetTopicName) {
//           // Create a new configuration with the target SNS topic
//           const targetTopicArn = await getSnsArnByName(
//             chosenRegion === "ACTIVE" ? failoverSns : activeSns, 
//             targetTopicName
//           );
          
//           const newTopicConfig = JSON.parse(JSON.stringify(topicConfig));
//           newTopicConfig.TopicArn = targetTopicArn;
          
//           targetNotificationConfig.TopicConfigurations.push(newTopicConfig);
          
//           custom_logging(chalk.cyan(`Added SNS configuration for ${targetTopicName}`));
//         } else {
//           custom_logging(chalk.yellow(`No mapping found for SNS topic ${sourceTopicName}, skipping`));
//         }
//       }
//     }
    
//     // Copy and transform SQS configurations
//     if (sourceNotificationConfig.QueueConfigurations) {
//       for (const queueConfig of sourceNotificationConfig.QueueConfigurations) {
//         // Extract the SQS queue name from the ARN
//         const arnParts = queueConfig.QueueArn.split(':');
//         const sourceQueueName = arnParts[arnParts.length - 1];
        
//         // Check if we have a mapping for this SQS queue
//         const targetQueueName = resourceNameMappings.sqs[sourceQueueName];
        
//         if (targetQueueName) {
//           // Create a new configuration with the target SQS queue
//           const targetQueueArn = await getSqsArnByName(
//             chosenRegion === "ACTIVE" ? failoverSqs : activeSqs, 
//             targetQueueName
//           );
          
//           const newQueueConfig = JSON.parse(JSON.stringify(queueConfig));
//           newQueueConfig.QueueArn = targetQueueArn;
          
//           targetNotificationConfig.QueueConfigurations.push(newQueueConfig);
          
//           custom_logging(chalk.cyan(`Added SQS configuration for ${targetQueueName}`));
//         } else {
//           custom_logging(chalk.yellow(`No mapping found for SQS queue ${sourceQueueName}, skipping`));
//         }
//       }
//     }
    
//     // Apply the new notification configuration to the target bucket
//     await putS3BucketNotificationConfiguration(targetS3, targetBucketName, targetNotificationConfig);
//   }
  
//   custom_logging(chalk.green("S3 notification configuration copy process completed"));
// };

// const mainFunction = async () => {
//   program
//     .version('0.0.1')
//     .option('-dr --dryRun', "Dry run the process")
//     .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
//     .parse(process.argv);

//   const options = program.opts();
  
//   // Updated path to match the structure in your Jenkins pipeline
//   const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
//   let config = await readAndParseFile(file);

//   // Check for DRY_RUN from environment variable (for Jenkins)
//   if (options.dryRun || process.env.DRY_RUN === 'true') {
//     global.DRY_RUN = true;
//     custom_logging(chalk.yellow("DRY RUN is enabled"));
//   } else {
//     custom_logging(chalk.red("DRY RUN is disabled"));
//   }

//   // Check for PROCESS_CURRENT_ENV from environment variable (for Jenkins)
//   if (options.processCurrentEnvironment || process.env.PROCESS_CURRENT_ENV === 'true') {
//     global.PROCESS_CURRENT_ENVIRONMENT = true;
//     custom_logging(chalk.red("Current environment will be processed"));
//   } else {
//     custom_logging(chalk.yellow("Current environment will not be processed"));
//   }

//   custom_logging(`Chosen region: ${chalk.green(process.env.SWITCHING_TO)}`);

//   await processS3NotificationConfigurations(config);
//   custom_logging(chalk.green("Process has been completed"));
// };

// mainFunction()
//   .then(() => {
//     custom_logging(chalk.green("Exiting ..."));
//   })
//   .catch((error) => {
//     custom_logging(chalk.red("Error: ") + error.message);
//   });

// 

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
    const { active_bucket_name, failover_bucket_name, event_notifications } = trigger;
    try {
      const activeConfig = await s3.getBucketNotificationConfiguration({ Bucket: active_bucket_name }).promise();
      const newConfig = { LambdaFunctionConfigurations: [], QueueConfigurations: [], TopicConfigurations: [] };
      
      // Process Lambda triggers
      if (event_notifications.lambda_triggers) {
        event_notifications.lambda_triggers.forEach(lambda => {
          const lambdaConfigs = activeConfig.LambdaFunctionConfigurations.filter(config => config.LambdaFunctionArn.includes(lambda.active_lambda));
          lambdaConfigs.forEach(lambdaConfig => {
            newConfig.LambdaFunctionConfigurations.push({
              ...lambdaConfig,
              LambdaFunctionArn: lambdaConfig.LambdaFunctionArn.replace(lambda.active_lambda, lambda.failover_lambda)
            });
          });
        });
      }
      
      // Process SNS triggers
      if (event_notifications.sns_triggers) {
        event_notifications.sns_triggers.forEach(sns => {
          const snsConfigs = activeConfig.TopicConfigurations.filter(config => config.TopicArn.includes(sns.active_sns));
          snsConfigs.forEach(snsConfig => {
            newConfig.TopicConfigurations.push({
              ...snsConfig,
              TopicArn: snsConfig.TopicArn.replace(sns.active_sns, sns.failover_sns)
            });
          });
        });
      }
      
      // Process SQS triggers
      if (event_notifications.sqs_triggers) {
        event_notifications.sqs_triggers.forEach(sqs => {
          const sqsConfigs = activeConfig.QueueConfigurations.filter(config => config.QueueArn.includes(sqs.active_sqs));
          sqsConfigs.forEach(sqsConfig => {
            newConfig.QueueConfigurations.push({
              ...sqsConfig,
              QueueArn: sqsConfig.QueueArn.replace(sqs.active_sqs, sqs.failover_sqs)
            });
          });
        });
      }
      
      await s3.putBucketNotificationConfiguration({
        Bucket: failover_bucket_name,
        NotificationConfiguration: newConfig
      }).promise();
      
      custom_logging(chalk.green(`Copied event notifications from ${active_bucket_name} to ${failover_bucket_name}`));
    } catch (error) {
      custom_logging(chalk.red(`Error copying event notifications for ${active_bucket_name}: ${error.message}`));
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

  custom_logging(`Switching to ${chalk.green(envs.failover_region)} environment`);
  await copyEventNotifications(envs.s3_trigger_configuration);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
