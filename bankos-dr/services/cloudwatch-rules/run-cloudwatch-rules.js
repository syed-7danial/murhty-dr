// // const { custom_logging } = require('../../helper/helper.js');
// // const fs = require('fs');
// // const { promisify } = require('util');
// // const { program } = require('commander');
// // const chalk = require('chalk');
// // const AWS = require('aws-sdk');
// // const readFileAsync = promisify(fs.readFile);
// // const path = require('path');

// // AWS.config.update({
// //   accessKeyId: process.env.AWS_ACCESS_KEY_ID,
// //   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
// //   sessionToken: process.env.AWS_SESSION_TOKEN,
// //   maxRetries: 5,
// //   retryDelayOptions: { base: 200 }
// // });

// // const readConfigFile = async () => {
// //   const filePath = path.resolve(__dirname, '..', '..', 'configuration', 'common', 'cloudwatch-rules', 'configuration.json');
// //   const data = await readFileAsync(filePath, { encoding: 'utf-8' });
// //   return JSON.parse(data);
// // };

// // const processEventBridgeRules = async (config, switchingToActive, processCurrentEnv, isDryRun) => {
// //   const targetRegion = switchingToActive ? config.active_region : config.failover_region;
// //   const currentRegion = switchingToActive ? config.failover_region : config.active_region;
  
// //   custom_logging(chalk.green(`Starting to enable rules in the target region: ${targetRegion}`));
// //   try {
// //     const targetEventBridge = new AWS.EventBridge({ region: targetRegion });
// //     const targetBuses = await targetEventBridge.listEventBuses().promise();
    
// //     for (const bus of targetBuses.EventBuses) {
// //       const rules = await targetEventBridge.listRules({ EventBusName: bus.Name }).promise();
// //       for (const rule of rules.Rules) {
// //         try {
// //           if (isDryRun) {
// //             custom_logging(chalk.cyan(`[DRY RUN] Would enable rule ${rule.Name} on ${bus.Name} in ${targetRegion}`));
// //           } else {
// //             await targetEventBridge.enableRule({ Name: rule.Name, EventBusName: bus.Name }).promise();
// //             custom_logging(chalk.green(`Enabled rule ${rule.Name} on ${bus.Name} in ${targetRegion}`));
// //           }
// //         } catch (err) {
// //           custom_logging(chalk.yellow(`Skipping enabling rule ${rule.Name} in ${targetRegion}: ${err.message}`));
// //         }
// //       }
// //     }
// //   } catch (error) {
// //     custom_logging(chalk.red(`Error ${isDryRun ? 'simulating' : 'enabling'} EventBridge rules in ${targetRegion}: `) + error.message);
// //   }
  
// //   if (processCurrentEnv) {
// //     custom_logging(chalk.yellow(`Process current environment selected. ${isDryRun ? 'Would disable' : 'Disabling'} rules in the current region: ${currentRegion}`));
// //     try {
// //       const currentEventBridge = new AWS.EventBridge({ region: currentRegion });
// //       const currentBuses = await currentEventBridge.listEventBuses().promise();
      
// //       for (const bus of currentBuses.EventBuses) {
// //         const rules = await currentEventBridge.listRules({ EventBusName: bus.Name }).promise();
// //         for (const rule of rules.Rules) {
// //           try {
// //             if (isDryRun) {
// //               custom_logging(chalk.cyan(`[DRY RUN] Would disable rule ${rule.Name} on ${bus.Name} in ${currentRegion}`));
// //             } else {
// //               await currentEventBridge.disableRule({ Name: rule.Name, EventBusName: bus.Name }).promise();
// //               custom_logging(chalk.red(`Disabled rule ${rule.Name} on ${bus.Name} in ${currentRegion}`));
// //             }
// //           } catch (err) {
// //             custom_logging(chalk.yellow(`Skipping disabling rule ${rule.Name} in ${currentRegion}: ${err.message}`));
// //           }
// //         }
// //       }
// //     } catch (error) {
// //       custom_logging(chalk.red(`Error ${isDryRun ? 'simulating' : 'disabling'} EventBridge rules in ${currentRegion}: `) + error.message);
// //     }
// //   } else {
// //     custom_logging(chalk.blue(`Not processing current environment. Keeping rules in ${currentRegion} as is.`));
// //   }
// // };

