import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0002_application'),
    ]

    operations = [
        migrations.AddField(
            model_name='application',
            name='owner',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='applications',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
