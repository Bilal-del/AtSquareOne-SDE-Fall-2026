from unittest.mock import patch

from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Application, ApplicationActivity, ApplicationReminder


class ApplicationActivityAndReminderTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='milestone3_owner',
            password='test-password',
        )
        self.other_user = User.objects.create_user(
            username='milestone3_other',
            password='test-password',
        )
        self.application = Application.objects.create(
            owner=self.owner,
            job=None,
            job_title='Platform Engineer',
            company='Example Corp',
            source=Application.Source.MANUAL,
            status=Application.Status.SAVED,
        )
        self.client.force_authenticate(user=self.owner)

    def create_reminder(self, **overrides):
        values = {
            'application': self.application,
            'title': 'Follow up with recruiter',
            'due_date': '2026-12-01',
            'enabled': True,
        }
        values.update(overrides)
        return ApplicationReminder.objects.create(**values)

    def test_application_creation_records_owner_scoped_activity(self):
        response = self.client.post(
            '/api/applications/',
            {
                'job_title': 'Data Engineer',
                'company': 'New Example Corp',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = Application.objects.get(pk=response.data['id'])
        activity = created.activities.get()
        self.assertEqual(activity.event_type, ApplicationActivity.EventType.CREATED)

        activity_response = self.client.get(
            f'/api/applications/{created.id}/activity/'
        )
        self.assertEqual(activity_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            activity_response.data[0]['description'],
            'Application created.',
        )

        self.client.force_authenticate(user=self.other_user)
        denied = self.client.get(f'/api/applications/{created.id}/activity/')
        self.assertEqual(denied.status_code, status.HTTP_404_NOT_FOUND)

    def test_status_changes_record_history_but_unchanged_status_does_not(self):
        changed = self.client.patch(
            f'/api/applications/{self.application.id}/',
            {'status': Application.Status.INTERVIEWING},
            format='json',
        )
        unchanged = self.client.patch(
            f'/api/applications/{self.application.id}/',
            {'status': Application.Status.INTERVIEWING, 'notes': 'No new status.'},
            format='json',
        )
        changed_again = self.client.patch(
            f'/api/applications/{self.application.id}/',
            {'status': Application.Status.OFFERED},
            format='json',
        )

        self.assertEqual(changed.status_code, status.HTTP_200_OK)
        self.assertEqual(unchanged.status_code, status.HTTP_200_OK)
        self.assertEqual(changed_again.status_code, status.HTTP_200_OK)
        activities = list(self.application.activities.all())
        self.assertEqual(len(activities), 2)
        activity = activities[0]
        self.assertEqual(
            activity.event_type,
            ApplicationActivity.EventType.STATUS_CHANGED,
        )
        self.assertEqual(activity.previous_status, Application.Status.SAVED)
        self.assertEqual(activity.new_status, Application.Status.INTERVIEWING)
        self.assertEqual(
            activities[1].previous_status,
            Application.Status.INTERVIEWING,
        )
        self.assertEqual(activities[1].new_status, Application.Status.OFFERED)

    def test_activity_is_read_only(self):
        response = self.client.post(
            f'/api/applications/{self.application.id}/activity/',
            {'event_type': 'archived'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertFalse(self.application.activities.exists())

    def test_reminder_crud_and_individual_toggle(self):
        create_response = self.client.post(
            f'/api/applications/{self.application.id}/reminders/',
            {
                'title': '  Send thank-you note  ',
                'due_date': '2026-12-02',
                'due_time': '14:30:00',
                'note': 'Keep it concise.',
            },
            format='json',
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        reminder_id = create_response.data['id']
        self.assertEqual(create_response.data['title'], 'Send thank-you note')
        self.assertTrue(create_response.data['enabled'])

        update_response = self.client.patch(
            f'/api/applications/{self.application.id}/reminders/{reminder_id}/',
            {'title': 'Updated follow-up', 'enabled': False},
            format='json',
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        self.assertEqual(update_response.data['title'], 'Updated follow-up')
        self.assertFalse(update_response.data['enabled'])

        list_response = self.client.get(
            f'/api/applications/{self.application.id}/reminders/'
        )
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)

        delete_response = self.client.delete(
            f'/api/applications/{self.application.id}/reminders/{reminder_id}/'
        )
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ApplicationReminder.objects.filter(pk=reminder_id).exists())

    def test_reminder_validation_rejects_blank_title_and_missing_due_date(self):
        response = self.client.post(
            f'/api/applications/{self.application.id}/reminders/',
            {'title': '   '},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('title', response.data)
        self.assertIn('due_date', response.data)

    def test_application_level_reminder_control_updates_all_records(self):
        first = self.create_reminder()
        second = self.create_reminder(title='Prepare questions', enabled=False)

        disable_response = self.client.post(
            f'/api/applications/{self.application.id}/reminder-control/',
            {'enabled': False},
            format='json',
        )
        self.assertEqual(disable_response.status_code, status.HTTP_200_OK)
        self.assertEqual(disable_response.data['affected'], 1)
        self.assertFalse(
            ApplicationReminder.objects.filter(
                pk__in=[first.id, second.id],
                enabled=True,
            ).exists()
        )

        enable_response = self.client.post(
            f'/api/applications/{self.application.id}/reminder-control/',
            {'enabled': True},
            format='json',
        )
        self.assertEqual(enable_response.data['affected'], 2)
        self.assertEqual(
            ApplicationReminder.objects.filter(
                pk__in=[first.id, second.id],
                enabled=True,
            ).count(),
            2,
        )

    def test_archived_application_reminders_remain_manageable(self):
        self.application.archived_at = timezone.now()
        self.application.save(update_fields=['archived_at'])
        reminder = self.create_reminder()

        response = self.client.patch(
            f'/api/applications/{self.application.id}/reminders/{reminder.id}/',
            {'enabled': False},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['enabled'])

    def test_archive_and_restore_apply_choices_and_record_activity(self):
        first = self.create_reminder()
        second = self.create_reminder(title='Prepare questions', enabled=False)
        original_status = self.application.status

        archive_response = self.client.post(
            f'/api/applications/{self.application.id}/archive/',
            {'reminder_action': 'pause'},
            format='json',
        )
        self.assertEqual(archive_response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertIsNotNone(self.application.archived_at)
        self.assertEqual(self.application.status, original_status)
        self.assertFalse(
            ApplicationReminder.objects.filter(
                pk__in=[first.id, second.id], enabled=True
            ).exists()
        )

        restore_response = self.client.post(
            f'/api/applications/{self.application.id}/restore/',
            {'reminder_action': 'enable'},
            format='json',
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        self.application.refresh_from_db()
        self.assertIsNone(self.application.archived_at)
        self.assertEqual(self.application.status, original_status)
        self.assertEqual(
            ApplicationReminder.objects.filter(
                pk__in=[first.id, second.id], enabled=True
            ).count(),
            2,
        )
        self.assertEqual(
            list(self.application.activities.values_list('event_type', flat=True)),
            [
                ApplicationActivity.EventType.ARCHIVED,
                ApplicationActivity.EventType.RESTORED,
            ],
        )

    def test_archive_continue_preserves_individual_reminder_states(self):
        enabled = self.create_reminder()
        disabled = self.create_reminder(title='Disabled reminder', enabled=False)

        response = self.client.post(
            f'/api/applications/{self.application.id}/archive/',
            {'reminder_action': 'continue'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        enabled.refresh_from_db()
        disabled.refresh_from_db()
        self.assertTrue(enabled.enabled)
        self.assertFalse(disabled.enabled)

        restore_response = self.client.post(
            f'/api/applications/{self.application.id}/restore/',
            {'reminder_action': 'disable'},
            format='json',
        )
        self.assertEqual(restore_response.status_code, status.HTTP_200_OK)
        enabled.refresh_from_db()
        disabled.refresh_from_db()
        self.assertFalse(enabled.enabled)
        self.assertFalse(disabled.enabled)

    def test_archive_is_atomic_when_activity_creation_fails(self):
        reminder = self.create_reminder()
        self.client.raise_request_exception = False

        with patch(
            'api.views.ApplicationActivity.objects.create',
            side_effect=RuntimeError('activity write failed'),
        ):
            response = self.client.post(
                f'/api/applications/{self.application.id}/archive/',
                {'reminder_action': 'pause'},
                format='json',
            )

        self.assertEqual(response.status_code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        self.application.refresh_from_db()
        reminder.refresh_from_db()
        self.assertIsNone(self.application.archived_at)
        self.assertTrue(reminder.enabled)
        self.assertFalse(self.application.activities.exists())

    def test_cross_user_reminder_and_archive_access_is_denied(self):
        reminder = self.create_reminder()
        self.client.force_authenticate(user=self.other_user)

        responses = [
            self.client.get(f'/api/applications/{self.application.id}/reminders/'),
            self.client.patch(
                f'/api/applications/{self.application.id}/reminders/{reminder.id}/',
                {'enabled': False},
                format='json',
            ),
            self.client.post(f'/api/applications/{self.application.id}/archive/'),
        ]
        self.assertTrue(
            all(response.status_code == status.HTTP_404_NOT_FOUND for response in responses)
        )
        reminder.refresh_from_db()
        self.application.refresh_from_db()
        self.assertTrue(reminder.enabled)
        self.assertIsNone(self.application.archived_at)

    def test_anonymous_activity_and_reminder_access_is_denied(self):
        self.client.force_authenticate(user=None)

        responses = [
            self.client.get(f'/api/applications/{self.application.id}/activity/'),
            self.client.get(f'/api/applications/{self.application.id}/reminders/'),
            self.client.post(
                f'/api/applications/{self.application.id}/reminder-control/',
                {'enabled': False},
                format='json',
            ),
        ]
        self.assertTrue(
            all(
                response.status_code == status.HTTP_401_UNAUTHORIZED
                for response in responses
            )
        )
