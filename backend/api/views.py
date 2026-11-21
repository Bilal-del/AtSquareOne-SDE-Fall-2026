import re

from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Job, Application
from .permissions import IsStaffOrReadOnly
from .serializers import (
    ApplicationDuplicateSerializer,
    ApplicationSerializer,
    JobSerializer,
)


def normalize_duplicate_value(value):
    """Normalize user-entered identity fields for informational matching."""
    return re.sub(r'\s+', ' ', value.strip()).casefold()


class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [IsStaffOrReadOnly]
    queryset = Job.objects.all().order_by('-created_at')
    serializer_class = JobSerializer


class ApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = ApplicationSerializer

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Application.objects.none()

        queryset = Application.objects.filter(
            owner=self.request.user
        ).order_by('-created_at')

        if getattr(self, 'action', None) != 'list':
            return queryset

        archive_state = self.request.query_params.get(
            'archive_state',
            'active',
        )
        if archive_state == 'active':
            queryset = queryset.filter(archived_at__isnull=True)
        elif archive_state == 'archived':
            queryset = queryset.filter(archived_at__isnull=False)
        elif archive_state != 'all':
            raise ValidationError({
                'archive_state': 'Use active, archived, or all.',
            })

        application_status = self.request.query_params.get('status')
        if application_status:
            if application_status not in Application.Status.values:
                raise ValidationError({
                    'status': 'Select a valid application status.',
                })
            queryset = queryset.filter(status=application_status)

        search = self.request.query_params.get('search', '').strip()
        if search:
            queryset = queryset.filter(
                Q(job_title__icontains=search) | Q(company__icontains=search)
            )

        return queryset

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=['get'], url_path='duplicates')
    def duplicates(self, request):
        job_id = None
        job_title = request.query_params.get('job_title', '')
        company = request.query_params.get('company', '')
        raw_job_id = request.query_params.get('job')

        if raw_job_id is not None:
            try:
                job_id = int(raw_job_id)
                if job_id <= 0:
                    raise ValueError
            except (TypeError, ValueError) as exc:
                raise ValidationError({
                    'job': 'Enter a valid job ID.',
                }) from exc

            try:
                job = Job.objects.get(pk=job_id)
            except Job.DoesNotExist as exc:
                raise ValidationError({
                    'job': 'The selected job does not exist.',
                }) from exc

            job_title = job.title
            company = job.company

        normalized_title = normalize_duplicate_value(job_title)
        normalized_company = normalize_duplicate_value(company)
        if job_id is None and (not normalized_title or not normalized_company):
            raise ValidationError({
                'detail': (
                    'Provide a job ID or both job title and company.'
                ),
            })

        matches = []
        candidates = self.get_queryset().only(
            'id',
            'job_id',
            'job_title',
            'company',
            'source',
            'status',
            'archived_at',
        )
        for application in candidates:
            same_job = job_id is not None and application.job_id == job_id
            same_identity = (
                normalize_duplicate_value(application.job_title)
                == normalized_title
                and normalize_duplicate_value(application.company)
                == normalized_company
            )
            if same_job or same_identity:
                matches.append(application)

        serializer = ApplicationDuplicateSerializer(matches, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        application = self.get_object()
        if application.archived_at is None:
            # Reminder state changes will join this operation transactionally
            # when the reminder domain is introduced.
            application.archived_at = timezone.now()
            application.save(update_fields=['archived_at', 'updated_at'])

        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        application = self.get_object()
        if application.archived_at is not None:
            # Reminder state changes will join this operation transactionally
            # when the reminder domain is introduced.
            application.archived_at = None
            application.save(update_fields=['archived_at', 'updated_at'])

        return Response(self.get_serializer(application).data)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        return Response({
            'status': 'healthy',
            'message': 'Django REST API is running!'
        }, status=status.HTTP_200_OK)
