import * as path from 'path';

import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as sns from 'aws-cdk-lib/aws-sns'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import * as kinesis from 'aws-cdk-lib/aws-kinesis' 
import * as eventsources from 'aws-cdk-lib/aws-lambda-event-sources';

export class XrayEventsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const powerToolsLayerArn = `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPython:13`
    const powerToolsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "PowerToolsLayer", powerToolsLayerArn)

    // Resources
    const queue = new sqs.Queue(this, 'producer-queue');
    const stream = new kinesis.Stream(this, 'producer-stream', { streamName: 'producer-stream' });
    const topic = new sns.Topic(this, 'consumer-topic', { topicName: 'consumer-topic' });

    // Lambda functions
    const producer = this.createFunction('producer-function', 'functions/producer', [ powerToolsLayer ], 
      { 
        'POWERTOOLS_SERVICE_NAME': 'producer',
        'QUEUE_NAME': queue.queueName,
        'STREAM_NAME': stream.streamName
      });
    const consumerSqs = this.createFunction('consumer-sqs-function', 'functions/consumer-sqs', [ powerToolsLayer ], 
      { 
        'POWERTOOLS_SERVICE_NAME': 'consumer-sqs',
        'TOPIC_ARN': topic.topicArn
      });
    const consumerKinesis = this.createFunction('consumer-kinesis-function', 'functions/consumer-kinesis', [ powerToolsLayer ], 
      { 
        'POWERTOOLS_SERVICE_NAME': 'consumer-kinesis',
        'TOPIC_ARN': topic.topicArn
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
    return new lambda.Function(this, functionName, {
      functionName: functionName,
      runtime: lambda.Runtime.PYTHON_3_9,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', codeFolder)),
      layers: layers,
      tracing: lambda.Tracing.ACTIVE,
      environment: env
    });
  }
}
