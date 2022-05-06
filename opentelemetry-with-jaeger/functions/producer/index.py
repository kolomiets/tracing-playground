import os, json, uuid, logging
import boto3
from opentelemetry import trace

# Telemetry
tracer = trace.get_tracer(__name__)

## AWS clients
QUEUE_NAME = os.environ["QUEUE_NAME"]
STREAM_NAME = os.environ["STREAM_NAME"]

sqs = boto3.resource('sqs')
queue = sqs.get_queue_by_name(QueueName=QUEUE_NAME)
kinesis = boto3.client('kinesis')

def handler(event, context):
    logging.info('started')  

    with tracer.start_as_current_span('producing_messages') as span:
        data = str(uuid.uuid4())
        message = create_message(data)

        span.add_event("important-event")

        with tracer.start_as_current_span('producing_sqs'):
            queue.send_message(
                MessageBody=message
            )
        with tracer.start_as_current_span('producing_kinesis'):
            kinesis.put_record(
                StreamName=STREAM_NAME,
                Data=message,
                PartitionKey='string'
            )

def create_message(data):
    context = trace.get_current_span().get_span_context()

    return json.dumps({
        # payload to support trace context propagation
        'traceId': context.trace_id,
        'spanId': context.span_id,
        # main payload of the message
        'data': data
    })
  