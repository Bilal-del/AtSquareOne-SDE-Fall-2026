from django.contrib.auth.hashers import is_password_usable, make_password
from django.db import migrations


LEGACY_OWNER_USERNAME = '__squareone_legacy_application_owner__'


def assign_legacy_owner(apps, schema_editor):
    Application = apps.get_model('api', 'Application')
    database_alias = schema_editor.connection.alias

    unowned_applications = Application.objects.using(database_alias).filter(
        owner__isnull=True
    )
    if not unowned_applications.exists():
        return

    User = apps.get_model('auth', 'User')
    legacy_owner, created = User.objects.using(database_alias).get_or_create(
        username=LEGACY_OWNER_USERNAME,
        defaults={
            'is_active': False,
            'is_staff': False,
            'is_superuser': False,
            'password': make_password(None),
        },
    )

    if not created and (
        legacy_owner.is_active
        or legacy_owner.is_staff
        or legacy_owner.is_superuser
        or is_password_usable(legacy_owner.password)
    ):
        raise RuntimeError(
            'The reserved legacy owner username belongs to a usable account.'
        )

    unowned_applications.update(owner=legacy_owner)


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_application_owner_nullable'),
    ]

    operations = [
        migrations.RunPython(assign_legacy_owner, migrations.RunPython.noop),
    ]
