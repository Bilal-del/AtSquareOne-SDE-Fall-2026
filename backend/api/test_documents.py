from io import BytesIO
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from .document_storage import DocumentStorageError
from .models import Application, ApplicationDocument, Document


def pdf_file(name='resume.pdf', content=b'%PDF-1.7\n%%EOF'):
    return SimpleUploadedFile(name, content, content_type='application/pdf')


def docx_file(name='letter.docx'):
    data = BytesIO()
    with ZipFile(data, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<Types/>')
        archive.writestr('word/document.xml', '<document/>')
    return SimpleUploadedFile(name, data.getvalue())


class DocumentAPITests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user('doc-owner', password='testpass123')
        self.other = user_model.objects.create_user('doc-other', password='testpass123')
        self.application = Application.objects.create(
            owner=self.owner,
            job_title='Software Engineer',
            company='SquareOne',
            source=Application.Source.MANUAL,
        )
        self.other_application = Application.objects.create(
            owner=self.other,
            job_title='Private Role',
            company='Other Co',
            source=Application.Source.MANUAL,
        )
        self.document = Document.objects.create(
            owner=self.owner,
            original_filename='resume.pdf',
            display_name='Primary Resume',
            category=Document.Category.RESUME,
            s3_object_key='users/1/one.pdf',
            file_size=20,
            content_type='application/pdf',
        )

    def authenticate(self, user=None):
        self.client.force_authenticate(user or self.owner)

    def test_listing_is_owner_scoped_and_searchable(self):
        Document.objects.create(
            owner=self.other, original_filename='secret.pdf', display_name='Secret',
            category='other', s3_object_key='users/2/secret.pdf', file_size=10,
            content_type='application/pdf',
        )
        self.authenticate()
        response = self.client.get('/api/documents/', {'search': 'primary', 'category': 'resume'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.data['results']], [self.document.id])
        self.assertNotIn('s3_object_key', response.data['results'][0])

    @patch('api.views.upload_document')
    def test_valid_pdf_and_docx_uploads_persist_metadata(self, upload):
        self.authenticate()
        for file_object, category in [(pdf_file('../unsafe.pdf'), 'resume'), (docx_file(), 'cover_letter')]:
            response = self.client.post('/api/documents/', {'file': file_object, 'category': category}, format='multipart')
            self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Document.objects.filter(owner=self.owner).count(), 3)
        self.assertEqual(upload.call_count, 2)
        uploaded = Document.objects.exclude(pk=self.document.pk).first()
        self.assertTrue(uploaded.s3_object_key.startswith(f'users/{self.owner.pk}/'))
        self.assertNotIn('unsafe', uploaded.s3_object_key)

    @patch('api.views.upload_document')
    def test_rejects_extension_content_mismatch_and_oversize(self, upload):
        self.authenticate()
        mismatch = self.client.post('/api/documents/', {'file': SimpleUploadedFile('fake.pdf', b'not pdf')}, format='multipart')
        self.assertEqual(mismatch.status_code, 400)
        unsupported = self.client.post('/api/documents/', {'file': SimpleUploadedFile('notes.txt', b'hello')}, format='multipart')
        self.assertEqual(unsupported.status_code, 400)
        oversized = self.client.post('/api/documents/', {'file': pdf_file(content=b'%PDF-' + b'x' * (10 * 1024 * 1024))}, format='multipart')
        self.assertEqual(oversized.status_code, 400)
        upload.assert_not_called()

    def test_cross_user_metadata_and_access_are_hidden(self):
        self.authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/documents/{self.document.id}/').status_code, 404)
        self.assertEqual(self.client.post(f'/api/documents/{self.document.id}/access/', {'disposition': 'inline'}).status_code, 404)

    @patch('api.views.create_download_url', return_value='https://signed.example/document')
    def test_owner_receives_short_lived_preview_url(self, presign):
        self.authenticate()
        response = self.client.post(f'/api/documents/{self.document.id}/access/', {'disposition': 'inline'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['expires_in'], 300)
        self.assertEqual(response.data['disposition'], 'inline')
        presign.assert_called_once()

    def test_metadata_can_be_renamed_and_recategorized(self):
        self.authenticate()
        response = self.client.patch(f'/api/documents/{self.document.id}/', {'display_name': 'Fall Resume', 'category': 'other'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.document.refresh_from_db()
        self.assertEqual((self.document.display_name, self.document.category), ('Fall Resume', 'other'))

    def test_attach_detach_duplicate_and_cross_owner_protection(self):
        self.authenticate()
        url = f'/api/applications/{self.application.id}/documents/'
        self.assertEqual(self.client.post(url, {'document_id': self.document.id}, format='json').status_code, 201)
        self.assertEqual(self.client.post(url, {'document_id': self.document.id}, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'/api/applications/{self.other_application.id}/documents/', {'document_id': self.document.id}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(f'{url}{self.document.id}/').status_code, 204)
        self.assertTrue(Document.objects.filter(pk=self.document.pk).exists())

    def test_one_document_can_link_to_multiple_applications(self):
        second = Application.objects.create(owner=self.owner, job_title='Developer', company='Example', source='manual')
        self.authenticate()
        for application in (self.application, second):
            self.assertEqual(self.client.post(f'/api/applications/{application.id}/documents/', {'document_id': self.document.id}, format='json').status_code, 201)
        self.assertEqual(self.document.application_links.count(), 2)

    def test_application_deletion_preserves_document(self):
        ApplicationDocument.objects.create(application=self.application, document=self.document)
        self.application.delete()
        self.assertTrue(Document.objects.filter(pk=self.document.pk).exists())
        self.assertFalse(ApplicationDocument.objects.filter(document=self.document).exists())

    def test_archiving_application_preserves_document_association(self):
        from django.utils import timezone

        ApplicationDocument.objects.create(application=self.application, document=self.document)
        self.application.archived_at = timezone.now()
        self.application.save(update_fields=['archived_at'])
        self.assertTrue(ApplicationDocument.objects.filter(
            application=self.application,
            document=self.document,
        ).exists())

    @patch('api.views.delete_document')
    def test_document_deletion_removes_links_not_application(self, delete):
        ApplicationDocument.objects.create(application=self.application, document=self.document)
        self.authenticate()
        self.assertEqual(self.client.delete(f'/api/documents/{self.document.id}/').status_code, 204)
        self.assertFalse(Document.objects.filter(pk=self.document.pk).exists())
        self.assertTrue(Application.objects.filter(pk=self.application.pk).exists())
        delete.assert_called_once_with('users/1/one.pdf')

    @patch('api.views.upload_document', side_effect=DocumentStorageError('The document could not be stored.'))
    def test_upload_failure_does_not_create_metadata(self, _upload):
        self.authenticate()
        response = self.client.post('/api/documents/', {'file': pdf_file('new.pdf')}, format='multipart')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(Document.objects.filter(owner=self.owner).count(), 1)

    @patch('api.views.delete_document', side_effect=DocumentStorageError('The stored document could not be deleted.'))
    def test_delete_failure_preserves_metadata_and_associations(self, _delete):
        ApplicationDocument.objects.create(application=self.application, document=self.document)
        self.authenticate()
        response = self.client.delete(f'/api/documents/{self.document.id}/')
        self.assertEqual(response.status_code, 503)
        self.assertTrue(Document.objects.filter(pk=self.document.pk).exists())
        self.assertTrue(ApplicationDocument.objects.filter(document=self.document).exists())
