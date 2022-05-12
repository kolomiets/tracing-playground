# Trace context propagation with AWS Distro for OpenTelemetry and Jaeger

This is a sample project for [Using AWS Distro for OpenTelemetry with Jaeger](https://betterprogramming.pub/using-aws-distro-for-opentelemetry-with-jaeger-acf4df3a8e37?source=friends_link&sk=5c27f1cb04622e8644377b12779dd232) article.

## Deployment
This project relies on [AWS Cloud Development Kit](https://aws.amazon.com/cdk/). See [Getting started with the AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/getting_started.html) for installation instructions.

Run the following commands to deploy the project in your AWS account:

* `npm install` - install all npm dependencies
* `cdk deploy -c VPCID={VPC_ID} -c CollectorHost={OPEN_TELEMETRY_COLLECTOR_HOST_NAME}` - deploy this stack to your default AWS account/region

If you deployed Jaeger with [Jaeger Quick Start](https://github.com/kolomiets/quickstart-jaeger), you can use the values from 
the following SSM parameters for `{OPEN_TELEMETRY_COLLECTOR_HOST_NAME}` and `{VPC_ID}` tokens:

 - `/quickstart/jaeger/{your-Jaeger-env-name}/vpc/id`
 - `/quickstart/jaeger/{your-Jaeger-env-name}/load-balancer/domain`

## Running the test
Go to AWS Lambda console and locate `producer-function`. Go to the `Test` tab and hit `Test` button (use any payload, it is not used):

![image](https://user-images.githubusercontent.com/270567/158897130-c57ad361-817f-473c-be99-ba60a7ed0384.png)

## Accessing the traces
Go to AWS CloudWatch console and switch to X-Ray traces -> Service map. Drill down to the traces.

![image](https://user-images.githubusercontent.com/270567/158897349-8de399a0-e468-45ef-ba95-ecb444b17471.png)
