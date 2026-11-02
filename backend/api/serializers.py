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
    class Meta:
        model = Application
        fields = [
            'id', 'job', 'job_title', 'company',
            'status', 'applied_date', 'notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'job_title', 'company',
            'created_at', 'updated_at'
        ]

    def validate(self, attrs):
        if self.instance is None and not attrs.get('job'):
            raise serializers.ValidationError({
                'job': 'A job is required when creating an application.'
            })
        return attrs

    def create(self, validated_data):
        job = validated_data['job']
        validated_data['job_title'] = job.title
        validated_data['company'] = job.company
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        if 'job' in validated_data:
            job = validated_data['job']

            if job is not None:
                validated_data['job_title'] = job.title
                validated_data['company'] = job.company

        return super().update(instance, validated_data)
