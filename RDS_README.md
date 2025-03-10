
# Usage Guide

This guide explains the flow of how to promote read-replica in failover region and how to revert back from failover region to active region .

## Requirements

1. Node.js
2. AWS crendetials

## Configuration JSON
The provided JSON configuration contains settings for managing various AWS resources. Here's what each section represents:


**force_delete_if_exists**: to automatically delete existing db instance present in the active region configure this to **true**, if it is in **false** the program will stop executing and will ask to delete it manually or run with **true**.

**identifier**: Name of the Db Instance/ Read-Replica.

**kms_key_id**: Id of the KMS, Remove or assign it "" if KMS is not being used .

**subnet_group_name**: Name of the subnet group present in the region.

**security_group_ids**: List of security group ids.

## FLOW OF THE SERVICE
### WHEN SWITCHING FROM ACTIVE TO FAILOVER

When switching to the failover region from the active region, make sure a read-replica already exists in the failover region,

When the command is executed, it checks for the identifier provided in the **failover_configuration** and promotes that identifier to **primary** instance

### WHEN SWITCHING FROM FAILOVER TO ACTIVE

When we return from failover to active region, the application checks if an rds with same name is already present in the active region or not, if it exists, it checks whether the **force_delete_if_exists** option is enabled or not.
In case it is enabled the application deletes the existing db instance and continues with the functionality, otherwise it stops and moves to the next db stating that `DB db-name already exists, Please delete it first`

When the already created db is deleted, a replica of db from failover is created into active region and then get promoted primary instance

When the db instance in active region is up and running and can be used, a prompt will be shown which will ask the user to change the connection string in the applications (if needed) and continue with deleting the db instance in failover region.

It is prompt, so we can skip it. If this step is not skipped, the application will delete the instance in failover region and create a new replica of the instance in failover region from instance in active region.


Note: 
- `-pce` and `-dr` doesn't currently support RDS - as its a complex mechanism (we can add it on request though)
- If a process is completed for one RDS and you want to skip it, remove it from the configuration.json file, otherwise it will start the process all over again for that RDS.

