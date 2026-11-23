from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Application, ApplicationReminder, Job


APPLICATION_STATUSES = (
    'saved',
    'applied',
    'interviewing',
    'offered',
    'accepted',
    'rejected',
    'withdrawn',
    'closed',
)


class JobAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='job_user', password='testpassword123'
        )
        self.staff_user = User.objects.create_user(
            username='job_staff', password='testpassword123', is_staff=True
        )
        self.job = Job.objects.create(
            title='Software Engineer',
            company='Example Company',
            location='Chicago, IL',
            description='Develop and maintain software.',
        )
        self.job_data = {
            'title': 'Cloud Engineer',
            'company': 'Another Company',
            'location': 'Remote',
            'description': 'Maintain cloud infrastructure.',
        }

    def test_anonymous_users_can_browse_jobs(self):
        list_response = self.client.get('/api/jobs/')
        detail_response = self.client.get(f'/api/jobs/{self.job.id}/')
        head_response = self.client.head('/api/jobs/')
        options_response = self.client.options('/api/jobs/')

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
        self.assertEqual(head_response.status_code, status.HTTP_200_OK)
        self.assertEqual(options_response.status_code, status.HTTP_200_OK)
        self.assertEqual(detail_response.data['title'], self.job.title)

    def test_anonymous_users_cannot_modify_jobs(self):
        create_response = self.client.post(
            '/api/jobs/', self.job_data, format='json'
        )
        update_response = self.client.patch(
            f'/api/jobs/{self.job.id}/', {'title': 'Changed'}, format='json'
        )
        delete_response = self.client.delete(f'/api/jobs/{self.job.id}/')

        self.assertEqual(create_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(update_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(delete_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Job.objects.filter(pk=self.job.pk).exists())

    def test_authenticated_non_staff_users_cannot_modify_jobs(self):
        self.client.force_authenticate(user=self.user)

        create_response = self.client.post(
            '/api/jobs/', self.job_data, format='json'
        )
        update_response = self.client.patch(
            f'/api/jobs/{self.job.id}/', {'title': 'Changed'}, format='json'
        )
        delete_response = self.client.delete(f'/api/jobs/{self.job.id}/')

        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(update_response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)
        self.job.refresh_from_db()
        self.assertEqual(self.job.title, 'Software Engineer')

    def test_staff_users_can_manage_jobs(self):
        self.client.force_authenticate(user=self.staff_user)

        create_response = self.client.post(
            '/api/jobs/', self.job_data, format='json'
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        job_id = create_response.data['id']
        update_response = self.client.patch(
            f'/api/jobs/{job_id}/',
            {'title': 'Senior Cloud Engineer'},
            format='json',
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        delete_response = self.client.delete(f'/api/jobs/{job_id}/')
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        archived_job = Job.objects.get(pk=job_id)
        self.assertIsNotNone(archived_job.deleted_at)


class ApplicationAPITests(APITestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(
            username='application_user_a', password='testpassword123'
        )
        self.user_b = User.objects.create_user(
            username='application_user_b', password='testpassword123'
        )
        self.job = Job.objects.create(
            title='Software Engineer',
            company='Example Company',
            location='Chicago, IL',
            description='Develop software applications.',
        )

    def create_application(self, owner, **overrides):
        values = {
            'owner': owner,
            'job': self.job,
            'job_title': self.job.title,
            'company': self.job.company,
            'status': 'applied',
        }
        values.update(overrides)
        return Application.objects.create(**values)

    def create_manual_application(self, owner, **overrides):
        values = {
            'owner': owner,
            'job': None,
            'job_title': 'Manual Software Engineer',
            'company': 'Manual Example Company',
            'source': Application.Source.MANUAL,
            'status': 'saved',
        }
        values.update(overrides)
        return Application.objects.create(**values)

    def test_anonymous_application_access_is_rejected(self):
        application = self.create_application(self.user_a)

        list_response = self.client.get('/api/applications/')
        detail_response = self.client.get(
            f'/api/applications/{application.id}/'
        )
        create_response = self.client.post(
            '/api/applications/', {'job': self.job.id}, format='json'
        )
        duplicate_response = self.client.get(
            f'/api/applications/duplicates/?job={self.job.id}'
        )
        archive_response = self.client.post(
            f'/api/applications/{application.id}/archive/'
        )

        self.assertEqual(list_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(detail_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(create_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(
            duplicate_response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )
        self.assertEqual(archive_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_create_application_with_automatic_owner(self):
        self.client.force_authenticate(user=self.user_a)

        response = self.client.post(
            '/api/applications/',
            {
                'owner': self.user_b.id,
                'job': self.job.id,
                'status': 'applied',
                'notes': 'Submitted application online.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        application = Application.objects.get(pk=response.data['id'])
        self.assertEqual(application.owner, self.user_a)
        self.assertEqual(response.data['owner'], self.user_a.id)
        self.assertEqual(response.data['job_title'], self.job.title)
        self.assertEqual(response.data['company'], self.job.company)

    def test_user_cannot_view_modify_or_delete_another_users_application(self):
        application = self.create_application(self.user_b)
        self.client.force_authenticate(user=self.user_a)

        detail_response = self.client.get(
            f'/api/applications/{application.id}/'
        )
        for application_status in APPLICATION_STATUSES:
            with self.subTest(status=application_status):
                update_response = self.client.patch(
                    f'/api/applications/{application.id}/',
                    {
                        'status': application_status,
                        'owner': self.user_a.id,
                    },
                    format='json',
                )
                self.assertEqual(
                    update_response.status_code,
                    status.HTTP_404_NOT_FOUND,
                )

        delete_response = self.client.delete(
            f'/api/applications/{application.id}/'
        )
        archive_response = self.client.post(
            f'/api/applications/{application.id}/archive/'
        )
        restore_response = self.client.post(
            f'/api/applications/{application.id}/restore/'
        )

        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(delete_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(archive_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(restore_response.status_code, status.HTTP_404_NOT_FOUND)
        application.refresh_from_db()
        self.assertEqual(application.owner, self.user_b)
        self.assertEqual(application.status, 'applied')

    def test_application_list_contains_only_authenticated_users_records(self):
        own_application = self.create_application(self.user_a)
        self.create_application(self.user_b, status='saved')
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get('/api/applications/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], own_application.id)

    def test_application_list_includes_next_enabled_reminder_summary(self):
        own_application = self.create_application(self.user_a)
        other_application = self.create_application(self.user_b)
        ApplicationReminder.objects.create(
            application=own_application,
            title='Disabled earlier reminder',
            due_date='2026-11-22',
            enabled=False,
        )
        expected = ApplicationReminder.objects.create(
            application=own_application,
            title='Prepare interview notes',
            due_date='2026-11-23',
            due_time='09:30',
        )
        ApplicationReminder.objects.create(
            application=own_application,
            title='Later follow-up',
            due_date='2026-11-24',
        )
        ApplicationReminder.objects.create(
            application=other_application,
            title='Private reminder',
            due_date='2026-11-21',
        )
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get('/api/applications/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['next_reminder'], {
            'id': expected.id,
            'title': 'Prepare interview notes',
            'due_date': '2026-11-23',
            'due_time': '09:30:00',
        })

    def test_owner_cannot_be_changed_by_client(self):
        application = self.create_application(self.user_a)
        self.client.force_authenticate(user=self.user_a)

        response = self.client.patch(
            f'/api/applications/{application.id}/',
            {'owner': self.user_b.id, 'status': 'interviewing'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.owner, self.user_a)
        self.assertEqual(application.status, 'interviewing')

    def test_application_crud_remains_available_to_owner(self):
        self.client.force_authenticate(user=self.user_a)
        create_response = self.client.post(
            '/api/applications/',
            {'job': self.job.id, 'status': 'applied'},
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        application_id = create_response.data['id']
        detail_response = self.client.get(
            f'/api/applications/{application_id}/'
        )
        self.assertEqual(detail_response.status_code, status.HTTP_200_OK)

        update_response = self.client.patch(
            f'/api/applications/{application_id}/',
            {'status': 'interviewing'},
            format='json',
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        delete_response = self.client.delete(
            f'/api/applications/{application_id}/'
        )
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Application.objects.filter(pk=application_id).exists())

    def test_application_survives_job_deletion(self):
        application = self.create_application(self.user_a)

        self.job.delete()
        application.refresh_from_db()

        self.assertIsNone(application.job)
        self.assertEqual(application.job_title, 'Software Engineer')
        self.assertEqual(application.company, 'Example Company')

    def test_application_is_deleted_with_its_owner(self):
        application = self.create_application(self.user_a)

        self.user_a.delete()

        self.assertFalse(Application.objects.filter(pk=application.pk).exists())

    def test_invalid_application_status_is_rejected(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            '/api/applications/',
            {'job': self.job.id, 'status': 'unknown_status'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_all_application_statuses_are_accepted_in_display_order(self):
        self.assertEqual(tuple(Application.Status.values), APPLICATION_STATUSES)
        self.client.force_authenticate(user=self.user_a)

        for application_status in APPLICATION_STATUSES:
            with self.subTest(status=application_status):
                response = self.client.post(
                    '/api/applications/',
                    {'job': self.job.id, 'status': application_status},
                    format='json',
                )

                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(response.data['status'], application_status)
                self.assertEqual(
                    Application.objects.get(pk=response.data['id']).status,
                    application_status,
                )

    def test_owner_can_transition_between_any_two_valid_statuses(self):
        application = self.create_application(self.user_a)
        self.client.force_authenticate(user=self.user_a)

        for source_status in APPLICATION_STATUSES:
            application.status = source_status
            application.save(update_fields=['status'])

            for target_status in APPLICATION_STATUSES:
                with self.subTest(
                    source=source_status,
                    target=target_status,
                ):
                    response = self.client.patch(
                        f'/api/applications/{application.id}/',
                        {'status': target_status},
                        format='json',
                    )

                    self.assertEqual(response.status_code, status.HTTP_200_OK)
                    self.assertEqual(response.data['status'], target_status)

    def test_database_constraint_rejects_unknown_application_status(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_application(self.user_a, status='unknown_status')

    def test_application_requires_job(self):
        self.client.force_authenticate(user=self.user_a)
        response = self.client.post(
            '/api/applications/', {'status': 'applied'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_linked_application_rejects_job_and_snapshot_edits(self):
        application = self.create_application(self.user_a)
        other_job = Job.objects.create(
            title='Cloud Engineer',
            company='Another Company',
            location='Remote',
            description='Maintain cloud infrastructure.',
        )
        self.client.force_authenticate(user=self.user_a)

        response = self.client.patch(
            f'/api/applications/{application.id}/',
            {
                'job': other_job.id,
                'job_title': 'Changed title',
                'company': 'Changed company',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('job', response.data)
        self.assertIn('job_title', response.data)
        self.assertIn('company', response.data)
        application.refresh_from_db()
        self.assertEqual(application.job, self.job)
        self.assertEqual(application.job_title, 'Software Engineer')
        self.assertEqual(application.company, 'Example Company')

    def test_linked_application_personal_fields_do_not_modify_job(self):
        application = self.create_application(self.user_a)
        self.client.force_authenticate(user=self.user_a)

        response = self.client.patch(
            f'/api/applications/{application.id}/',
            {
                'location': 'New York, NY',
                'external_job_url': 'https://jobs.example.com/software',
                'work_arrangement': 'remote',
                'employment_type': 'contract',
                'notes': 'Application-specific information.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.job.refresh_from_db()
        self.assertEqual(application.job, self.job)
        self.assertEqual(application.location, 'New York, NY')
        self.assertEqual(application.work_arrangement, 'remote')
        self.assertEqual(self.job.location, 'Chicago, IL')
        self.assertEqual(self.job.title, 'Software Engineer')

    def test_manual_application_creation_trims_required_fields_and_defaults(self):
        self.client.force_authenticate(user=self.user_a)

        response = self.client.post(
            '/api/applications/',
            {
                'job_title': '  Software Engineer  ',
                'company': '  Example Corp  ',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        application = Application.objects.get(pk=response.data['id'])
        self.assertEqual(application.owner, self.user_a)
        self.assertIsNone(application.job)
        self.assertEqual(application.source, Application.Source.MANUAL)
        self.assertEqual(application.job_title, 'Software Engineer')
        self.assertEqual(application.company, 'Example Corp')
        self.assertEqual(application.status, Application.Status.SAVED)
        self.assertIsNone(application.archived_at)

    def test_manual_application_rejects_missing_or_blank_required_fields(self):
        self.client.force_authenticate(user=self.user_a)
        invalid_payloads = (
            ({'company': 'Example Corp'}, 'job_title'),
            ({'job_title': 'Software Engineer'}, 'company'),
            ({'job_title': '   ', 'company': 'Example Corp'}, 'job_title'),
            ({'job_title': 'Software Engineer', 'company': '   '}, 'company'),
        )

        for payload, expected_field in invalid_payloads:
            with self.subTest(payload=payload):
                response = self.client.post(
                    '/api/applications/',
                    payload,
                    format='json',
                )
                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )
                self.assertIn(expected_field, response.data)

    def test_manual_application_optional_fields_are_persisted(self):
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'job_title': 'Platform Engineer',
            'company': 'Example Corp',
            'location': 'Chicago, IL',
            'applied_date': '2026-11-20',
            'status': 'interviewing',
            'external_job_url': 'https://jobs.example.com/platform',
            'work_arrangement': 'hybrid',
            'employment_type': 'full_time',
            'notes': 'Met the team at a career fair.',
        }

        response = self.client.post(
            '/api/applications/',
            payload,
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        for field, value in payload.items():
            self.assertEqual(response.data[field], value)

        application = Application.objects.get(pk=response.data['id'])
        self.assertEqual(application.location, payload['location'])
        self.assertEqual(application.work_arrangement, 'hybrid')
        self.assertEqual(application.employment_type, 'full_time')

    def test_manual_application_title_and_company_are_editable(self):
        application = self.create_manual_application(self.user_a)
        self.client.force_authenticate(user=self.user_a)

        response = self.client.patch(
            f'/api/applications/{application.id}/',
            {
                'job_title': '  Senior Software Engineer ',
                'company': ' Updated Example Company ',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.job_title, 'Senior Software Engineer')
        self.assertEqual(application.company, 'Updated Example Company')
        self.assertIsNone(application.job)
        self.assertEqual(application.source, Application.Source.MANUAL)

    def test_duplicate_lookup_matches_linked_application_by_job(self):
        application = self.create_application(self.user_a)
        self.job.title = 'Renamed Listing'
        self.job.save(update_fields=['title'])
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get(
            f'/api/applications/duplicates/?job={self.job.id}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([match['id'] for match in response.data], [application.id])

    def test_duplicate_lookup_normalizes_manual_title_and_company(self):
        application = self.create_manual_application(
            self.user_a,
            job_title='Software   Engineer',
            company='Example   Corp',
        )
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get(
            '/api/applications/duplicates/',
            {
                'job_title': '  software engineer ',
                'company': ' example corp  ',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([match['id'] for match in response.data], [application.id])

    def test_duplicate_lookup_matches_across_manual_and_linked_sources(self):
        manual_application = self.create_manual_application(
            self.user_a,
            job_title=self.job.title.lower(),
            company=self.job.company.upper(),
        )
        linked_application = self.create_application(self.user_a)
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get(
            f'/api/applications/duplicates/?job={self.job.id}'
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertCountEqual(
            [match['id'] for match in response.data],
            [manual_application.id, linked_application.id],
        )

    def test_duplicate_lookup_includes_archived_and_excludes_other_users(self):
        archived_application = self.create_manual_application(
            self.user_a,
            archived_at=timezone.now(),
        )
        self.create_manual_application(self.user_b)
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get(
            '/api/applications/duplicates/',
            {
                'job_title': archived_application.job_title,
                'company': archived_application.company,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], archived_application.id)
        self.assertIsNotNone(response.data[0]['archived_at'])

    def test_duplicate_creation_is_permitted(self):
        self.client.force_authenticate(user=self.user_a)
        payload = {
            'job_title': 'Software Engineer',
            'company': 'Example Corp',
        }

        first_response = self.client.post(
            '/api/applications/', payload, format='json'
        )
        second_response = self.client.post(
            '/api/applications/', payload, format='json'
        )

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(first_response.data['id'], second_response.data['id'])

    def test_duplicate_lookup_is_not_limited_by_list_pagination(self):
        target = self.create_manual_application(
            self.user_a,
            job_title='Older Target Role',
            company='Pagination Company',
        )
        for index in range(12):
            self.create_manual_application(
                self.user_a,
                job_title=f'Newer Role {index}',
                company='Another Company',
            )
        self.client.force_authenticate(user=self.user_a)

        response = self.client.get(
            '/api/applications/duplicates/',
            {
                'job_title': 'older target role',
                'company': 'pagination company',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([match['id'] for match in response.data], [target.id])

    def test_archive_and_restore_preserve_status_and_application_data(self):
        application = self.create_manual_application(
            self.user_a,
            status='accepted',
            notes='Preserve this note.',
        )
        self.client.force_authenticate(user=self.user_a)

        archive_response = self.client.post(
            f'/api/applications/{application.id}/archive/'
        )

        self.assertEqual(archive_response.status_code, status.HTTP_200_OK)
        self.assertEqual(archive_response.data['status'], 'accepted')
        self.assertIsNotNone(archive_response.data['archived_at'])
        application.refresh_from_db()
        self.assertEqual(application.status, 'accepted')
        self.assertEqual(application.notes, 'Preserve this note.')

        restore_response = self.client.post(
            f'/api/applications/{application.id}/restore/'
        )

        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        self.assertEqual(restore_response.data['status'], 'accepted')
        self.assertIsNone(restore_response.data['archived_at'])

    def test_archived_application_remains_editable(self):
        application = self.create_manual_application(
            self.user_a,
            archived_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.user_a)

        response = self.client.patch(
            f'/api/applications/{application.id}/',
            {
                'job_title': 'Updated Archived Role',
                'status': 'closed',
                'notes': 'Updated while archived.',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        application.refresh_from_db()
        self.assertEqual(application.job_title, 'Updated Archived Role')
        self.assertEqual(application.status, 'closed')
        self.assertEqual(application.notes, 'Updated while archived.')
        self.assertIsNotNone(application.archived_at)

    def test_archive_status_and_search_filters_compose_and_are_owner_scoped(self):
        active_match = self.create_manual_application(
            self.user_a,
            job_title='Platform Engineer',
            company='Matching Company',
            status='interviewing',
        )
        archived_match = self.create_manual_application(
            self.user_a,
            job_title='Platform Engineer',
            company='Matching Company',
            status='interviewing',
            archived_at=timezone.now(),
        )
        self.create_manual_application(
            self.user_b,
            job_title='Platform Engineer',
            company='Matching Company',
            status='interviewing',
            archived_at=timezone.now(),
        )
        self.client.force_authenticate(user=self.user_a)

        default_response = self.client.get('/api/applications/')
        archived_response = self.client.get(
            '/api/applications/',
            {
                'archive_state': 'archived',
                'status': 'interviewing',
                'search': 'Matching',
            },
        )
        all_response = self.client.get(
            '/api/applications/',
            {
                'archive_state': 'all',
                'status': 'interviewing',
                'search': 'Platform',
            },
        )

        self.assertEqual(
            [item['id'] for item in default_response.data['results']],
            [active_match.id],
        )
        self.assertEqual(
            [item['id'] for item in archived_response.data['results']],
            [archived_match.id],
        )
        self.assertCountEqual(
            [item['id'] for item in all_response.data['results']],
            [active_match.id, archived_match.id],
        )
