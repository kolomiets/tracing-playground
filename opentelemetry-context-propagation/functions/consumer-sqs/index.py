import json, os
import boto3
from opentelemetry import trace
from opentelemetry.trace import NonRecordingSpan, SpanContext, SpanKind, TraceFlags, Link

# Telemetry
tracer = trace.get_tracer(__name__)

## AWS clients
TOPIC_ARN = os.environ["TOPIC_ARN"]
sns = boto3.client('sns')

def handler(event, context):
    lambda_context = trace.get_current_span().get_span_context()

    for record in event["Records"]:
        body = json.loads(record["body"])
        ctx = get_parent_context(body["traceId"], body["spanId"])

        with tracer.start_as_current_span('consuming_sqs', context=ctx, kind=SpanKind.SERVER, links=[Link(lambda_context)]):            
            sns.publish(
                TargetArn=TOPIC_ARN,
                Message=f"Data {body['data']} consumed from SQS queue"
            )

def get_parent_context(trace_id, span_id):
    # Parent Span Context
    parent_context = SpanContext(
        trace_id=trace_id,
        span_id=span_id,
        is_remote=True,
        trace_flags=TraceFlags(0x01)
    )
    return trace.set_span_in_context(NonRecordingSpan(parent_context))