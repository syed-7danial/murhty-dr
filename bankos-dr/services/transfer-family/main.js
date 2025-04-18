const AWS = require('aws-sdk');
require('aws-sdk/lib/maintenance_mode_message').suppress = true;
const forge = require('node-forge');
const fs = require('fs').promises;
const chalk = require('chalk');
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
    console.log(chalk.yellow( "Creating SSH KeyPair" ))
    try {
        const keyPair = forge.pki.rsa.generateKeyPair(2048);
        const privateKeyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
    
        const publicKeyPem = forge.pki.publicKeyToPem(keyPair.publicKey);
        const sshPublicKey = convertPemToSSH(publicKeyPem, username);

        console.log(chalk.green( "SSH KeyPair Created Successfully" ))
        return {privateKey: privateKeyPem, publicKey: sshPublicKey}   
    }
    catch(error) {
        console.error(chalk.red(  'Error reading file:', error ));
        throw error;   
    }
}

async function uploadKeysToS3(username, bucket, bucketPath, privateKey, publicKey) {
    fs.writeFile(`${username}-privateKey.pem`, privateKey);
    fs.writeFile(`${username}-publicKey.pub`, publicKey);
    console.log(chalk.yellow("uploading KeyPair to S3"))
    try {
        let formattedBucketPath = ""
        if (bucketPath)
            formattedBucketPath = `${bucketPath}/`
        
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
        console.log(chalk.green( "KeyPair uploaded to S3" ))
    }
    catch(error) {
        console.error(chalk.red(  'Error reading file:', error ));
        throw error;
    }
    fs.unlink(`${username}-privateKey.pem`, privateKey);
    fs.unlink(`${username}-publicKey.pub`, publicKey);
}

// Function to create an AWS Transfer Family user
async function createTransferUser(username, serverId, publicKey, role, bucket, bucketPath, restricted) {
    try {
        console.log(chalk.yellow( "Creating SFTP user" ))
        let formattedBucketPath = ""
        if (bucketPath)
            formattedBucketPath = `/${bucketPath}`

        let createUserParams = {
            Role: role,
            ServerId: serverId,
            UserName: username,
            SshPublicKeyBody: publicKey,
            HomeDirectoryType: restricted ? "LOGICAL" : "PATH",
        }
        if (restricted) {
            createUserParams['HomeDirectoryMappings'] =[{
                Entry: '/',  // Virtual root as seen by the user
                Target: `/${bucket}${formattedBucketPath}`  // Actual S3 path
            }]
        }
        else
            createUserParams['HomeDirectory'] = `/${bucket}${formattedBucketPath}`
        console.log(chalk.green( "SFTP user created successfully" ))
        return transfer.createUser(createUserParams).promise();
    }
    catch(error) {
        console.error(chalk.red(  'Error reading file:', error ));
        throw error;
    }
}

const readFileAsync = async (filePath) => {
    try {
        console.log(chalk.yellow( "Reading configuration file" ))
        return await fs.readFile(filePath, 'utf8');
    } 
    catch (error) {
        console.error(chalk.red(  'Error reading file:', error ));
        throw error;
    }
  };

const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-f, --file <file>', "File to read")
    .parse(process.argv);

    const options = program.opts();
    if (!options.file)
    {
        custom_logging(chalk.red("Configuration file is missing"))
        return;
    }

    const filePath = options.file;

    const fileData = await readFileAsync(filePath);
    const envData = JSON.parse(fileData);
    const { privateKey, publicKey } = generateSSHKeyPair(envData.username);
    await uploadKeysToS3(envData.userName, envData.userKeyBucket, envData.userKeyBucketPath, privateKey, publicKey);
    await createTransferUser(envData.userName, envData.serverId, publicKey, envData.iamRole, envData.userBucket, envData.userBucketPath, envData.restricted);
    
    console.log('User created:', envData.userName);
};

mainFunction()
  .then(() => {
    console.log("Process completed");
  })
  .catch((error) => {
    console.error('Error:', error);
  });
