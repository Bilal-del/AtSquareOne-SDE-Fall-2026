import os
from urllib.parse import quote

import boto3
from botocore.config import Config


class DocumentStorageError(Exception):
    pass


def _client():
    region = os.environ.get('AWS_REGION', 'us-east-2').strip() or 'us-east-2'
    return boto3.client(
        's3',
        region_name=region,
        endpoint_url=f'https://s3.{region}.amazonaws.com',
        config=Config(
            signature_version='s3v4',
            s3={'addressing_style': 'virtual'},
        ),
    )


def _bucket():
    bucket = os.environ.get('AWS_DOCUMENT_BUCKET', '').strip()
    if not bucket:
        raise DocumentStorageError('Document storage is not configured.')
    return bucket


def upload_document(file_object, object_key, content_type):
    try:
        _client().upload_fileobj(
            file_object,
            _bucket(),
            object_key,
            ExtraArgs={
                'ContentType': content_type,
                'ServerSideEncryption': 'AES256',
            },
        )
    except DocumentStorageError:
        raise
    except Exception as exc:
        raise DocumentStorageError('The document could not be stored.') from exc


def delete_document(object_key):
    try:
        _client().delete_object(Bucket=_bucket(), Key=object_key)
    except DocumentStorageError:
        raise
    except Exception as exc:
        raise DocumentStorageError('The stored document could not be deleted.') from exc


def create_download_url(object_key, filename, content_type, disposition):
    try:
        return _client().generate_presigned_url(
            'get_object',
            Params={
                'Bucket': _bucket(),
                'Key': object_key,
                'ResponseContentType': content_type,
                'ResponseContentDisposition': (
                    f"{disposition}; filename*=UTF-8''{quote(filename)}"
                ),
            },
            ExpiresIn=300,
        )
    except DocumentStorageError:
        raise
    except Exception as exc:
        raise DocumentStorageError('A secure document link could not be created.') from exc
