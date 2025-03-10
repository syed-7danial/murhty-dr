
# Usage Guide

This guide explains how to use the provided JSON configuration to manage AWS resources.

## Requirements

1. Node.js
2. AWS crendetials

## Configuration JSON
The provided JSON configuration contains settings for managing various AWS resources. Here's what each section represents:

**switching_to**: Indicates the environment to switch to, either "ACTIVE" or "FAILOVER".

**active_region**: The AWS region for the active environment.

**failover_region**: The AWS region for the failover environment.

**cloudfront**: Configuration for CloudFront distributions and behaviors, Please make sure that first item in the array of behaviour should be the default behavior from cloudfront.

**active_lambdas**: Configuration for active environment Lambdas.

**failover_lambdas**: Configuration for failover environment Lambdas.

**type**: Type of Lambdas configuration, the valid values are "arn, prefix and all".

**vpn_endpoints**: Configuration for VPN endpoints.

## application arguments
1. `-dr` to run the application in dry run mode
2. `-pce` to make sure that current environment will also be processed i.e. PROD (the one that has gone down) by-default, it will not be processed.
3. `-a` to process all three resources i.e. lambda, cloudfront and endpoint
4. `-c` to process cloudfront only
5. `-l` to process lambda only
6. `-v` to process endpoint only
7. `-f` path to the json configuration

## How to

1. First goto application dir and run `npm install .`
It'll install all the required libraries in the application folder

2. To process all the components in dry run mode - `node main.js -dr -a -f configuration.json`