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
  retryDelayOptions: { 
    base: 200
  }
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  const dataToJson = JSON.parse(data);
  return dataToJson;
};

const getS3BucketNotificationConfiguration = async (s3Client, bucketName) => {
  try {
    const params = {
      Bucket: bucketName
    };
    
    const notificationConfig = await s3Client.getBucketNotificationConfiguration(params).promise();
    custom_logging(chalk.cyan(`Retrieved notification configuration for bucket: ${bucketName}`));
    return notificationConfig;
  } catch (error) {
    custom_logging(chalk.red(`Error getting notification configuration for bucket ${bucketName}: ${error.message}`));
    throw error;
  }
};

const putS3BucketNotificationConfiguration = async (s3Client, bucketName, notificationConfig) => {
  try {
    const params = {
      Bucket: bucketName,
      NotificationConfiguration: notificationConfig
    };
    
    if (global.DRY_RUN) {
      custom_logging(chalk.yellow(`DRY RUN: Would put notification configuration for bucket: ${bucketName}`));
      custom_logging(chalk.yellow(`Configuration: ${JSON.stringify(notificationConfig, null, 2)}`));
      return;
    }
    
    await s3Client.putBucketNotificationConfiguration(params).promise();
    custom_logging(chalk.green(`Successfully updated notification configuration for bucket: ${bucketName}`));
  } catch (error) {
    custom_logging(chalk.red(`Error updating notification configuration for bucket ${bucketName}: ${error.message}`));
    throw error;
  }
};

const getLambdaArnByName = async (lambdaClient, lambdaName) => {
  try {
    const params = {
      FunctionName: lambdaName
    };
    
    const lambdaInfo = await lambdaClient.getFunction(params).promise();
    return lambdaInfo.Configuration.FunctionArn;
  } catch (error) {
    custom_logging(chalk.red(`Error getting Lambda ARN for ${lambdaName}: ${error.message}`));
    throw error;
  }
};

const getSnsArnByName = async (snsClient, snsName) => {
  try {
    const snsTopics = await snsClient.listTopics({}).promise();
    const foundTopic = snsTopics.Topics.find(topic => {
      const topicNameFromArn = topic.TopicArn.split(':').pop();
      return topicNameFromArn === snsName;
    });
    
    if (!foundTopic) {
      throw new Error(`SNS topic with name ${snsName} not found`);
    }
    
    return foundTopic.TopicArn;
  } catch (error) {
    custom_logging(chalk.red(`Error getting SNS ARN for ${snsName}: ${error.message}`));
    throw error;
  }
};

const getSqsArnByName = async (sqsClient, sqsName) => {
  try {
    const queueUrl = await sqsClient.getQueueUrl({ QueueName: sqsName }).promise();
    const queueAttributes = await sqsClient.getQueueAttributes({
      QueueUrl: queueUrl.QueueUrl,
      AttributeNames: ['QueueArn']
    }).promise();
    
    return queueAttributes.Attributes.QueueArn;
  } catch (error) {
    custom_logging(chalk.red(`Error getting SQS ARN for ${sqsName}: ${error.message}`));
    throw error;
  }
};

