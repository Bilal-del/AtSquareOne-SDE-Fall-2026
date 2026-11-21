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


class ApplicationStatusContractMigrationTests(TransactionTestCase):
    migrate_from = [('api', '0005_application_owner_required')]
    migrate_to = [('api', '0006_application_status_contract')]
    existing_statuses = (
        'saved',
        'applied',
        'interviewing',
        'offered',
        'rejected',
    )

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps

        User = old_apps.get_model('auth', 'User')
        Job = old_apps.get_model('api', 'Job')
        Application = old_apps.get_model('api', 'Application')
        owner = User.objects.create(username='status_migration_owner')
        job = Job.objects.create(
            title='Status Migration Role',
            company='Status Migration Company',
            location='Remote',
            description='Verifies existing status values are preserved.',
        )
        for application_status in self.existing_statuses:
            Application.objects.create(
                owner=owner,
                job=job,
                job_title=job.title,
                company=job.company,
                status=application_status,
            )

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        self.apps = executor.loader.project_state(self.migrate_to).apps

    def test_existing_status_values_are_preserved(self):
        Application = self.apps.get_model('api', 'Application')

        self.assertCountEqual(
            Application.objects.values_list('status', flat=True),
            self.existing_statuses,
        )

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()


class ApplicationDomainFoundationMigrationTests(TransactionTestCase):
    migrate_from = [('api', '0006_application_status_contract')]
    migrate_to = [('api', '0007_application_domain_foundation')]

    def setUp(self):
        super().setUp()
        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_from)
        old_apps = executor.loader.project_state(self.migrate_from).apps

        User = old_apps.get_model('auth', 'User')
        Job = old_apps.get_model('api', 'Job')
        Application = old_apps.get_model('api', 'Application')
        owner = User.objects.create(username='domain_migration_owner')
        job = Job.objects.create(
            title='Existing Role',
            company='Existing Company',
            location='Chicago, IL',
            description='An application that predates Milestone 2.',
        )
        self.application_id = Application.objects.create(
            owner=owner,
            job=job,
            job_title=job.title,
            company=job.company,
            status='offered',
            notes='Existing notes must remain unchanged.',
        ).pk

        executor = MigrationExecutor(connection)
        executor.migrate(self.migrate_to)
        self.apps = executor.loader.project_state(self.migrate_to).apps

    def test_existing_application_remains_active_and_squareone_linked(self):
        Application = self.apps.get_model('api', 'Application')
        application = Application.objects.get(pk=self.application_id)

        self.assertEqual(application.status, 'offered')
        self.assertEqual(application.notes, 'Existing notes must remain unchanged.')
        self.assertEqual(application.source, 'squareone')
        self.assertIsNone(application.archived_at)
        self.assertEqual(application.location, '')
        self.assertEqual(application.external_job_url, '')
        self.assertEqual(application.work_arrangement, '')
        self.assertEqual(application.employment_type, '')

    def tearDown(self):
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()
