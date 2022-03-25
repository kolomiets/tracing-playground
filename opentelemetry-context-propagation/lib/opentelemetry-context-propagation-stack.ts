import * as path from 'path';

import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaPython from '@aws-cdk/aws-lambda-python-alpha';
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as kinesis from 'aws-cdk-lib/aws-kinesis' 
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class OpentelemetryContextPropagationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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
    
    // Lambda functions
    const producer = this.createFunction("producer-function", 'functions/producer', [ adotLayer, dependenciesLayer ], {
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-instrument",
      OTEL_PYTHON_LOG_CORRELATION: "true",
      QUEUE_NAME: queue.queueName,
      STREAM_NAME: stream.streamName
    });

    const consumerSqs = this.createFunction("consumer-sqs-function", 'functions/consumer-sqs', [ adotLayer, dependenciesLayer ], {
      AWS_LAMBDA_EXEC_WRAPPER: "/opt/otel-instrument",
      OTEL_PYTHON_LOG_CORRELATION: "true",
      TOPIC_ARN: topic.topicArn
    });

    const consumerKinesis = this.createFunction("consumer-kinesis-function", 'functions/consumer-kinesis', [ adotLayer, dependenciesLayer ], {
      OTEL_PYTHON_LOG_CORRELATION: "true",
      //OTEL_TRACES_EXPORTER: "otlp_proto_http",
      TOPIC_ARN: topic.topicArn
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

  private createFunction(functionName: string, codeFolder: string, layers: lambda.ILayerVersion[], env: { [key: string]: string }): lambda.Function {
    return new lambdaPython.PythonFunction(this, functionName, {
      functionName: functionName,
      entry: path.join(__dirname, '..', codeFolder),
      runtime: lambda.Runtime.PYTHON_3_8, 
      index: 'index.py',
      handler: 'handler',    
      layers: layers,
      environment: env,
      tracing: lambda.Tracing.ACTIVE
    });    
  }
}
