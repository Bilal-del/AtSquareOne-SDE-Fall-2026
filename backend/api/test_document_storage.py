import os
from urllib.parse import parse_qs, unquote, urlparse
from unittest.mock import patch

from django.test import SimpleTestCase

from .document_storage import create_download_url


class DocumentPresignedURLTests(SimpleTestCase):
    @patch.dict(os.environ, {
        'AWS_REGION': 'us-east-2',
        'AWS_DOCUMENT_BUCKET': 'squareone-documents-2026-ev-7k92m4',
        'AWS_ACCESS_KEY_ID': 'test-access-key',
        'AWS_SECRET_ACCESS_KEY': 'test-secret-key',
    })
    def test_presigned_url_uses_regional_virtual_host_and_sigv4(self):
        url = create_download_url(
            'users/1/test.pdf',
            'test.pdf',
            'application/pdf',
            'inline',
        )

        parsed = urlparse(url)
        query = parse_qs(parsed.query)
        credential = unquote(query['X-Amz-Credential'][0])

        self.assertEqual(
            parsed.hostname,
            'squareone-documents-2026-ev-7k92m4.s3.us-east-2.amazonaws.com',
        )
        self.assertIn('/us-east-2/s3/aws4_request', credential)
        self.assertEqual(query['X-Amz-Algorithm'], ['AWS4-HMAC-SHA256'])
        self.assertEqual(query['X-Amz-Expires'], ['300'])
        self.assertEqual(
            query['response-content-disposition'],
            ["inline; filename*=UTF-8''test.pdf"],
        )