// // const mainFunction = async () => {
// //   program
// //     .version('0.0.1')
// //     .option('-dr --dryRun', "Dry run the process")
// //     .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
// //     .parse(process.argv);

// //   const options = program.opts();
// //   const isDryRun = options.dryRun || false;

// //   if (isDryRun) {
// //     custom_logging(chalk.yellow("DRY RUN is enabled - No changes will be made to EventBridge rules"));
// //   } else {
// //     custom_logging(chalk.red("DRY RUN is disabled - Changes will be applied to EventBridge rules"));
// //   }

// //   if (!process.env.SWITCHING_TO) {
// //     custom_logging(chalk.red("Missing required parameter: SWITCHING_TO"));
// //     process.exit(1);
// //   }

// //   const config = await readConfigFile();
// //   const switchingToActive = process.env.SWITCHING_TO === "ACTIVE";
// //   custom_logging(`${isDryRun ? '[DRY RUN] Would switch' : 'Switching'} to ${chalk.green(process.env.SWITCHING_TO)} environment`);
  
// //   await processEventBridgeRules(config, switchingToActive, options.processCurrentEnvironment, isDryRun);
  
// //   custom_logging(chalk.green(`${isDryRun ? '[DRY RUN] Process simulation' : 'Process'} has been completed`));
// // };

// // mainFunction()
// //   .then(() => {
// //     custom_logging(chalk.green("Exiting ..."));
// //   })
// //   .catch((error) => {
// //     custom_logging(chalk.red("Error: ") + error.message);
// //   });

// // const { custom_logging } = require('../../helper/helper.js');
// // const fs = require('fs');
// // const { promisify } = require('util');
// // const { program } = require('commander');
// // const chalk = require('chalk');
// // const path = require('path');
// // const { listEventBuses, listRules, enableRule, disableRule } = require('../../helper/aws/cloudwatch-rules.js');

// // const readFileAsync = promisify(fs.readFile);

// // const readConfigFile = async () => {
// //   const filePath = path.resolve(__dirname, '..', '..', 'configuration', 'common', 'cloudwatch-rules', 'configuration.json');
// //   const data = await readFileAsync(filePath, { encoding: 'utf-8' });
// //   return JSON.parse(data);
// // };

// // const processEventBridgeRules = async (config, switchingToActive, processCurrentEnv) => {
// //   const targetRegion = switchingToActive ? config.active_region : config.failover_region;
// //   const currentRegion = switchingToActive ? config.failover_region : config.active_region;

// //   custom_logging(chalk.green(`Starting to enable rules in the target region: ${targetRegion}`));
// //   try {
// //     const targetBuses = await listEventBuses(targetRegion);
    
// //     for (const bus of targetBuses) {
// //       const rules = await listRules(targetRegion, bus.Name);
// //       for (const rule of rules) {
// //         await enableRule(targetRegion, rule, bus.Name);
// //       }
// //     }
// //   } catch (error) {
// //     custom_logging(chalk.red(`Error ${global.dryRun ? 'simulating' : 'enabling'} EventBridge rules in ${targetRegion}: `) + error.message);
// //   }

// //   if (processCurrentEnv) {
// //     custom_logging(chalk.yellow(`Process current environment selected. ${global.dryRun ? 'Would disable' : 'Disabling'} rules in the current region: ${currentRegion}`));
// //     try {
// //       const currentBuses = await listEventBuses(currentRegion);
      
// //       for (const bus of currentBuses) {
// //         const rules = await listRules(currentRegion, bus.Name);
// //         for (const rule of rules) {
// //           await disableRule(currentRegion, rule, bus.Name);
// //         }
// //       }
// //     } catch (error) {
// //       custom_logging(chalk.red(`Error ${global.dryRun ? 'simulating' : 'disabling'} EventBridge rules in ${currentRegion}: `) + error.message);
// //     }
// //   } else {
// //     custom_logging(chalk.blue(`Not processing current environment. Keeping rules in ${currentRegion} as is.`));
// //   }
// // };

