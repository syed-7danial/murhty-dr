const { custom_logging } = require('../../helper/helper.js');
const fs = require('fs');
const { promisify } = require('util');
const { program } = require('commander');
const chalk = require('chalk');
const AWS = require('aws-sdk');
const readFileAsync = promisify(fs.readFile);
const path = require('path');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 }
});

const readConfigFile = async () => {
  const filePath = path.resolve(__dirname, '..', '..', 'configuration', "common", 'cloudwatch-rules', 'configuration.json');
  const data = await readFileAsync(filePath, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const processEventBridgeRules = async (config, switchingTo) => {
  custom_logging(chalk.green("Starting process on EventBridge rules"));

  try {
    const regions = [config.active_region, config.failover_region];
    const eventbridges = regions.map(region => new AWS.EventBridge({ region }));
    
    const processBus = async (eventbridge, region, enable) => {
      const buses = await eventbridge.listEventBuses().promise();
      for (const bus of buses.EventBuses) {
        const rules = await eventbridge.listRules({ EventBusName: bus.Name }).promise();
        for (const rule of rules.Rules) {
          if (global.PROCESS_CURRENT_ENVIRONMENT || switchingTo !== region) {
            if (enable) {
              await eventbridge.enableRule({ Name: rule.Name, EventBusName: bus.Name }).promise();
              custom_logging(chalk.green(`Enabled rule ${rule.Name} on ${bus.Name} in ${region}`));
            } else {
              await eventbridge.disableRule({ Name: rule.Name, EventBusName: bus.Name }).promise();
              custom_logging(chalk.red(`Disabled rule ${rule.Name} on ${bus.Name} in ${region}`));
            }
          }
        }
      }
    };

    if (switchingTo === "ACTIVE") {
      await processBus(eventbridges[0], regions[0], true);
      await processBus(eventbridges[1], regions[1], false);
    } else {
      await processBus(eventbridges[1], regions[1], true);
      await processBus(eventbridges[0], regions[0], false);
    }
  } catch (error) {
    custom_logging(chalk.red('Error managing EventBridge rules: ') + error.message);
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .parse(process.argv);

  const options = program.opts();

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

  if (!process.env.SWITCHING_TO) {
    custom_logging(chalk.red("Missing required parameter: SWITCHING_TO"));
    process.exit(1);
  }

  const config = await readConfigFile();
  custom_logging(`Switching to ${chalk.green(process.env.SWITCHING_TO)} environment`);
  await processEventBridgeRules(config, process.env.SWITCHING_TO);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
