import os, json, uuid
import boto3
from aws_lambda_powertools import Logger, Tracer

tracer = Tracer() 
logger = Logger()

QUEUE_NAME = os.environ["QUEUE_NAME"]
STREAM_NAME = os.environ["STREAM_NAME"]

sqs = boto3.resource('sqs')
queue = sqs.get_queue_by_name(QueueName=QUEUE_NAME)
kinesis = boto3.client('kinesis')

def enable_lambda_xray_segments(func):
    def wrapper(*args, **kwargs):
        from aws_xray_sdk.core.context import Context
        recorder = tracer.provider

        current_context = recorder.context
        if current_context:
            # replace lambda context with "normal" X-Ray context that supports new segments
            recorder.context = Context()
        try:
            func(*args, **kwargs)
        finally:
            # restore original Lambda context
            if current_context:
                recorder.context = current_context

    return wrapper

@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler
@enable_lambda_xray_segments
def handler(event, context):
    recorder = tracer.provider

    with recorder.in_segment('producing_messages'):
        data = str(uuid.uuid4())
        message = create_message(data)

        with recorder.in_subsegment('producing_sqs'):
            queue.send_message(
                MessageBody=message
            )
        with recorder.in_subsegment('producing_kinesis'):
            kinesis.put_record(
                StreamName=STREAM_NAME,
                Data=message,
                PartitionKey='string'
            )

def create_message(data):
    recorder = tracer.provider
    segment = recorder.context.get_trace_entity()

    return json.dumps({
        # payload to support tracing context propagation
        'traceId': segment.trace_id,
        'segmentId': segment.id or segment.parent_segment.id,
        # main payload of the message
        'data': data
    })