const { custom_logging , find_in_array_by_key_and_val }  = require ('../helper/helper.js')
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const {searchType, awsEnvironment}  = require ('../helper/enum.js')
const { listLambdas, modifyLambdaConcurrency, addLambdaPermission, getEventSourceMapping, updateEventSourceMapping } = require('../helper/aws/lambda.js')
const {  modifyEventBridgeRules } = require('../helper/aws/eventbridge.js')

const readFileAsync = promisify(fs.readFile);
async function readAndParseFile(file) {
    const data = await readFileAsync(file, { encoding: 'utf-8' });
    const dataToJson = JSON.parse(data);
    return dataToJson
  }

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
const processLambda = async (environmentConfig) => {
    custom_logging(chalk.green("Starting process on Lambdas"))
    let currentEnvironment = awsEnvironment.ACTIVE_ENV;
    let activeEnvLambdaProperties, activeEnvEventbridgeClient, activeEnvLambdaClient, activeEnvEnable, activeEnvConcurrency
    let failoverEnvLambdaProperties, failoverEnvEventbridgeClient, failoverEnvLambdaClient, failoverEnvEnable, failoverEnvConcurrency

    activeEnvLambdaProperties = environmentConfig.active_lambdas
    activeEnvEventbridgeClient = new AWS.EventBridge({ region: environmentConfig.active_region });
    activeEnvLambdaClient = new AWS.Lambda({ region:environmentConfig.active_region });

    failoverEnvLambdaProperties = environmentConfig.failover_lambdas
    failoverEnvEventbridgeClient = new AWS.EventBridge({ region: environmentConfig.failover_region });
    failoverEnvLambdaClient = new AWS.Lambda({ region:environmentConfig.failover_region });

    if (environmentConfig.switching_to === awsEnvironment.ACTIVE_ENV) {
        activeEnvEnable = true
        activeEnvConcurrency = 1
        failoverEnvEnable = false
        failoverEnvConcurrency = 0
        currentEnvironment = awsEnvironment.FAILOVER_ENV;
    }
    else {
        activeEnvEnable = false
        activeEnvConcurrency = 0
        failoverEnvEnable = true
        failoverEnvConcurrency = 1
    }

    let activeEnvLambdaArns = []
    let failoverEnvLambdaArns = []
    
    if (environmentConfig.active_type == searchType.ARN) {
        custom_logging(chalk.yellow(`Lambda ARNs will be processed for ${chalk.green(awsEnvironment.ACTIVE_ENV)} environment`));
        try {
            activeEnvLambdaArns = JSON.parse(environmentConfig.items.active_arns);
        } catch (error) {
            // Fallback to manual parsing if JSON parsing fails
            activeEnvLambdaArns = environmentConfig.items.active_arns.replace(/^\[|\]$/g, '').split(',').map(ip => ip.trim());
        }
        
    }
    else if (environmentConfig.active_type == searchType.PREFIX) {
        custom_logging(chalk.yellow(`Lambda prefix will be processed for ${chalk.green(awsEnvironment.ACTIVE_ENV)} environment`));
        let activeEnLambdaPrefix
        try {
            activeEnLambdaPrefix = JSON.parse(environmentConfig.items.active_prefix);
        } catch (error) {
            // Fallback to manual parsing if JSON parsing fails
            activeEnLambdaPrefix = environmentConfig.items.active_prefix.replace(/^\[|\]$/g, '').split(',').map(ip => ip.trim());
        }

        for (let item of activeEnLambdaPrefix) {
            let lambdaArns = await listLambdas(activeEnvLambdaClient, item)
            activeEnvLambdaArns = activeEnvLambdaArns.concat(lambdaArns)

        }
    }
    else {
        custom_logging(chalk.yellow(`All lambdas will be processed for ${chalk.green(awsEnvironment.ACTIVE_ENV)} environment`));
        // activeEnvLambdaArns = await listLambdas(activeEnvLambdaClient)
    }

    if (environmentConfig.failover_type == searchType.ARN) {
        custom_logging(chalk.yellow(`Lambda ARNs will be processed for ${chalk.green(awsEnvironment.FAILOVER_ENV)} environment`));
        failoverEnvLambdaArns = environmentConfig.items.failover_arns
        try {
            failoverEnvLambdaArns = JSON.parse(environmentConfig.items.failover_arns);
        } catch (error) {
            // Fallback to manual parsing if JSON parsing fails
            failoverEnvLambdaArns = environmentConfig.items.failover_arns.replace(/^\[|\]$/g, '').split(',').map(ip => ip.trim());
        }

    }
    else if (environmentConfig.failover_type == searchType.PREFIX) {
        custom_logging(chalk.yellow(`Lambda prefix will be processed for ${chalk.green(awsEnvironment.FAILOVER_ENV)} environment`));
        let failoverLambdaPrefix
        try {
            failoverLambdaPrefix = JSON.parse(environmentConfig.items.failover_prefix);
        } catch (error) {
            // Fallback to manual parsing if JSON parsing fails
            failoverLambdaPrefix = environmentConfig.items.failover_prefix.replace(/^\[|\]$/g, '').split(',').map(ip => ip.trim());
        }
        
        for (let item of failoverLambdaPrefix) {
            let lambdaArns = await listLambdas(failoverEnvLambdaClient, item)
            failoverEnvLambdaArns = failoverEnvLambdaArns.concat(lambdaArns)

        }
    }
    else {
        custom_logging(chalk.yellow(`All lambdas will be processed for ${chalk.green(awsEnvironment.FAILOVER_ENV)} environment`));
        // failoverEnvLambdaArns = await listLambdas(failoverEnvLambdaClient)
    }
    
    if (global.PROCESS_CURRENT_ENVIRONMENT || currentEnvironment === awsEnvironment.FAILOVER_ENV) {
        try {
            custom_logging(`Processing ${chalk.green(awsEnvironment.ACTIVE_ENV)} environment's lambdas/events`);
            await modifyLambdaConcurrency(activeEnvLambdaClient, activeEnvLambdaArns, activeEnvConcurrency)
            await modifyEventBridgeRules(activeEnvEventbridgeClient, activeEnvLambdaArns, activeEnvEnable)
        }
        catch (error) {
            custom_logging(chalk.red("Error: ") + error.message);
        }
    }
    
    if (global.PROCESS_CURRENT_ENVIRONMENT || currentEnvironment === awsEnvironment.ACTIVE_ENV) {
        try {
            custom_logging(`Processing ${chalk.green(awsEnvironment.FAILOVER_ENV)} environment's lambdas/events`);
            await modifyLambdaConcurrency(failoverEnvLambdaClient, failoverEnvLambdaArns, failoverEnvConcurrency)
            await modifyEventBridgeRules(failoverEnvEventbridgeClient, failoverEnvLambdaArns, failoverEnvEnable)   
        }
        catch (error) {
            custom_logging(chalk.red("Error: ") + error.message);
        }
    }
};
const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")

    .parse(process.argv);
    
    const options = program.opts();
    const file = './cloudfront/configuration.json';
    let envs = await readAndParseFile(file)
    envs['switching_to'] = process.env.SWITCHING_TO
    envs['active_type'] = process.env.ACTIVE_TYPE
    envs['failover_type'] = process.env.FAILOVER_TYPE

    if (envs['active_type'] == searchType.ARN) {
        envs['items'] = {
            ...envs['items'],
            "active_arns": process.env.ACTIVE_LAMBDA_ARNS,
        };
    } else if (envs['active_type'] == searchType.PREFIX) {
        envs['items'] = {
            ...envs['items'],
            "active_prefix": process.env.ACTIVE_LAMBDA_PREFIX,
        };
    }
    
    if (envs['failover_type'] == searchType.ARN) {
        envs['items'] = {
            ...envs['items'],
            "failover_arns": process.env.FAILOVER_LAMBDA_ARNS,
        };
    } else if (envs['failover_type'] == searchType.PREFIX) {
        envs['items'] = {
            ...envs['items'],
            "failover_prefix": process.env.FAILOVER_LAMBDA_PREFIX,
        };
    }

    if (options.dryRun) {
        global.DRY_RUN = true;
        custom_logging(chalk.yellow("DRY RUN is enabled"))
    }
    else
        custom_logging(chalk.red("DRY RUN is disabled"))

    if (options.processCurrentEnvironment) {
        global.PROCESS_CURRENT_ENVIRONMENT = true;
        custom_logging(chalk.red("Current environment will be processed"))
    }
    else
        custom_logging(chalk.yellow("Current environment will not be processed"))

    custom_logging(`Switing to ${chalk.green(envs.switching_to)} environment`)

    await processLambda(envs)
    custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });
