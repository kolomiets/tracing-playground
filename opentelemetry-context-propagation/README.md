# Trace context propagation with AWS X-Ray and Lambda

This is a sample project for [TBD]() article.

## Deployment
This project relies on [AWS Cloud Development Kit](https://aws.amazon.com/cdk/). See [Getting started with the AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) for installation instructions.

Run the following commands to deploy the project in your AWS account:

* `npm install` - install all npm dependencies
* `cdk deploy` - deploy this stack to your default AWS account/region

## Running the test
Go to AWS Lambda console and locate `producer-function`. Go to the `Test` tab and hit `Test` button (use any payload, it is not used):

![image](https://user-images.githubusercontent.com/270567/158897130-c57ad361-817f-473c-be99-ba60a7ed0384.png)

## Accessing the traces
Go to AWS CloudWatch console and switch to X-Ray traces -> Service map. Drill down to the traces.

![image](https://user-images.githubusercontent.com/270567/158897349-8de399a0-e468-45ef-ba95-ecb444b17471.png)
