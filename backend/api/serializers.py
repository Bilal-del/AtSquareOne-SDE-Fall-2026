from django.db import transaction
from rest_framework import serializers

from .models import (
    Application,
    ApplicationActivity,
    ApplicationReminder,
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
