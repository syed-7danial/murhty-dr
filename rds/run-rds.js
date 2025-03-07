const { custom_logging , find_in_array_by_key_and_val }  = require ('../helper/helper.js')
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const {awsEnvironment}  = require ('../helper/enum.js')
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

const {
    initializeRdsClients,
    deleteDbInstance,
    createReadReplica,
    promoteReadReplica,
    checkIfRdsExists,
    describeDBInstances,
    describeDBProxies,
    updateRDSProxy
} = require('../helper/aws/rds.js');

const waitForDbInstanceDeletion = async (rdsClient, deleteDbInstanceparams) => {
    let instanceExists = true;
    while (instanceExists) {
        try {
            await describeDBInstances(rdsClient, deleteDbInstanceparams)
            custom_logging(chalk.red(`Waiting for ${deleteDbInstanceparams} DB instance to be deleted.`))
            await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME * 60));
        } catch (error) {
            if (error.code === 'DBInstanceNotFound') {
                custom_logging(chalk.green(`${deleteDbInstanceparams} DB instance deleted successfully.`))
                instanceExists = false;
            } else {
                custom_logging(chalk.red("Error: An error occurred while waiting for DB deletion"));
                throw error;
            }
        }
    }
};

const modifyDBInstanceIdentifier = async (rds, dbInstanceIdentifier) => {
    const newDbInstanceIdentifier = `${dbInstanceIdentifier.identifier}-back`;

    try {
        // Step 1: Modify a DbInstance name
        await rds.modifyDBInstance({
            DBInstanceIdentifier: dbInstanceIdentifier.identifier,
            NewDBInstanceIdentifier: newDbInstanceIdentifier,
            ApplyImmediately: true

        }).promise();
        console.log(`Original DB instance ${dbInstanceIdentifier} is now modified.`);
    } catch (err) {
        console.error('Error during the DB instance modification process:', err);
        throw err;
    }

};

const processRds = async (environmentConfig) => {
    custom_logging(chalk.green("Starting process on RDS"));
    const { activeRdsClient, failoverRdsClient } = initializeRdsClients(environmentConfig);
    const sts = new AWS.STS();
    try 
    {
        for (let rdsConfig of environmentConfig.rds) {
            if (environmentConfig.switching_to == "ACTIVE") {                
                custom_logging(`Checking if ${ rdsConfig.active_configurations.identifier } already exists in ${environmentConfig.active_region}`);
                // / Getting Active DB details

                let getDbInstanceDetailsparams = { DBInstanceIdentifier: rdsConfig.active_configurations.identifier }                                
                let dbInstanceDetails = await checkIfRdsExists(activeRdsClient, getDbInstanceDetailsparams) 
                let currentDateTime = new Date().toISOString();
                currentDateTime = currentDateTime.replaceAll("T","-").replaceAll(":","-").split(".")[0]
 
                var deleteDbInstanceparams = {
                    DBInstanceIdentifier: rdsConfig.active_configurations.identifier,
                    FinalDBSnapshotIdentifier: rdsConfig.active_configurations.identifier+currentDateTime,
                    SkipFinalSnapshot: false
                };

                if (dbInstanceDetails && dbInstanceDetails.DBInstances.length > 0) {
                    if (rdsConfig.force_delete_if_exists) { 
                        custom_logging(chalk.red(`Deleting ${environmentConfig.active_region}'s ${rdsConfig.active_configurations.identifier}`));
                        await deleteDbInstance(activeRdsClient, deleteDbInstanceparams);
                        await waitForDbInstanceDeletion(activeRdsClient, deleteDbInstanceparams.DBInstanceIdentifier); 
                    }
                    else
                        throw Error(`DB ${rdsConfig.active_configurations.identifier} already exists, Please delete it first`)
                }
                /// Getting Failover DB details
                dbInstanceDetails = await describeDBInstances(failoverRdsClient, rdsConfig.failover_configurations.identifier)
                const { Account: accountId} = await sts.getCallerIdentity({}).promise();

                let createReadReplicaParams = {
                    DBInstanceIdentifier: rdsConfig.active_configurations.identifier,
                    SourceDBInstanceIdentifier: `arn:aws:rds:${environmentConfig.failover_region}:${accountId}:db:${rdsConfig.failover_configurations.identifier}`, 
                    SourceRegion: environmentConfig.failover_region,
                    DBInstanceClass: dbInstanceDetails.DBInstances[0].DBInstanceClass,
                    DBSubnetGroupName: rdsConfig.active_configurations.subnet_group_name,
                    VpcSecurityGroupIds: rdsConfig.active_configurations.security_group_ids
                };

                if (rdsConfig.active_configurations.hasOwnProperty("kms_key_id") && rdsConfig.active_configurations.kms_key_id != "")
                    createReadReplicaParams['KmsKeyId'] = rdsConfig.active_configurations.kms_key_id
                
                custom_logging(`Creating read-replica of ${ rdsConfig.failover_configurations.identifier } in ${environmentConfig.active_region}`);
                await createReadReplica(activeRdsClient, createReadReplicaParams);
                custom_logging(`Getting ${ rdsConfig.active_configurations.proxy_name } details in ${environmentConfig.active_region}`);

                let describeProxyParams = {
                    DBProxyName: rdsConfig.active_configurations.proxy_name,
                    DBInstanceIdentifier: rdsConfig.active_configurations.identifier
                }
        
        
                result = await describeDBProxies(activeRdsClient, describeProxyParams);
    
                let updateRDSProxyParams = {
                    DBProxyName: rdsConfig.active_configurations.proxy_name, // Replace with your RDS Proxy name
                    Auth: result.Auth,
                    IdleClientTimeout: result.IdleClientTimeout, // Replace with the desired idle client timeout in seconds
                    DebugLogging: result.DebugLogging, // Enable or disable debug logging
                    RequireTLS: result.RequireTLS, // Require or disable TLS for the proxy
                    RoleArn: result.RoleArn 
                    // You can specify other parameters here to modify as per your requirement
                }            
    
                custom_logging(`Updating ${ activeRdsClient, rdsConfig.active_configurations.proxy_name } details in ${environmentConfig.active_region}`);
                await updateRDSProxy(activeRdsClient, updateRDSProxyParams);

                let promoteReadReplicationParams = {      
                    DBInstanceIdentifier: rdsConfig.active_configurations.identifier
                };

                await promoteReadReplica(activeRdsClient, promoteReadReplicationParams);
                
                custom_logging(chalk.yellow(`${rdsConfig.active_configurations.identifier} is promoted in ${environmentConfig.active_region}, Please update your DBs connection in applications to newly created Primary RDS in ${environmentConfig.active_region}`))
                custom_logging(chalk.yellow(`We'll start deleting ${rdsConfig.failover_configurations.identifier} DB in ${environmentConfig.failover_region}`))

            }
        else {
            custom_logging(`Promoting ${environmentConfig.failover_region}'s  ${rdsConfig.failover_configurations.identifier}`)
            let promoteReadReplicationParams = {
                DBInstanceIdentifier: rdsConfig.failover_configurations.identifier                 
            }
            await promoteReadReplica(failoverRdsClient, promoteReadReplicationParams)

            let describeProxyParams = {
                DBProxyName: rdsConfig.failover_configurations.proxy_name,
                DBInstanceIdentifier: rdsConfig.failover_configurations.identifier
            }

            custom_logging(`Getting ${ rdsConfig.failover_configurations.proxy_name } details in ${environmentConfig.failover_region}`);
            result = await describeDBProxies(failoverRdsClient, describeProxyParams);

            let updateRDSProxyParams = {
                DBProxyName: rdsConfig.failover_configurations.proxy_name, // Replace with your RDS Proxy name
                Auth: result.Auth,
                IdleClientTimeout: result.IdleClientTimeout, // Replace with the desired idle client timeout in seconds
                DebugLogging: result.DebugLogging, // Enable or disable debug logging
                RequireTLS: result.RequireTLS, // Require or disable TLS for the proxy
                RoleArn: result.RoleArn 
                // You can specify other parameters here to modify as per your requirement
            }            

            custom_logging(`Updating ${ failoverRdsClient, rdsConfig.failover_configurations.proxy_name } details in ${environmentConfig.failover_region}`);
            await updateRDSProxy(failoverRdsClient, updateRDSProxyParams);
            await modifyDBInstanceIdentifier(activeRdsClient, rdsConfig.active_configurations )    
        }
    }
    
    }
    catch(error) {
        custom_logging(chalk.red("Error: ") + error.message);
    }
}

const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")
    .option('-d --deleteFailoverRds', "Delete the Rds in failover region")

    .parse(process.argv);
    
    const options = program.opts();
    const file = './rds/configuration.json';
    let envs = await readAndParseFile(file)
    let configuration = {"rds":{}}
    const abankObject = envs.rds.find(rds => rds.id === process.env.BANK_ID);
    configuration.active_region = envs.active_region
    configuration.failover_region = envs.failover_region

    configuration.switching_to = process.env.SWITCHING_TO
    configuration['rds']['forced_delete'] = process.env.FORCE_DELETE
    configuration['rds'] = abankObject
    configuration['rds']['proxy_name'] = process.env.PROXY_NAME
 
    configuration['rds'] = [configuration['rds']]
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

    custom_logging(`Switing to ${chalk.green(configuration.switching_to)} environment`)

    if(options.deleteFailoverRds){
        await process_rds_failover_deletion(configuration)
        custom_logging(chalk.green("Process has been completed"));
        return;
    } 
    console.log(process.env)

    console.log(configuration)
    // await processRds(configuration)
    custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });


const process_rds_failover_deletion = async (environmentConfig) => {
    const sts = new AWS.STS();
    custom_logging(chalk.green("Starting process on RDS FAILOVER DELETION"));

    const { activeRdsClient, failoverRdsClient } = initializeRdsClients(environmentConfig);

    for (let rdsConfig of environmentConfig.rds) {

        let getDbInstanceDetailsparams = { DBInstanceIdentifier: rdsConfig.active_configurations.identifier }                                
        let dbInstanceDetails = await checkIfRdsExists(activeRdsClient, getDbInstanceDetailsparams) 

        let deleteDbInstanceparams = {
                DBInstanceIdentifier: rdsConfig.failover_configurations.identifier,
                SkipFinalSnapshot: true
            };
        custom_logging(`Deleting ${ rdsConfig.failover_configurations.identifier } in ${environmentConfig.failover_region}`);
        await deleteDbInstance(failoverRdsClient, deleteDbInstanceparams, rdsConfig);

        await waitForDbInstanceDeletion(failoverRdsClient, deleteDbInstanceparams.DBInstanceIdentifier);
        const { Account: accountId} = await sts.getCallerIdentity({}).promise();

        let createReadReplicaParams = {
            DBInstanceIdentifier: rdsConfig.failover_configurations.identifier,
            SourceDBInstanceIdentifier: `arn:aws:rds:${environmentConfig.active_region}:${accountId}:db:${rdsConfig.active_configurations.identifier}`, 
            SourceRegion: environmentConfig.active_region,
            DBInstanceClass: dbInstanceDetails.DBInstances[0].DBInstanceClass,
            DBSubnetGroupName: rdsConfig.failover_configurations.subnet_group_name,
            VpcSecurityGroupIds: rdsConfig.failover_configurations.security_group_ids
        };
        if (rdsConfig.failover_configurations.hasOwnProperty("kms_key_id") && rdsConfig.failover_configurations.kms_key_id != "")
            createReadReplicaParams['KmsKeyId'] = rdsConfig.failover_configurations.kms_key_id
        
        custom_logging(`Creating read-replica of ${ rdsConfig.active_configurations.identifier } in ${environmentConfig.failover_region}`);
        
        await createReadReplica(failoverRdsClient, createReadReplicaParams);
    }
}
