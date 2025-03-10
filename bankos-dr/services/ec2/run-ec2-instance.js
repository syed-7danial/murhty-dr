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
  maxRetries: 5, // Maximum number of retries
    retryDelayOptions: { 
        base: 200 // Base delay in milliseconds
    }
})

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  const dataToJson = JSON.parse(data);
  return dataToJson;
};

const processEC2Instances = async (ec2Settings) => {
  custom_logging(chalk.green("Starting process on EC2 instances"));
  
  const active_ec2 = new AWS.EC2({ region: ec2Settings.active_region });
  const failover_ec2 = new AWS.EC2({ region: ec2Settings.failover_region });
  console.log(ec2Settings)
  let prodInstanceIds = [];
  let drInstanceIds = [];
  prodInstanceIds = ec2Settings.active_instance_id;
  drInstanceIds = ec2Settings.failover_instance_id;
  try {

    if (ec2Settings.switching_to === "ACTIVE") {
      await active_ec2.startInstances({ InstanceIds: prodInstanceIds }).promise();
      custom_logging(chalk.green('Started ACTIVE REGION Instances'));

      await failover_ec2.stopInstances({ InstanceIds: drInstanceIds }).promise();
      custom_logging(chalk.green('Stopped FAILOVER REGION Instances'));
    } 
    
    else {
      await failover_ec2.startInstances({ InstanceIds: drInstanceIds }).promise();
      custom_logging(chalk.green('Started FAILOVER REGION Instances'));

      await active_ec2.stopInstances({ InstanceIds: prodInstanceIds }).promise();
      custom_logging(chalk.green('Stopped ACTIVE REGION Instances'));
    }
  } catch (error) {
    custom_logging(chalk.red('Error managing instances: ') + error.message);
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .parse(process.argv);

  const options = program.opts();
  
  const file = path.resolve(__dirname, '..', '..', 'configuration', "common", 'ec2', 'configuration.json');
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

  await processEC2Instances(envs);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