const replaceResourceArns = async (notificationConfig, resourceMappings) => {
  const newConfig = JSON.parse(JSON.stringify(notificationConfig)); // Deep copy
  
  // Replace Lambda ARNs
  if (newConfig.LambdaFunctionConfigurations && newConfig.LambdaFunctionConfigurations.length > 0) {
    for (let config of newConfig.LambdaFunctionConfigurations) {
      for (const [sourceArn, targetArn] of Object.entries(resourceMappings.lambdaArns)) {
        if (config.LambdaFunctionArn === sourceArn) {
          config.LambdaFunctionArn = targetArn;
          custom_logging(chalk.cyan(`Replaced Lambda ARN: ${sourceArn} -> ${targetArn}`));
        }
      }
    }
  }
  
  // Replace SNS ARNs
  if (newConfig.TopicConfigurations && newConfig.TopicConfigurations.length > 0) {
    for (let config of newConfig.TopicConfigurations) {
      for (const [sourceArn, targetArn] of Object.entries(resourceMappings.snsArns)) {
        if (config.TopicArn === sourceArn) {
          config.TopicArn = targetArn;
          custom_logging(chalk.cyan(`Replaced SNS Topic ARN: ${sourceArn} -> ${targetArn}`));
        }
      }
    }
  }
  
  // Replace SQS ARNs
  if (newConfig.QueueConfigurations && newConfig.QueueConfigurations.length > 0) {
    for (let config of newConfig.QueueConfigurations) {
      for (const [sourceArn, targetArn] of Object.entries(resourceMappings.sqsArns)) {
        if (config.QueueArn === sourceArn) {
          config.QueueArn = targetArn;
          custom_logging(chalk.cyan(`Replaced SQS Queue ARN: ${sourceArn} -> ${targetArn}`));
        }
      }
    }
  }
  
  return newConfig;
};

