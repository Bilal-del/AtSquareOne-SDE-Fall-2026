from rest_framework import serializers

from .models import Job, Application


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = [
            'id', 'title', 'company', 'location',
            'description', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ApplicationSerializer(serializers.ModelSerializer):
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
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'owner', 'source', 'archived_at',
            'created_at', 'updated_at',
        ]

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
        job = validated_data.get('job')
        if job is not None:
            validated_data['job_title'] = job.title
            validated_data['company'] = job.company
            validated_data['source'] = Application.Source.SQUAREONE
        else:
            validated_data['source'] = Application.Source.MANUAL

        return super().create(validated_data)


class ApplicationDuplicateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Application
        fields = [
            'id', 'job', 'job_title', 'company', 'source',
            'status', 'archived_at',
        ]
        read_only_fields = fields