// // const mainFunction = async () => {
// //   program
// //     .version('0.0.1')
// //     .option('-dr --dryRun', "Dry run the process")
// //     .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
// //     .parse(process.argv);

// //   const options = program.opts();
// //   global.DRY_RUN = options.dryRun || false;

// //   custom_logging(global.dryRun 
// //     ? chalk.yellow("DRY RUN is enabled - No changes will be made to EventBridge rules") 
// //     : chalk.red("DRY RUN is disabled - Changes will be applied to EventBridge rules")
// //   );

// //   if (!process.env.SWITCHING_TO) {
// //     custom_logging(chalk.red("Missing required parameter: SWITCHING_TO"));
// //     process.exit(1);
// //   }

// //   const config = await readConfigFile();
// //   const switchingToActive = process.env.SWITCHING_TO === "ACTIVE";

// //   custom_logging(`${global.dryRun ? '[DRY RUN] Would switch' : 'Switching'} to ${chalk.green(process.env.SWITCHING_TO)} environment`);
  
// //   await processEventBridgeRules(config, switchingToActive, options.processCurrentEnvironment);
  
// //   custom_logging(chalk.green(`${global.dryRun ? '[DRY RUN] Process simulation' : 'Process'} has been completed`));
// // };

// // mainFunction().catch((error) => {
// //   custom_logging(chalk.red("Error: ") + error.message);
// // });

// const { custom_logging } = require('../../helper/helper.js');
// const fs = require('fs');
// const { promisify } = require('util');
// const { program } = require('commander');
// const chalk = require('chalk');
// const path = require('path');
// const { 
//   listEventBuses, 
//   listRules, 
//   enableRule, 
//   disableRule 
// } = require('../../helper/helper.js');

// const readFileAsync = promisify(fs.readFile);

// const readConfigFile = async () => {
//   const filePath = path.resolve(__dirname, '..', '..', 'configuration', 'common', 'cloudwatch-rules', 'configuration.json');
//   const data = await readFileAsync(filePath, { encoding: 'utf-8' });
//   return JSON.parse(data);
// };

// const processEventBridgeRules = async (config, switchingToActive, processCurrentEnv) => {
//   const targetRegion = switchingToActive ? config.active_region : config.failover_region;
//   const currentRegion = switchingToActive ? config.failover_region : config.active_region;

//   custom_logging(chalk.green(`Starting to enable rules in the target region: ${targetRegion}`));
//   try {
//     const targetBuses = await listEventBuses(targetRegion);
    
//     for (const bus of targetBuses) {
//       const rules = await listRules(targetRegion, bus.Name);
//       for (const rule of rules) {
//         await enableRule(targetRegion, rule, bus.Name);
//       }
//     }
//   } catch (error) {
//     custom_logging(chalk.red(`Error ${global.dryRun ? 'simulating' : 'enabling'} EventBridge rules in ${targetRegion}: `) + error.message);
//   }

//   if (processCurrentEnv) {
//     custom_logging(chalk.yellow(`Process current environment selected. ${global.dryRun ? 'Would disable' : 'Disabling'} rules in the current region: ${currentRegion}`));
//     try {
//       const currentBuses = await listEventBuses(currentRegion);
      
//       for (const bus of currentBuses) {
//         const rules = await listRules(currentRegion, bus.Name);
//         for (const rule of rules) {
//           await disableRule(currentRegion, rule, bus.Name);
//         }
//       }
//     } catch (error) {
//       custom_logging(chalk.red(`Error ${global.dryRun ? 'simulating' : 'disabling'} EventBridge rules in ${currentRegion}: `) + error.message);
//     }
//   } else {
//     custom_logging(chalk.blue(`Not processing current environment. Keeping rules in ${currentRegion} as is.`));
//   }
// };

