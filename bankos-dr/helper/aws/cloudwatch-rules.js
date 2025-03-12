const AWS = require('aws-sdk');
const chalk = require('chalk');
const { custom_logging } = require('../helper.js');

global.dryRun = false;

const setDryRun = (value) => {
  global.dryRun = value;
};

const listEventBuses = async (region) => {
  const eventBridge = new AWS.EventBridge({ region });
  const response = await eventBridge.listEventBuses().promise();
  return response.EventBuses;
};

const listRules = async (region, eventBusName) => {
  const eventBridge = new AWS.EventBridge({ region });
  const response = await eventBridge.listRules({ EventBusName: eventBusName }).promise();
  return response.Rules.map(rule => rule.Name);
};

const enableRule = async (region, ruleName, eventBusName) => {
  if (global.dryRun) {
    custom_logging(chalk.cyan(`[DRY RUN] Would enable rule ${ruleName} on ${eventBusName} in ${region}`));
    return;
  }
  const eventBridge = new AWS.EventBridge({ region });
  await eventBridge.enableRule({ Name: ruleName, EventBusName: eventBusName }).promise();
  custom_logging(chalk.green(`Enabled rule ${ruleName} on ${eventBusName} in ${region}`));
};

const disableRule = async (region, ruleName, eventBusName) => {
  if (global.dryRun) {
    custom_logging(chalk.cyan(`[DRY RUN] Would disable rule ${ruleName} on ${eventBusName} in ${region}`));
    return;
  }
  const eventBridge = new AWS.EventBridge({ region });
  await eventBridge.disableRule({ Name: ruleName, EventBusName: eventBusName }).promise();
  custom_logging(chalk.red(`Disabled rule ${ruleName} on ${eventBusName} in ${region}`));
};

module.exports = { 
  setDryRun, 
  listEventBuses, 
  listRules, 
  enableRule, 
  disableRule 
};
