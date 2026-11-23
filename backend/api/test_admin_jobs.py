from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Application,
    ApplicationActivity,
    ApplicationDocument,
    ApplicationReminder,
    Document,
    Job,
)


class AdminJobAPITests(APITestCase):
    def setUp(self):
        self.staff = User.objects.create_user('admin_jobs', password='safe-test', is_staff=True)
        self.user = User.objects.create_user('ordinary_jobs', password='safe-test')
        self.active = Job.objects.create(
            title='Active Engineer', company='Square Test', location='Remote',
            description='An active fictional role.',
        )
        self.archived = Job.objects.create(
            title='Archived Analyst', company='Square Test', location='Chicago, IL',
            description='An archived fictional role.', deleted_at=timezone.now(),
        )

    def test_admin_api_rejects_anonymous_and_nonstaff_users(self):
        self.assertEqual(self.client.get('/api/admin/jobs/').status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get('/api/admin/jobs/').status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post('/api/admin/jobs/', {'title': 'Nope'}, format='json').status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_staff_can_create_edit_and_new_job_is_public(self):
        self.assertFalse(self.staff.is_superuser)
        self.client.force_authenticate(self.staff)
        payload = {
            'title': 'Platform Intern', 'company': 'Fictional Labs',
            'location': 'Remote', 'description': 'Build safe demo systems.',
        }
        created = self.client.post('/api/admin/jobs/', payload, format='json')
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        job_id = created.data['id']
        edited = self.client.patch(
            f'/api/admin/jobs/{job_id}/', {'title': 'Platform Engineering Intern'}, format='json'
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(None)
        public = self.client.get(f'/api/jobs/{job_id}/')
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data['title'], 'Platform Engineering Intern')

    def test_archive_hides_public_record_and_restore_is_idempotent(self):
        self.client.force_authenticate(self.staff)
        first = self.client.post(f'/api/admin/jobs/{self.active.id}/archive/')
        second = self.client.post(f'/api/admin/jobs/{self.active.id}/archive/')
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data['deleted_at'], second.data['deleted_at'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/jobs/{self.active.id}/').status_code, status.HTTP_404_NOT_FOUND)
        ids = [row['id'] for row in self.client.get('/api/jobs/').data['results']]
        self.assertNotIn(self.active.id, ids)
        self.client.force_authenticate(self.staff)
        restored = self.client.post(f'/api/admin/jobs/{self.active.id}/restore/')
        again = self.client.post(f'/api/admin/jobs/{self.active.id}/restore/')
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        self.assertIsNone(again.data['deleted_at'])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f'/api/jobs/{self.active.id}/').status_code, status.HTTP_200_OK)

    def test_listing_has_counts_search_state_filter_and_pagination(self):
        for number in range(12):
            Job.objects.create(
                title=f'Paged Role {number}', company='Pagination Co',
                location='Remote', description='Synthetic test data.',
            )
        self.client.force_authenticate(self.staff)
        response = self.client.get('/api/admin/jobs/?archive_state=active&search=Paged&page=1')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 12)
        self.assertEqual(len(response.data['results']), 10)
        self.assertEqual(response.data['summary'], {'active': 13, 'archived': 1, 'total': 14})
        archived = self.client.get('/api/admin/jobs/?archive_state=archived')
        self.assertEqual(archived.data['count'], 1)
        self.assertEqual(archived.data['results'][0]['id'], self.archived.id)

    def test_archiving_preserves_application_snapshot_reminder_and_document(self):
        application = Application.objects.create(
            owner=self.user, job=self.active, job_title=self.active.title,
            company=self.active.company, status='applied',
        )
        reminder = ApplicationReminder.objects.create(
            application=application, title='Follow up', due_date='2026-12-01'
        )
        activity = ApplicationActivity.objects.create(
            application=application,
            event_type=ApplicationActivity.EventType.CREATED,
        )
        document = Document.objects.create(
            owner=self.user, original_filename='resume.pdf', display_name='Resume',
            category='resume', s3_object_key='tests/resume.pdf', file_size=42,
            content_type='application/pdf',
        )
        link = ApplicationDocument.objects.create(application=application, document=document)
        self.client.force_authenticate(self.staff)
        self.client.post(f'/api/admin/jobs/{self.active.id}/archive/')
        application.refresh_from_db()
        self.assertEqual(application.job_id, self.active.id)
        self.assertEqual(application.job_title, 'Active Engineer')
        self.assertEqual(application.company, 'Square Test')
        self.assertTrue(ApplicationActivity.objects.filter(pk=activity.pk).exists())
        self.assertTrue(ApplicationReminder.objects.filter(pk=reminder.pk).exists())
        self.assertTrue(ApplicationDocument.objects.filter(pk=link.pk).exists())
        self.assertTrue(Document.objects.filter(pk=document.pk).exists())

        edited = self.client.patch(
            f'/api/admin/jobs/{self.active.id}/',
            {'title': 'Edited While Archived'},
            format='json',
        )
        self.assertEqual(edited.status_code, status.HTTP_200_OK)
        self.active.refresh_from_db()
        self.assertIsNotNone(self.active.deleted_at)

        restored = self.client.post(
            f'/api/admin/jobs/{self.active.id}/restore/'
        )
        self.assertEqual(restored.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.job_id, self.active.id)
        self.assertEqual(application.job_title, 'Active Engineer')
        self.assertEqual(application.company, 'Square Test')

    def test_archived_job_cannot_be_newly_saved_to_tracker(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(
            '/api/applications/', {'job': self.archived.id, 'status': 'saved'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('job', response.data)
