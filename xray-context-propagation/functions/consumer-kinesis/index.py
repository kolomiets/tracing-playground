import base64, json, os
import boto3
from aws_lambda_powertools import Logger, Tracer

tracer = Tracer() 
logger = Logger()

TOPIC_ARN = os.environ["TOPIC_ARN"]

sns = boto3.client('sns')

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
            if current_context:
                recorder.context = current_context

    return wrapper

@logger.inject_lambda_context(log_event=True)
@tracer.capture_lambda_handler
@enable_lambda_xray_segments
def handler(event, context):
    recorder = tracer.provider

    for record in event["Records"]:
        body = json.loads(base64.b64decode(record["kinesis"]["data"]))
        with recorder.in_segment('consuming_kinesis', traceid=body["traceId"], parent_id=body["segmentId"]):
            sns.publish(
                TargetArn=TOPIC_ARN,
                Message=f"Data {body['data']} consumed from Kinesis stream"
            )