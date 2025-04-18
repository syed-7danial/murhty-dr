# AWS Transfer Family User Automation

This script automates the creation of SSH key pairs and AWS Transfer Family (SFTP) users, and uploads the keys to S3.

## 📦 Features

- Generates SSH key pairs for users
- Uploads keys to S3 in a specified path
- Creates AWS Transfer Family users with:
  - IAM role association
  - Optional restricted S3 bucket access using logical directories