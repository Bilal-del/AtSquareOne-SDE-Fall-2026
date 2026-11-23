from django.db import transaction
from rest_framework import serializers

from .document_validation import sanitize_filename
from .models import (
    Application,
    ApplicationActivity,
    ApplicationReminder,
    Document,
    Job,
)


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            'id', 'title', 'company', 'location',
            'description', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class AdminJobSerializer(JobSerializer):
    status = serializers.SerializerMethodField()

    class Meta(JobSerializer.Meta):
        fields = [*JobSerializer.Meta.fields, 'deleted_at', 'status']
        read_only_fields = [
            *JobSerializer.Meta.read_only_fields,
            'deleted_at',
            'status',
        ]

    def get_status(self, job):
        return 'archived' if job.deleted_at else 'active'


class ApplicationSerializer(serializers.ModelSerializer):
    next_reminder = serializers.SerializerMethodField()
    job_title = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=False,
        trim_whitespace=True,
    )
    company = serializers.CharField(
        max_length=200,
        required=False,
        allow_blank=False,
        trim_whitespace=True,
    )

    class Meta:
        model = Application
        fields = [
            'id', 'owner', 'job', 'job_title', 'company',
            'source', 'location', 'external_job_url',
            'work_arrangement', 'employment_type',
            'status', 'applied_date', 'notes', 'archived_at',
            'created_at', 'updated_at', 'next_reminder',
        ]
        read_only_fields = [
            'id', 'owner', 'source', 'archived_at',
            'created_at', 'updated_at', 'next_reminder',
        ]

    def get_next_reminder(self, application):
        reminders = getattr(application, 'enabled_reminder_summaries', None)
        reminder = reminders[0] if reminders else None
        if reminders is None:
            reminder = application.reminders.filter(enabled=True).first()
        if reminder is None:
            return None
        return {
            'id': reminder.id,
            'title': reminder.title,
            'due_date': reminder.due_date.isoformat(),
            'due_time': (
                reminder.due_time.isoformat() if reminder.due_time else None
            ),
        }

    def validate(self, attrs):
        errors = {}

        if self.instance is None:
            job = attrs.get('job')
            if job is not None:
                if job.deleted_at is not None:
                    errors['job'] = 'Archived jobs cannot be saved to the tracker.'
                if 'job_title' in attrs:
                    errors['job_title'] = (
                        'Job title is set by the linked SquareOne job.'
                    )
                if 'company' in attrs:
                    errors['company'] = (
                        'Company is set by the linked SquareOne job.'
                    )
            else:
                if not attrs.get('job_title'):
                    errors['job_title'] = (
                        'Job title is required for a manual application.'
                    )
                if not attrs.get('company'):
                    errors['company'] = (
                        'Company is required for a manual application.'
                    )
        else:
            if 'job' in attrs:
                errors['job'] = (
                    'The original job relationship cannot be changed.'
                )

            if self.instance.source == Application.Source.SQUAREONE:
                if 'job_title' in attrs:
                    errors['job_title'] = (
                        'Job title is read-only for a SquareOne application.'
                    )
                if 'company' in attrs:
                    errors['company'] = (
                        'Company is read-only for a SquareOne application.'
                    )

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def create(self, validated_data):
        with transaction.atomic():
            job = validated_data.get('job')
            if job is not None:
                validated_data['job_title'] = job.title
                validated_data['company'] = job.company
                validated_data['source'] = Application.Source.SQUAREONE
            else:
                validated_data['source'] = Application.Source.MANUAL

            application = super().create(validated_data)
            ApplicationActivity.objects.create(
                application=application,
                event_type=ApplicationActivity.EventType.CREATED,
            )
            return application

    def update(self, instance, validated_data):
        previous_status = instance.status
        with transaction.atomic():
            application = super().update(instance, validated_data)
            if application.status != previous_status:
                ApplicationActivity.objects.create(
                    application=application,
                    event_type=ApplicationActivity.EventType.STATUS_CHANGED,
                    previous_status=previous_status,
                    new_status=application.status,
                )
            return application


class ApplicationDuplicateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = [
            'id', 'job', 'job_title', 'company', 'source',
            'status', 'archived_at',
        ]
        read_only_fields = fields


class ApplicationActivitySerializer(serializers.ModelSerializer):
    description = serializers.SerializerMethodField()

    class Meta:
        model = ApplicationActivity
        fields = [
            'id', 'event_type', 'previous_status', 'new_status',
            'description', 'created_at',
        ]
        read_only_fields = fields

    def get_description(self, activity):
        if activity.event_type == ApplicationActivity.EventType.STATUS_CHANGED:
            previous_label = Application.Status(activity.previous_status).label
            new_label = Application.Status(activity.new_status).label
            return f'Status changed from {previous_label} to {new_label}.'
        return {
            ApplicationActivity.EventType.CREATED: 'Application created.',
            ApplicationActivity.EventType.ARCHIVED: 'Application archived.',
            ApplicationActivity.EventType.RESTORED: 'Application restored.',
        }[activity.event_type]


class ApplicationReminderSerializer(serializers.ModelSerializer):
    title = serializers.CharField(
        max_length=200,
        allow_blank=False,
        trim_whitespace=True,
    )

    class Meta:
        model = ApplicationReminder
        fields = [
            'id', 'title', 'due_date', 'due_time', 'note', 'enabled',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class DocumentSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    file_extension = serializers.SerializerMethodField()
    linked_applications = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'original_filename', 'display_name', 'category',
            'category_label', 'file_extension', 'file_size', 'content_type',
            'uploaded_at', 'linked_applications',
        ]
        read_only_fields = [
            'id', 'original_filename', 'file_extension', 'file_size',
            'content_type', 'uploaded_at', 'linked_applications',
        ]

    def get_file_extension(self, document):
        return document.original_filename.rsplit('.', 1)[-1].lower()

    def get_linked_applications(self, document):
        return [
            {
                'id': link.application_id,
                'job_title': link.application.job_title,
                'company': link.application.company,
                'attached_at': link.attached_at,
            }
            for link in document.application_links.all()
        ]

    def validate_display_name(self, value):
        if not value.strip():
            raise serializers.ValidationError('Display name cannot be blank.')
        return sanitize_filename(value.strip())


class ApplicationDocumentAttachSerializer(serializers.Serializer):
    document_id = serializers.IntegerField(min_value=1)
