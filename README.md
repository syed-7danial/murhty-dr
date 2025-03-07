  


# VPN Jenkins Job Pipeline
This Jenkins pipeline is designed to configure and manage VPN settings for various environments. Below are the steps to execute the pipeline, along with a description of the required parameters.

## Pipeline Parameters
### SWITCHING_TO:
Select the target environment to switch to. Options include:ACTIVE, FAILOVER

### VPN_CONFIGURATION_ID:
Select the VPN Configuration ID. 

### IP_RANGE:
Specify the IP range for the VPN configuration. 

### BANK_LIST:
Enter a comma-separated list of banks that should be included in this VPN configuration.

This list is used to specify all the ips of the bank
for example if ABANK is selected then all the ips present in the IP_RANGE will be selected

### AWS_ACCESS_KEY_ID:
Enter the AWS Access Key ID for authentication. This field is concealed for security.

### AWS_SECRET_ACCESS_KEY:
Enter the AWS Secret Access Key for authentication. This field is concealed for security.

### AWS_SESSION_TOKEN:
Enter the AWS Session Token for authentication. This field is concealed for security.

### DRY_RUN:
Check this option to run the pipeline in dry run mode. This mode simulates the pipeline's operations without making any actual changes.

### PROCESS_CURRENT_ENV:
Check this option to process the current environment's configuration as part of the pipeline execution.

# PRIORITY
BANK_LIST has the highest priority, If bank list is selected it will take effect instead of IP_RANGE



# RDS Jenkins Job Pipeline
This Jenkins pipeline is designed to manage RDS settings for various environments. Below are the steps to execute the pipeline, along with a description of the required parameters.

## Pipeline Parameters
### SWITCHING_TO:
Select the target environment to switch to. Options include: ACTIVE, FAILOVER

### BANK_ID:
Select the Bank ID that this RDS configuration will apply to. 

### AWS_ACCESS_KEY_ID:
Enter the AWS Access Key ID for authentication. This field is concealed for security.

### AWS_SECRET_ACCESS_KEY:
Enter the AWS Secret Access Key for authentication. This field is concealed for security.

### AWS_SESSION_TOKEN:
Enter the AWS Session Token for authentication. This field is concealed for security.

### FORCE_DELETE:
Check this option to enable the force_delete parameter, which will force the deletion of certain resources as part of the pipeline execution.

### DRY_RUN:
Check this option to run the pipeline in dry run mode. This mode simulates the pipeline's operations without making any actual changes.

### PROCESS_CURRENT_ENV:
Check this option to process the current environment's configuration as part of the pipeline execution.


# Instance Jenkins Job Pipeline
This Jenkins pipeline is designed to manage EC2 instances, including switching environments, managing active and failover instances, and other related operations. Below are the steps to execute the pipeline, along with a description of the required parameters.

## Pipeline Parameters
### SWITCHING_TO:
Select the target environment to switch to. Options include: ACTIVE, FAILOVER

### ACTIVE_INSTANCE_ID:
Specify a single EC2 Instance ID to act upon, or select ALL to apply the action to all instances in the list . This parameter allows you to focus on a specific instance or perform bulk operations across multiple instances.

### FAILOVER_INSTANCE_ID:
Specify a single EC2 Instance ID to act upon in case of a failover, or select ALL to apply the action to all instances in the list.

### AWS_ACCESS_KEY_ID:
Enter the AWS Access Key ID for authentication. This field is concealed for security.

### AWS_SECRET_ACCESS_KEY:
Enter the AWS Secret Access Key for authentication. This field is concealed for security.

### AWS_SESSION_TOKEN:
Enter the AWS Session Token for authentication. This field is concealed for security.


# CloudWatch Jenkins Job Pipeline
This Jenkins pipeline is designed to manage CloudWatch monitoring for AWS Lambda functions, including switching environments and managing active and failover Lambdas. Below are the steps to execute the pipeline, along with a description of the required parameters.

## Pipeline Parameters
### SWITCHING_TO:
Select the target environment to switch to. Options include: ACTIVE, FAILOVER

### ACTIVE_LAMBDA_ARNS:
Specify the ARN(s) of the active Lambda functions to act upon, or select ALL to apply the action to all Lambdas in the dropdown list of active environment. This parameter allows you to focus on specific Lambdas or perform bulk operations.

### FAILOVER_LAMBDA_ARNS:
Specify the ARN(s) of the failover Lambda functions to act upon, or select ALL to apply the action to all Lambdas in the dropdown list of  failover environment.

### ACTIVE_LAMBDA_PREFIX:
Specify multiple CloudFront Distribution IDs, comma-separated, that are associated with the active Lambdas. This overrides the ACTIVE_LAMBDA_ARNS choice.

### FAILOVER_LAMBDA_PREFIX:
Specify multiple CloudFront Distribution IDs, comma-separated, that are associated with the failover Lambdas. This overrides the FAILOVER_LAMBDA_ARNS choice.

### RUN_ON_ALL_ACTIVE_LAMBDAS:
Check this box to run the pipeline on all Lambdas in  active environment, overriding specific ARN or prefix choices.

### RUN_ON_ALL_FAILOVER_LAMBDAS:
Check this box to run the pipeline on all Lambdas in the failover environment, overriding specific ARN or prefix choices.

### AWS_ACCESS_KEY_ID:
Enter the AWS Access Key ID for authentication. This field is concealed for security.

### AWS_SECRET_ACCESS_KEY:
Enter the AWS Secret Access Key for authentication. This field is concealed for security.

### AWS_SESSION_TOKEN:
Enter the AWS Session Token for authentication. This field is concealed for security.

### DRY_RUN:
Check this option to run the pipeline in dry run mode. This mode simulates the pipeline's operations without making any actual changes.

### PROCESS_CURRENT_ENV:
Check this option to process the current environment's configuration as part of the pipeline execution.


# CloudFront Jenkins Job Pipeline
This Jenkins pipeline is designed to manage CloudFront distributions, including switching environments and managing specific CloudFront IDs. Below are the steps to execute the pipeline, along with a description of the required parameters.

## Pipeline Parameters
SWITCHING_TO:
Select the target environment to switch to. Options include: ACTIVE, FAILOVER

### CLOUDFRONT_ID:
Select the CloudFront Distribution ID to act upon, or select ALL to apply the action to all CloudFront distributions in the dropdown list. This parameter allows you to focus on specific distributions or perform bulk operations.

### SPECIFIED_CLOUDFRONT_IDS:
Specify multiple CloudFront Distribution IDs, comma-separated, that you want to act upon. This overrides the CLOUDFRONT_ID choice, allowing you to target specific distributions even if ALL was selected above.

###  AWS_ACCESS_KEY_ID:
Enter the AWS Access Key ID for authentication. This field is concealed for security.

### AWS_SECRET_ACCESS_KEY:
Enter the AWS Secret Access Key for authentication. This field is concealed for security.

### AWS_SESSION_TOKEN:
Enter the AWS Session Token for authentication. This field is concealed for security.

### DRY_RUN:
Check this option to run the pipeline in dry run mode. This mode simulates the pipeline's operations without making any actual changes.

### PROCESS_CURRENT_ENV:
Check this option to process the current environment's configuration as part of the pipeline execution.

# NOTE
The instance which jenkins is running on must have GIT and NODEJS 20.x installed on it