const processS3NotificationConfigurations = async (config) => {
  custom_logging(chalk.green("Starting process for S3 notification configurations"));
  
  const activeRegion = config.active_region;
  const failoverRegion = config.failover_region;
  
  // Get the chosen region from environment variable - use SWITCHING_TO instead of CHOSEN_REGION
  const chosenRegion = process.env.SWITCHING_TO;
  
  if (!chosenRegion || (chosenRegion !== "ACTIVE" && chosenRegion !== "FAILOVER")) {
    throw new Error('SWITCHING_TO environment variable must be either "ACTIVE" or "FAILOVER"');
  }
  
  // Initialize AWS clients
  const activeS3 = new AWS.S3({ region: activeRegion });
  const failoverS3 = new AWS.S3({ region: failoverRegion });
  const activeLambda = new AWS.Lambda({ region: activeRegion });
  const failoverLambda = new AWS.Lambda({ region: failoverRegion });
  const activeSns = new AWS.SNS({ region: activeRegion });
  const failoverSns = new AWS.SNS({ region: failoverRegion });
  const activeSqs = new AWS.SQS({ region: activeRegion });
  const failoverSqs = new AWS.SQS({ region: failoverRegion });
  
  // Determine source and target based on chosen region
  const sourceRegion = chosenRegion === "ACTIVE" ? activeRegion : failoverRegion;
  const targetRegion = chosenRegion === "ACTIVE" ? failoverRegion : activeRegion;
  
  custom_logging(chalk.cyan(`Source region: ${sourceRegion}, Target region: ${targetRegion}`));
  
  for (const s3Config of config.s3_trigger_configuration) {
    const activeBucketName = s3Config.active_bucket_name;
    const failoverBucketName = s3Config.failover_bucket_name;
    
    // Determine source and target buckets based on chosen region
    const sourceBucketName = chosenRegion === "ACTIVE" ? activeBucketName : failoverBucketName;
    const targetBucketName = chosenRegion === "ACTIVE" ? failoverBucketName : activeBucketName;
    const sourceS3 = chosenRegion === "ACTIVE" ? activeS3 : failoverS3;
    const targetS3 = chosenRegion === "ACTIVE" ? failoverS3 : activeS3;
    
    custom_logging(chalk.cyan(`Processing bucket pair: ${sourceBucketName} -> ${targetBucketName}`));
    
    // Build resource ARN mappings
    const resourceMappings = {
      lambdaArns: {},
      snsArns: {},
      sqsArns: {}
    };
    
    // Process Lambda trigger mappings
    if (s3Config.event_notifications.lambda_triggers && s3Config.event_notifications.lambda_triggers.length > 0) {
      custom_logging(chalk.cyan("Building Lambda ARN mappings"));
      
      for (const lambdaTrigger of s3Config.event_notifications.lambda_triggers) {
        const activeLambdaName = lambdaTrigger.active_lambda;
        const failoverLambdaName = lambdaTrigger.failover_lambda;
        
        // Get ARNs for the Lambda functions
        const activeLambdaArn = await getLambdaArnByName(activeLambda, activeLambdaName);
        const failoverLambdaArn = await getLambdaArnByName(failoverLambda, failoverLambdaName);
        
        // Map appropriately based on chosen region
        if (chosenRegion === "ACTIVE") {
          resourceMappings.lambdaArns[activeLambdaArn] = failoverLambdaArn;
        } else {
          resourceMappings.lambdaArns[failoverLambdaArn] = activeLambdaArn;
        }
      }
    }
    
    // Process SNS trigger mappings
    if (s3Config.event_notifications.sns_triggers && s3Config.event_notifications.sns_triggers.length > 0) {
      custom_logging(chalk.cyan("Building SNS ARN mappings"));
      
      for (const snsTrigger of s3Config.event_notifications.sns_triggers) {
        const activeSnsName = snsTrigger.active_sns;
        const failoverSnsName = snsTrigger.failover_sns;
        
        // Get ARNs for the SNS topics
        const activeSnsArn = await getSnsArnByName(activeSns, activeSnsName);
        const failoverSnsArn = await getSnsArnByName(failoverSns, failoverSnsName);
        
        // Map appropriately based on chosen region
        if (chosenRegion === "ACTIVE") {
          resourceMappings.snsArns[activeSnsArn] = failoverSnsArn;
        } else {
          resourceMappings.snsArns[failoverSnsArn] = activeSnsArn;
        }
      }
    }
    
    // Process SQS trigger mappings
    if (s3Config.event_notifications.sqs_triggers && s3Config.event_notifications.sqs_triggers.length > 0) {
      custom_logging(chalk.cyan("Building SQS ARN mappings"));
      
      for (const sqsTrigger of s3Config.event_notifications.sqs_triggers) {
        const activeSqsName = sqsTrigger.active_sqs;
        const failoverSqsName = sqsTrigger.failover_sqs;
        
        // Get ARNs for the SQS queues
        const activeSqsArn = await getSqsArnByName(activeSqs, activeSqsName);
        const failoverSqsArn = await getSqsArnByName(failoverSqs, failoverSqsName);
        
        // Map appropriately based on chosen region
        if (chosenRegion === "ACTIVE") {
          resourceMappings.sqsArns[activeSqsArn] = failoverSqsArn;
        } else {
          resourceMappings.sqsArns[failoverSqsArn] = activeSqsArn;
        }
      }
    }
    
    // Get current notification configuration from source bucket
    const sourceNotificationConfig = await getS3BucketNotificationConfiguration(sourceS3, sourceBucketName);
    
    // Replace ARNs in the notification configuration
    const updatedNotificationConfig = await replaceResourceArns(sourceNotificationConfig, resourceMappings);
    
    // Apply the updated notification configuration to the target bucket
    await putS3BucketNotificationConfiguration(targetS3, targetBucketName, updatedNotificationConfig);
  }
  
  custom_logging(chalk.green("S3 notification configuration copy process completed"));
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .parse(process.argv);

  const options = program.opts();
  
  // Updated path to match the structure in your Jenkins pipeline
  const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 's3', 'configuration.json');
  let config = await readAndParseFile(file);

  // Check for DRY_RUN from environment variable (for Jenkins)
  if (options.dryRun || process.env.DRY_RUN === 'true') {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow("DRY RUN is enabled"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled"));
  }

  // Check for PROCESS_CURRENT_ENV from environment variable (for Jenkins)
  if (options.processCurrentEnvironment || process.env.PROCESS_CURRENT_ENV === 'true') {
    global.PROCESS_CURRENT_ENVIRONMENT = true;
    custom_logging(chalk.red("Current environment will be processed"));
  } else {
    custom_logging(chalk.yellow("Current environment will not be processed"));
  }

  custom_logging(`Chosen region: ${chalk.green(process.env.SWITCHING_TO)}`);

  await processS3NotificationConfigurations(config);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });