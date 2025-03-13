# EventBridge Rule Switcher (Jenkins Pipeline)

This project automates enabling and disabling AWS EventBridge rules across regions using a Jenkins pipeline.

## **How It Works**
1. **Jenkins triggers the pipeline**, setting required environment variables (`SWITCHING_TO`, etc.).
2. The script **reads the configuration file** (`configuration.json`) to determine:
   - The **target region** (where rules should be enabled).
   - The **current region** (where rules may be disabled).
3. The script **lists all EventBridge event buses** in the target region.
4. It **enables** all rules in the target region.
5. If `--processCurrentEnvironment` is enabled, it **disables** rules in the current region.
6. **AWS-managed rules are skipped** to prevent errors.
7. Logs are generated and displayed in Jenkins.
8. The pipeline completes with a **success/failure status**.