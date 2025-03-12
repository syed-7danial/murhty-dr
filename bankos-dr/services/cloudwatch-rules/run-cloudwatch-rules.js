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
  const filePath = path.resolve(__dirname, '..', '..', 'configuration', 'common', 'cloudwatch-rules', 'configuration.json');
  const data = await readFileAsync(filePath, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const processEventBridgeRules = async (config, enable) => {
  custom_logging(chalk.green("Starting process on EventBridge rules"));

  try {
    const eventbridge = new AWS.EventBridge({ region: enable ? config.active_region : config.failover_region });
    const buses = await eventbridge.listEventBuses().promise();
    for (const bus of buses.EventBuses) {
      const rules = await eventbridge.listRules({ EventBusName: bus.Name }).promise();
      for (const rule of rules.Rules) {
        try {
          if (enable) {
            await eventbridge.enableRule({ Name: rule.Name, EventBusName: bus.Name }).promise();
            custom_logging(chalk.green(`Enabled rule ${rule.Name} on ${bus.Name}`));
          } else {
            await eventbridge.disableRule({ Name: rule.Name, EventBusName: bus.Name }).promise();
            custom_logging(chalk.red(`Disabled rule ${rule.Name} on ${bus.Name}`));
          }
        } catch (err) {
          custom_logging(chalk.yellow(`Skipping rule ${rule.Name}: ${err.message}`));
        }
      }
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

  if (!process.env.SWITCHING_TO) {
    custom_logging(chalk.red("Missing required parameter: SWITCHING_TO"));
    process.exit(1);
  }

  const config = await readConfigFile();
  const enable = process.env.SWITCHING_TO === "ACTIVE";
  custom_logging(`Switching to ${chalk.green(process.env.SWITCHING_TO)} environment`);
  await processEventBridgeRules(config, enable);
  custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });
