const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const forge = require('node-forge');
const fs = require('fs').promises;
const chalk = require('chalk');
const path = require('path');
const { program } = require('commander');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  region: 'us-east-1',
  maxRetries: 5, // Maximum number of retries
  retryDelayOptions: { 
      base: 200 // Base delay in milliseconds
  }
})
const s3 = new AWS.S3();
const transfer = new AWS.Transfer();

function convertPemToSSH(pem, username) {
    const forgePublicKey = forge.pki.publicKeyFromPem(pem);
    const sshBuffer = forge.ssh.publicKeyToOpenSSH(forgePublicKey, username);
    return sshBuffer.toString();
}

function generateSSHKeyPair(username) {
    console.log(chalk.yellow(`Creating SSH KeyPair for ${username}`));
    try {
        const keyPair = forge.pki.rsa.generateKeyPair(2048);
        const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
    
        const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
        const sshPublicKey = convertPemToSSH(publicKeyPem, username);

        console.log(chalk.green(`SSH KeyPair Created Successfully for ${username}`));
        return {privateKey: privateKeyPem, publicKey: sshPublicKey};   
    }
    catch(error) {
        console.error(chalk.red('Error generating SSH key pair:', error));
        throw error;   
    }
}

async function uploadKeysToS3(username, bucket, bucketPath, privateKey, publicKey) {
    await fs.writeFile(`${username}-privateKey.pem`, privateKey);
    await fs.writeFile(`${username}-publicKey.pub`, publicKey);
    console.log(chalk.yellow(`Uploading KeyPair to S3 for ${username}`));
    try {
        let formattedBucketPath = "";
        if (bucketPath)
            formattedBucketPath = `${bucketPath}/`;
        
        await s3.putObject({
            Bucket: bucket,
            Key: `${formattedBucketPath}${username}/privateKey.pem`,
            Body: privateKey,
            ContentType: 'application/x-pem-file'
        }).promise();
        await s3.putObject({
            Bucket: bucket,
            Key: `${formattedBucketPath}${username}/publicKey.pem`,
            Body: publicKey,
            ContentType: 'application/x-pem-file'
        }).promise();
        console.log(chalk.green(`KeyPair uploaded to S3 for ${username}`));
    }
    catch(error) {
        console.error(chalk.red('Error uploading keys to S3:', error));
        throw error;
    }
    await fs.unlink(`${username}-privateKey.pem`);
    await fs.unlink(`${username}-publicKey.pub`);
}

// Function to create an AWS Transfer Family user
async function createTransferUser(username, serverId, publicKey, role, bucket, bucketPath, restricted) {
    try {
        console.log(chalk.yellow(`Creating SFTP user ${username}`));
        let formattedBucketPath = "";
        if (bucketPath)
            formattedBucketPath = `/${bucketPath}`;

        let createUserParams = {
            Role: role,
            ServerId: serverId,
            UserName: username,
            SshPublicKeyBody: publicKey,
            HomeDirectoryType: restricted ? "LOGICAL" : "PATH",
        }
        if (restricted) {
            createUserParams['HomeDirectoryMappings'] = [{
                Entry: '/',  // Virtual root as seen by the user
                Target: `/${bucket}${formattedBucketPath}`  // Actual S3 path
            }];
        }
        else
            createUserParams['HomeDirectory'] = `/${bucket}${formattedBucketPath}`;
        
        const result = await transfer.createUser(createUserParams).promise();
        console.log(chalk.green(`SFTP user ${username} created successfully`));
        return result;
    }
    catch(error) {
        console.error(chalk.red(`Error creating transfer user ${username}:`, error));
        throw error;
    }
}

const readFileAsync = async (filePath) => {
    try {
        console.log(chalk.yellow(`Reading configuration file: ${filePath}`));
        return await fs.readFile(filePath, 'utf8');
    } 
    catch (error) {
        console.error(chalk.red(`Error reading file ${filePath}:`, error));
        throw error;
    }
};

async function processUser(userConfig) {
    try {
        const username = userConfig.userName;
        console.log(chalk.blue(`\n===== Processing user: ${username} =====`));
        
        const { privateKey, publicKey } = generateSSHKeyPair(username);
        await uploadKeysToS3(
            username, 
            userConfig.userKeyBucket, 
            userConfig.userKeyBucketPath, 
            privateKey, 
            publicKey
        );
        
        await createTransferUser(
            username,
            userConfig.serverId,
            publicKey,
            userConfig.iamRole,
            userConfig.userBucket,
            userConfig.userBucketPath,
            userConfig.restricted
        );
        
        console.log(chalk.green(`User created successfully: ${username}`));
        return username;
    } catch (error) {
        console.error(chalk.red(`Failed to process user ${userConfig.userName}:`, error));
        throw error;
    }
}

const mainFunction = async () => {
    program
        .version('0.0.1')
        .option('-dr, --dry-run', "Dry run - no actual changes will be made")
        .parse(process.argv);

    const options = program.opts();
    
    if (!process.env.CLIENT_NAME) {
        console.error(chalk.red("CLIENT_NAME environment variable not set"));
        process.exit(1);
    }
    
    // Use client-specific configuration file based on CLIENT_NAME environment variable
    const configFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'transfer-family', 'configuration.json');
    
    console.log(chalk.blue(`Using configuration file for client ${process.env.CLIENT_NAME}: ${configFile}`));
    
    try {
        await fs.access(configFile);
    } catch (error) {
        console.log(chalk.yellow(`Configuration file does not exist for client ${process.env.CLIENT_NAME}: ${configFile}`));
        console.log(chalk.yellow(`Skipping client ${process.env.CLIENT_NAME}`));
        return { skipped: true, reason: 'Configuration file not found' };
    }

    const fileData = await readFileAsync(configFile);
    
    let configs;
    try {
        configs = JSON.parse(fileData);
    } catch (error) {
        console.error(chalk.red("Error parsing JSON configuration:", error));
        process.exit(1);
    }
    
    // Handle both array and single object formats
    const userConfigs = Array.isArray(configs) ? configs : [configs];
    
    console.log(chalk.blue(`Found ${userConfigs.length} user(s) to process for client: ${process.env.CLIENT_NAME}`));
    
    if (options.dryRun) {
        console.log(chalk.yellow("DRY RUN MODE - No changes will be made"));
        console.log(chalk.yellow("Users that would be processed:"));
        userConfigs.forEach(config => {
            console.log(chalk.yellow(`- ${config.userName}`));
        });
        return { dryRun: true, usersToProcess: userConfigs.map(config => config.userName) };
    }
    
    const results = [];
    for (const userConfig of userConfigs) {
        try {
            const username = await processUser(userConfig);
            results.push({ username, status: 'success' });
        } catch (error) {
            results.push({ username: userConfig.userName, status: 'failed', error: error.message });
        }
    }
    
    // Summary
    console.log(chalk.blue("\n===== Processing Summary ====="));
    results.forEach(result => {
        if (result.status === 'success') {
            console.log(chalk.green(`✓ ${result.username}: Successfully created`));
        } else {
            console.log(chalk.red(`✗ ${result.username}: Failed - ${result.error}`));
        }
    });
    
    return results;
};

mainFunction()
    .then((results) => {
        if (results.skipped) {
            console.log(chalk.yellow(`\nSkipped client ${process.env.CLIENT_NAME}: ${results.reason}`));
            return;
        }
        
        if (results.dryRun) {
            console.log(chalk.blue("\nDry run completed"));
            console.log(chalk.yellow(`Would have processed ${results.usersToProcess.length} user(s)`));
            return;
        }
        
        console.log(chalk.blue("\nProcess completed"));
        
        const successful = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'failed').length;
        
        console.log(chalk.green(`Successfully created: ${successful} user(s)`));
        if (failed > 0) {
            console.log(chalk.red(`Failed to create: ${failed} user(s)`));
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error(chalk.red('Error in main process:', error));
        process.exit(1);
    });