# S3 Event Notification Copy Script

## Overview  
This script automates copying S3 event notifications from a source bucket to a target bucket across AWS regions during a failover process. It is executed as part of a Jenkins pipeline.  

## How It Works  
1. **Jenkins triggers the script** as part of the failover process.  
2. It reads the S3 configuration from `configuration.json`.  
3. It determines the **source and target regions** based on the failover state.  
4. It **fetches event notifications** from the source bucket.  
5. It **updates ARNs** to match the target region.  
6. It applies the updated notification configuration to the target bucket.  
7. If `PROCESS_CURRENT_ENV=true`, it **removes event notifications** from the old active environment.  

## Running in Jenkins  
- The script is executed using **Node.js** in a Jenkins pipeline.  
- It relies on AWS credentials provided via **environment variables**:  
  - `AWS_ACCESS_KEY_ID`  
  - `AWS_SECRET_ACCESS_KEY`  
  - `AWS_SESSION_TOKEN`  
- The pipeline sets:  
  - `SWITCHING_TO` (`ACTIVE` or `FAILOVER`)  
  - `PROCESS_CURRENT_ENV` (`true` or `false`)  

## Logs & Debugging  
- If `--dryRun` is enabled, it **logs the notification configuration** instead of modifying AWS.