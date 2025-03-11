const { program } = require('commander');
const fs = require('fs');
const { promisify } = require('util');
const chalk = require('chalk');
const path = require('path');
const readFileAsync = promisify(fs.readFile);
const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 }
});

// Helper function to read and parse JSON configuration file
const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

// Custom logging function
const custom_logging = (message) => {
  console.log(message);
};

// Function to replicate S3 event notifications between buckets
const replicateS3EventNotifications = async (config, direction) => {
  custom_logging(chalk.green(`Starting S3 event notifications replication (${direction})`));

  const activeRegion = config.active_region;
  const failoverRegion = config.failover_region;
  
  // Extract bucket information from the config
  const activeBucket = config.triggers[0].active_bucket;
  const failoverBucket = config.triggers[0].failover_bucket;

  // Determine source and destination based on direction
  let sourceRegion, sourceBucket, destinationRegion, destinationBucket;
  
  if (direction === 'active-to-failover') {
    sourceRegion = activeRegion;
    sourceBucket = activeBucket;
    destinationRegion = failoverRegion;
    destinationBucket = failoverBucket;
  } else { // failover-to-active
    sourceRegion = failoverRegion;
    sourceBucket = failoverBucket;
    destinationRegion = activeRegion;
    destinationBucket = activeBucket;
  }

  // Create S3 clients for source and destination regions
  const sourceS3 = new AWS.S3({ region: sourceRegion });
  const destinationS3 = new AWS.S3({ region: destinationRegion });

  try {
    custom_logging(chalk.blue(`Fetching event notifications from ${sourceBucket} in ${sourceRegion}`));
    
    // Fetch notification configuration from the source bucket
    const sourceConfig = await sourceS3.getBucketNotificationConfiguration({ 
      Bucket: sourceBucket 
    }).promise();

    // Prepare the new notification configuration for the destination bucket
    const updatedConfig = { 
      LambdaFunctionConfigurations: [], 
      QueueConfigurations: [], 
      TopicConfigurations: [] 
    };

    // Handle Lambda function configurations
    if (sourceConfig.LambdaFunctionConfigurations && sourceConfig.LambdaFunctionConfigurations.length > 0) {
      custom_logging(chalk.blue(`Found ${sourceConfig.LambdaFunctionConfigurations.length} Lambda function configurations`));
      
      sourceConfig.LambdaFunctionConfigurations.forEach(lambdaConfig => {
        // Extract the function name and replace the region in the ARN
        const lambdaArn = lambdaConfig.LambdaFunctionArn;
        const updatedLambdaArn = lambdaArn.replace(
          `:lambda:${sourceRegion}:`, 
          `:lambda:${destinationRegion}:`
        );

        updatedConfig.LambdaFunctionConfigurations.push({
          ...lambdaConfig,
          LambdaFunctionArn: updatedLambdaArn
        });
      });
    }

    // Handle SNS topic configurations
    if (sourceConfig.TopicConfigurations && sourceConfig.TopicConfigurations.length > 0) {
      custom_logging(chalk.blue(`Found ${sourceConfig.TopicConfigurations.length} SNS topic configurations`));
      
      sourceConfig.TopicConfigurations.forEach(topicConfig => {
        // Extract the topic ARN and replace the region
        const topicArn = topicConfig.TopicArn;
        const updatedTopicArn = topicArn.replace(
          `:sns:${sourceRegion}:`, 
          `:sns:${destinationRegion}:`
        );

        updatedConfig.TopicConfigurations.push({
          ...topicConfig,
          TopicArn: updatedTopicArn
        });
      });
    }

    // Handle SQS queue configurations
    if (sourceConfig.QueueConfigurations && sourceConfig.QueueConfigurations.length > 0) {
      custom_logging(chalk.blue(`Found ${sourceConfig.QueueConfigurations.length} SQS queue configurations`));
      
      sourceConfig.QueueConfigurations.forEach(queueConfig => {
        // Extract the queue ARN and replace the region
        const queueArn = queueConfig.QueueArn;
        const updatedQueueArn = queueArn.replace(
          `:sqs:${sourceRegion}:`, 
          `:sqs:${destinationRegion}:`
        );

        updatedConfig.QueueConfigurations.push({
          ...queueConfig,
          QueueArn: updatedQueueArn
        });
      });
    }

    // Apply the updated configuration to the destination bucket
    if (global.DRY_RUN) {
      custom_logging(chalk.yellow('DRY RUN: Would apply the following notification configuration:'));
      custom_logging(JSON.stringify(updatedConfig, null, 2));
    } else {
      custom_logging(chalk.green(`Applying notification configuration to ${destinationBucket} in ${destinationRegion}`));
      
      await destinationS3.putBucketNotificationConfiguration({
        Bucket: destinationBucket,
        NotificationConfiguration: updatedConfig
      }).promise();
      
      custom_logging(chalk.green('Successfully applied notification configuration'));
    }

    custom_logging(chalk.green(`Successfully replicated S3 event notifications from ${sourceBucket} to ${destinationBucket}`));
  } catch (error) {
    custom_logging(chalk.red(`Error replicating S3 event notifications: ${error.message}`));
    throw error;
  }
};

// Main function
const main = async () => {
  // Setup command line options
  program
    .version('1.0.0')
    .option('-c, --config <path>', 'Path to configuration file', './configuration.json')
    .option('-d, --direction <direction>', 'Replication direction (active-to-failover or failover-to-active)', 'active-to-failover')
    .option('--dry-run', 'Dry run mode (no changes will be applied)')
    .parse(process.argv);

  const options = program.opts();
  
  // Set dry run flag if specified
  if (options.dryRun) {
    global.DRY_RUN = true;
    custom_logging(chalk.yellow('DRY RUN mode enabled - no changes will be applied'));
  } else {
    global.DRY_RUN = false;
  }

  try {
    // Read configuration file
    const configPath = path.resolve(options.config);
    custom_logging(chalk.blue(`Reading configuration from ${configPath}`));
    
    const config = await readAndParseFile(configPath);
    
    // Validate direction parameter
    const validDirections = ['active-to-failover', 'failover-to-active'];
    if (!validDirections.includes(options.direction)) {
      throw new Error(`Invalid direction: ${options.direction}. Must be one of: ${validDirections.join(', ')}`);
    }

    // Perform the replication
    await replicateS3EventNotifications(config, options.direction);
    
    custom_logging(chalk.green('Event notification replication completed successfully'));
  } catch (error) {
    custom_logging(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
};

// Execute the main function
main()
  .then(() => {
    custom_logging(chalk.green('Exiting...'));
  })
  .catch(error => {
    custom_logging(chalk.red(`Unhandled error: ${error.message}`));
    process.exit(1);
  });