// const mainFunction = async () => {
//   program
//     .version('0.0.1')
//     .option('-dr --dryRun', "Dry run the process")
//     .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
//     .parse(process.argv);

//   const options = program.opts();
//   global.dryRun = options.dryRun || false;

//   custom_logging(global.dryRun 
//     ? chalk.yellow("DRY RUN is enabled - No changes will be made to EventBridge rules") 
//     : chalk.red("DRY RUN is disabled - Changes will be applied to EventBridge rules")
//   );

//   if (!process.env.SWITCHING_TO) {
//     custom_logging(chalk.red("Missing required parameter: SWITCHING_TO"));
//     process.exit(1);
//   }

//   const config = await readConfigFile();
//   const switchingToActive = process.env.SWITCHING_TO === "


const { custom_logging } = require('../../helper/helper.js');
const fs = require('fs');
const AWS = require('aws-sdk');
const { promisify } = require('util');
const { program } = require('commander');
const chalk = require('chalk');
const path = require('path');
const { listEventBuses, listRules, enableRule, disableRule } = require('../../helper/aws/cloudwatch-rules.js');
const readFileAsync = promisify(fs.readFile);

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    maxRetries: 5,
    retryDelayOptions: { base: 200 }
  });
  

global.dryRun = false; 

const readConfigFile = async () => {
  const filePath = path.resolve(__dirname, '..', '..', 'configuration', 'common', 'cloudwatch-rules', 'configuration.json');
  const data = await readFileAsync(filePath, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const processEventBridgeRules = async (config, switchingToActive, processCurrentEnv) => {
  const targetRegion = switchingToActive ? config.active_region : config.failover_region;
  const currentRegion = switchingToActive ? config.failover_region : config.active_region;

  custom_logging(chalk.green(`Starting to enable rules in the target region: ${targetRegion}`));
  try {
    const targetBuses = await listEventBuses(targetRegion);
    
    for (const bus of targetBuses) {
      const rules = await listRules(targetRegion, bus.Name);
      for (const rule of rules) {
        await enableRule(targetRegion, rule, bus.Name);
      }
    }
  } catch (error) {
    custom_logging(chalk.red(`Error ${global.dryRun ? 'simulating' : 'enabling'} EventBridge rules in ${targetRegion}: `) + error.message);
  }

  if (processCurrentEnv) {
    custom_logging(chalk.yellow(`Process current environment selected. ${global.dryRun ? 'Would disable' : 'Disabling'} rules in the current region: ${currentRegion}`));
    try {
      const currentBuses = await listEventBuses(currentRegion);
      
      for (const bus of currentBuses) {
        const rules = await listRules(currentRegion, bus.Name);
        for (const rule of rules) {
          await disableRule(currentRegion, rule, bus.Name);
        }
      }
    } catch (error) {
      custom_logging(chalk.red(`Error ${global.dryRun ? 'simulating' : 'disabling'} EventBridge rules in ${currentRegion}: `) + error.message);
    }
  } else {
    custom_logging(chalk.blue(`Not processing current environment. Keeping rules in ${currentRegion} as is.`));
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .parse(process.argv);

  const options = program.opts();
  global.dryRun = options.dryRun || false;

  if (global.dryRun) {
    custom_logging(chalk.yellow("DRY RUN is enabled - No changes will be made to Cloudwatch rules"));
  } else {
    custom_logging(chalk.red("DRY RUN is disabled - Changes will be applied to Cloudwatch rules"));
  }

  if (!process.env.SWITCHING_TO) {
    custom_logging(chalk.red("Missing required parameter: SWITCHING_TO"));
    process.exit(1);
  }

  const config = await readConfigFile();
  const switchingToActive = process.env.SWITCHING_TO === "ACTIVE";
  custom_logging(`${global.dryRun ? '[DRY RUN] Would switch' : 'Switching'} to ${chalk.green(process.env.SWITCHING_TO)} environment`);

  await processEventBridgeRules(config, switchingToActive, options.processCurrentEnvironment);

  custom_logging(chalk.green(`${global.dryRun ? '[DRY RUN] Process simulation' : 'Process'} has been completed`));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
});