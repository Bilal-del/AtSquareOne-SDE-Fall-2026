from django.contrib.auth.hashers import is_password_usable
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase


class ApplicationOwnershipMigrationTests(TransactionTestCase):
    migrate_from = [('api', '0002_application')]
    migrate_to = [('api', '0005_application_owner_required')]

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps

        Job = old_apps.get_model('api', 'Job')
        Application = old_apps.get_model('api', 'Application')
        job = Job.objects.create(
            title='Legacy Role',
            company='Legacy Company',
            location='Remote',
            description='A record created before ownership existed.',
        )
        self.application_id = Application.objects.create(
            job=job,
            job_title=job.title,
            company=job.company,
            status='applied',
        ).pk

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        self.apps = executor.loader.project_state(self.migrate_to).apps

    def test_existing_application_is_preserved_under_inactive_legacy_owner(self):
        Application = self.apps.get_model('api', 'Application')
        User = self.apps.get_model('auth', 'User')

        application = Application.objects.get(pk=self.application_id)
        legacy_owner = User.objects.get(
            username='__squareone_legacy_application_owner__'
        )

        self.assertEqual(application.owner_id, legacy_owner.pk)
        self.assertFalse(legacy_owner.is_active)
        self.assertFalse(legacy_owner.is_staff)
        self.assertFalse(legacy_owner.is_superuser)
        self.assertFalse(is_password_usable(legacy_owner.password))
        self.assertEqual(application.job_title, 'Legacy Role')

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()
