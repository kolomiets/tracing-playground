import base64, json, os
import boto3
from opentelemetry import trace
from opentelemetry.trace import NonRecordingSpan, SpanContext, SpanKind, TraceFlags, Link

## Configures the Global Tracer Provider
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.resources import Resource, SERVICE_NAME
from opentelemetry.sdk.extension.aws.trace import AwsXRayIdGenerator
from opentelemetry.sdk.extension.aws.resource import AwsLambdaResourceDetector
trace.set_tracer_provider(TracerProvider(
    id_generator=AwsXRayIdGenerator(), 
    resource=Resource.create({ SERVICE_NAME: "consumer-kinesis-function" }).merge(AwsLambdaResourceDetector().detect())
))
## Export traces to ADOT collector (to support X-Ray)
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
## Instrument
from opentelemetry.instrumentation.botocore import BotocoreInstrumentor
from opentelemetry.instrumentation.logging import LoggingInstrumentor
BotocoreInstrumentor().instrument()
LoggingInstrumentor().instrument()

tracer = trace.get_tracer(__name__)

## AWS clients
TOPIC_ARN = os.environ["TOPIC_ARN"]
sns = boto3.client('sns')

def handler(event, context):
    try:
        lambda_context = trace.get_current_span().get_span_context()

        for record in event["Records"]:
            body = json.loads(base64.b64decode(record["kinesis"]["data"]))
            ctx = get_parent_context(body["traceId"], body["spanId"])

            with tracer.start_as_current_span('consuming_kinesis', context=ctx, kind=SpanKind.SERVER, links=[Link(lambda_context)]):
                sns.publish(
                    TargetArn=TOPIC_ARN,
                    Message=f"Data {body['data']} consumed from Kinesis stream"
                )
    finally:
        # This is necessary to send traces to the ADOT collector
        trace.get_tracer_provider().force_flush()

def get_parent_context(trace_id, span_id):
    # Parent Span Context
    parent_context = SpanContext(
        trace_id=trace_id,
        span_id=span_id,
        is_remote=True,
        trace_flags=TraceFlags(0x01)
    )
    return trace.set_span_in_context(NonRecordingSpan(parent_context))