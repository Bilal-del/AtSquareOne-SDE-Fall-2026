from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('api', '0009_document_library')]

    operations = [
        migrations.AddField(
            model_name='job',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddIndex(
            model_name='job',
            index=models.Index(
                fields=['deleted_at', '-created_at'],
                name='api_job_archive_created_idx',
            ),
        ),
    ]
