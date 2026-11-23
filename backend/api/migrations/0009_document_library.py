import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0008_application_activity_and_reminders'),
    ]

    operations = [
        migrations.CreateModel(
            name='Document',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('original_filename', models.CharField(max_length=255)),
                ('display_name', models.CharField(max_length=255)),
                ('category', models.CharField(choices=[('resume', 'Resume'), ('cover_letter', 'Cover Letter'), ('certificate', 'Certificate'), ('transcript', 'Transcript'), ('other', 'Other')], default='other', max_length=20)),
                ('s3_object_key', models.CharField(max_length=512, unique=True)),
                ('file_size', models.PositiveBigIntegerField()),
                ('content_type', models.CharField(max_length=100)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-uploaded_at', '-id']},
        ),
        migrations.CreateModel(
            name='ApplicationDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attached_at', models.DateTimeField(auto_now_add=True)),
                ('application', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='document_links', to='api.application')),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='application_links', to='api.document')),
            ],
        ),
        migrations.AddField(model_name='document', name='applications', field=models.ManyToManyField(related_name='documents', through='api.ApplicationDocument', to='api.application')),
        migrations.AddIndex(model_name='document', index=models.Index(fields=['owner', 'category', 'uploaded_at'], name='api_doc_owner_cat_time_idx')),
        migrations.AddIndex(model_name='applicationdocument', index=models.Index(fields=['application', 'attached_at'], name='api_app_doc_app_time_idx')),
        migrations.AddConstraint(model_name='applicationdocument', constraint=models.UniqueConstraint(fields=('application', 'document'), name='api_unique_application_document')),
    ]
