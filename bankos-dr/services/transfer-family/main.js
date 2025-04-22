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
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  const dataToJson = JSON.parse(data);
  return dataToJson;
};

// Function to get all Transfer Family users from a server
// Function to get all Transfer Family users from a server
const getTransferUsers = async (transferClient, serverId) => {
    custom_logging(chalk.blue(`Getting users from Transfer Family server: ${serverId}`));
    
    try {
      const users = [];
      let nextToken = null;
      
      do {
        const params = {
          ServerId: serverId,
          MaxResults: 100
        };
        
        if (nextToken) {
          params.NextToken = nextToken;
        }
        
        const response = await transferClient.listUsers(params).promise();
        
        const usersList = response.Users || [];
        
        for (const userSummary of usersList) {
          const userDetail = await transferClient.describeUser({
            ServerId: serverId,
            UserName: userSummary.UserName
          }).promise();
          
          // Print detailed user information
          custom_logging(chalk.cyan(`User details for ${userSummary.UserName}:`));
          custom_logging(JSON.stringify(userDetail.User, null, 2));
          
          // Special logging for SSH keys to see their format
          if (userDetail.User.SshPublicKeys && userDetail.User.SshPublicKeys.length > 0) {
            custom_logging(chalk.yellow(`SSH Public Keys for ${userSummary.UserName}:`));
            userDetail.User.SshPublicKeys.forEach((key, index) => {
              custom_logging(chalk.yellow(`Key ${index + 1} type: ${typeof key}`));
              custom_logging(chalk.yellow(`Key ${index + 1} content: ${JSON.stringify(key)}`));
            });
          }
          
          users.push(userDetail.User);
        }
        
        nextToken = response.NextToken;
      } while (nextToken);
      
      custom_logging(chalk.green(`Successfully fetched ${users.length} users from server ${serverId}`));
      return users;
    } catch (error) {
      custom_logging(chalk.red(`Error getting users from Transfer Family server ${serverId}: ${error.message}`));
      throw error;
    }
};
// Function to create a user on Transfer Family server
const createTransferUser = async (transferClient, serverId, userData) => {
    try {
      const params = {
        ServerId: serverId,
        HomeDirectory: userData.HomeDirectory,
        HomeDirectoryType: userData.HomeDirectoryType,
        Role: userData.Role,
        UserName: userData.UserName
      };
      
      // Add HomeDirectoryMappings if present
      if (userData.HomeDirectoryMappings && userData.HomeDirectoryMappings.length > 0) {
        params.HomeDirectoryMappings = userData.HomeDirectoryMappings;
      }
      
      // Add Policy if present
      if (userData.Policy) {
        params.Policy = userData.Policy;
      }
      
      // Add PosixProfile if present
      if (userData.PosixProfile) {
        params.PosixProfile = userData.PosixProfile;
      }
      
      // Create the user first without SSH keys
      await transferClient.createUser(params).promise();
      custom_logging(chalk.green(`Created user ${userData.UserName} on server ${serverId}`));
      
      // Add SSH public keys if present
      if (userData.SshPublicKeys && userData.SshPublicKeys.length > 0) {
        for (const sshKey of userData.SshPublicKeys) {
          // Extract the SshPublicKeyBody string from the object
          const keyBody = sshKey.SshPublicKeyBody;
          
          await transferClient.importSshPublicKey({
            ServerId: serverId,
            UserName: userData.UserName,
            SshPublicKeyBody: keyBody
          }).promise();
          custom_logging(chalk.green(`Added SSH public key for user ${userData.UserName}`));
        }
      }
      
      return true;
    } catch (error) {
      custom_logging(chalk.red(`Error creating user ${userData.UserName} on server ${serverId}: ${error.message}`));
      throw error;
    }
  };

const replicateTransferUsers = async (transferClient, serverId, users) => {
  custom_logging(chalk.blue(`Replicating users to Transfer Family server: ${serverId}`));
  
  try {
    const existingUsers = await getTransferUsers(transferClient, serverId);
    const existingUserNames = existingUsers.map(user => user.UserName);
    
    let created = 0;
    let skipped = 0;
    
    for (const user of users) {
      if (existingUserNames.includes(user.UserName)) {
        custom_logging(chalk.yellow(`User ${user.UserName} already exists on ${serverId}. Skipping.`));
        skipped++;
      } else {
        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would create user ${user.UserName} on ${serverId}`));
        } else {
          await createTransferUser(transferClient, serverId, user);
          created++;
        }
      }
    }
    
    custom_logging(chalk.green(`User replication complete for server ${serverId}. Created: ${created}, Skipped: ${skipped}`));
    return true;
  } catch (error) {
    custom_logging(chalk.red(`Error replicating users to Transfer Family server ${serverId}: ${error.message}`));
    throw error;
  }
};

const processTransferUserReplication = async (config) => {
  custom_logging(chalk.green("Starting Transfer Family user replication process"));
  
  const activeRegion = config.active_region;
  const failoverRegion = config.failover_region;
  
  const servers = config.servers;
  
  try {
    for (const serverPair of servers) {
      const activeServerConfig = serverPair.active_server;
      const failoverServerConfig = serverPair.failover_server;
      
      const activeTransfer = new AWS.Transfer({ region: activeRegion });
      const failoverTransfer = new AWS.Transfer({ region: failoverRegion });
      
      if (config.switching_to === "ACTIVE") {
        custom_logging(chalk.yellow("Replicating users from FAILOVER to ACTIVE server"));
        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would replicate users from ${failoverServerConfig.serverId} to ${activeServerConfig.serverId}`));
        } else {
          const users = await getTransferUsers(failoverTransfer, failoverServerConfig.serverId);
          await replicateTransferUsers(activeTransfer, activeServerConfig.serverId, users);
        }
      } else {
        custom_logging(chalk.yellow("Replicating users from ACTIVE to FAILOVER server"));
        if (global.DRY_RUN) {
          custom_logging(chalk.yellow(`[DRY RUN] Would replicate users from ${activeServerConfig.serverId} to ${failoverServerConfig.serverId}`));
        } else {
          const users = await getTransferUsers(activeTransfer, activeServerConfig.serverId);
          await replicateTransferUsers(failoverTransfer, failoverServerConfig.serverId, users);
        }
      }
    }
    
    custom_logging(chalk.green("Transfer Family user replication process completed"));
  } catch (error) {
    custom_logging(chalk.red('Error during user replication: ') + error.message);
    throw error;
  }
};

const mainFunction = async () => {
  program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .parse(process.argv);

  const options = program.opts();

  global.SLEEP_TIME = 1000;
  
  const file = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'transfer-family', 'configuration.json');

  if (!fs.existsSync(file)) {
    custom_logging(chalk.red(`Configuration file not found for client: ${process.env.CLIENT_NAME}`));
    return;
  }

  let config = await readAndParseFile(file);
  config['switching_to'] = process.env.SWITCHING_TO;

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

  custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);

  await processTransferUserReplication(config);
  custom_logging(chalk.green("User replication has been completed"));
};

mainFunction()
  .then(() => {
    custom_logging(chalk.green("Exiting ..."));
  })
  .catch((error) => {
    custom_logging(chalk.red("Error: ") + error.message);
  });