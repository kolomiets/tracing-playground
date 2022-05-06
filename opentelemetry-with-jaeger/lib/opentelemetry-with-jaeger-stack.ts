import * as path from 'path';

import { Stack, StackProps, Duration, CfnParameter } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaPython from '@aws-cdk/aws-lambda-python-alpha';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as kinesis from 'aws-cdk-lib/aws-kinesis' 
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class OpenTelemetryWithJaegerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Required context properties
    const collectorHost = this.node.tryGetContext("CollectorHost");
    const vpcId = this.node.tryGetContext("VPCID");

    // Layers
    const adotLayerArn = `arn:aws:lambda:${this.region}:901920570463:layer:aws-otel-python38-amd64-ver-1-9-1:2`
    const adotLayer = lambda.LayerVersion.fromLayerVersionArn(this, "adot-layer", adotLayerArn)
    const dependenciesLayer = new lambdaPython.PythonLayerVersion(this, 'common-dependencies', {
      layerVersionName: "common-dependencies",
      entry: path.join(__dirname, '..', "functions/common-dependencies"),
      compatibleRuntimes: [ lambda.Runtime.PYTHON_3_8 ]
    })

    // Resources
    const queue = new sqs.Queue(this, 'producer-queue');
    const stream = new kinesis.Stream(this, 'producer-stream', { streamName: 'producer-stream' });
    const topic = new sns.Topic(this, 'consumer-topic', { topicName: 'consumer-topic' });

    // OpenTelemetry configuration
    const vpc = ec2.Vpc.fromLookup(this, 'main-vpc', {
      isDefault: false,
      vpcId: vpcId
    })
    const securityGroup = new ec2.SecurityGroup(this, 'main-sg', {
      vpc,
      allowAllOutbound: true
    });
    const otelConfig = {
      OTEL_PYTHON_LOG_CORRELATION: "true",
      JAEGER_OTLP_ENDPOINT: `${collectorHost}:4317`, // we connect to OTLP endpoint here
      OPENTELEMETRY_COLLECTOR_CONFIG_FILE: "/var/task/otel.conf"
    }
    
    // Lambda functions
    const producer = this.createFunction("producer-function", 'functions/producer', [ adotLayer, dependenciesLayer ], vpc, securityGroup, {
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-instrument",
      QUEUE_NAME: queue.queueName,
      STREAM_NAME: stream.streamName,      
      ...otelConfig
    });

    const consumerSqs = this.createFunction("consumer-sqs-function", 'functions/consumer-sqs', [ adotLayer, dependenciesLayer ], vpc, securityGroup, {
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-instrument",
      TOPIC_ARN: topic.topicArn,
      ...otelConfig
    });

    const consumerKinesis = this.createFunction("consumer-kinesis-function", 'functions/consumer-kinesis', [ adotLayer, dependenciesLayer ], vpc, securityGroup, {
      // NOTE: we do not define AWS_LAMBDA_EXEC_WRAPPER variable here as we configure OpenTelemetry manually
      TOPIC_ARN: topic.topicArn,
      ...otelConfig
    });

    // Event sources
    consumerSqs.addEventSource(new eventsources.SqsEventSource(queue, {
      maxBatchingWindow: Duration.seconds(10)
    }));
    consumerKinesis.addEventSource(new eventsources.KinesisEventSource(stream, { 
      startingPosition: lambda.StartingPosition.TRIM_HORIZON
    }));

    // Permissions
    queue.grantSendMessages(producer)
    queue.grantConsumeMessages(consumerSqs)
    stream.grantWrite(producer)
    stream.grantRead(consumerKinesis)
    topic.grantPublish(consumerSqs)
    topic.grantPublish(consumerKinesis)
  }

  private createFunction(functionName: string, codeFolder: string, layers: lambda.ILayerVersion[], vpc: ec2.IVpc, sg: ec2.ISecurityGroup, env: { [key: string]: string }): lambda.Function {    
    return new lambdaPython.PythonFunction(this, functionName, {
      functionName: functionName,
      entry: path.join(__dirname, '..', codeFolder),
      runtime: lambda.Runtime.PYTHON_3_8, 
      index: 'index.py',
      handler: 'handler',    
      layers: layers,
      environment: env,
      tracing: lambda.Tracing.ACTIVE,
      
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_NAT
      },
      securityGroups: [ sg ]
    });    
  }
}
