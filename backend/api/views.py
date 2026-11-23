import os
import re
import uuid

from django.db import transaction
from django.db.models import Prefetch, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .document_storage import (
    DocumentStorageError,
    create_download_url,
    delete_document,
    upload_document,
)
from .document_validation import sanitize_filename, validate_document_file
from .models import (
    Application,
    ApplicationActivity,
    ApplicationDocument,
    ApplicationReminder,
    Document,
    Job,
)
from .permissions import IsStaffOrReadOnly
from .serializers import (
    ApplicationDuplicateSerializer,
    ApplicationActivitySerializer,
    ApplicationReminderSerializer,
    ApplicationSerializer,
    ApplicationDocumentAttachSerializer,
    DocumentSerializer,
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
        ).prefetch_related(
            Prefetch(
                'reminders',
                queryset=ApplicationReminder.objects.filter(enabled=True).order_by(
                    'due_date', 'due_time', 'id',
                ),
                to_attr='enabled_reminder_summaries',
            )
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

    @action(detail=True, methods=['get', 'post'])
    def documents(self, request, pk=None):
        application = self.get_object()
        if request.method == 'GET':
            documents = Document.objects.filter(
                application_links__application=application,
                owner=request.user,
            ).prefetch_related('application_links__application')
            return Response(DocumentSerializer(documents, many=True).data)

        input_serializer = ApplicationDocumentAttachSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        document = get_object_or_404(
            Document,
            pk=input_serializer.validated_data['document_id'],
            owner=request.user,
        )
        link, created = ApplicationDocument.objects.get_or_create(
            application=application,
            document=document,
        )
        if not created:
            return Response(
                {'document_id': 'This document is already attached.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            DocumentSerializer(document).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=['delete'],
        url_path=r'documents/(?P<document_id>\d+)',
    )
    def document_detail(self, request, document_id=None, pk=None):
        application = self.get_object()
        link = get_object_or_404(
            ApplicationDocument,
            application=application,
            document_id=document_id,
            document__owner=request.user,
        )
        link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'])
    def activity(self, request, pk=None):
        application = self.get_object()
        serializer = ApplicationActivitySerializer(
            application.activities.all(),
            many=True,
        )
        return Response(serializer.data)

    @action(detail=True, methods=['get', 'post'])
    def reminders(self, request, pk=None):
        application = self.get_object()
        if request.method == 'GET':
            serializer = ApplicationReminderSerializer(
                application.reminders.all(),
                many=True,
            )
            return Response(serializer.data)

        serializer = ApplicationReminderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(application=application)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=['patch', 'delete'],
        url_path=r'reminders/(?P<reminder_id>\d+)',
    )
    def reminder_detail(self, request, reminder_id=None, pk=None):
        application = self.get_object()
        reminder = get_object_or_404(
            application.reminders,
            pk=reminder_id,
        )
        if request.method == 'DELETE':
            reminder.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        serializer = ApplicationReminderSerializer(
            reminder,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='reminder-control')
    def reminder_control(self, request, pk=None):
        application = self.get_object()
        enabled = request.data.get('enabled')
        if not isinstance(enabled, bool):
            raise ValidationError({
                'enabled': 'Enter true to enable or false to disable reminders.',
            })
        affected = application.reminders.exclude(enabled=enabled).update(
            enabled=enabled,
            updated_at=timezone.now(),
        )
        return Response({'enabled': enabled, 'affected': affected})

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
        owned_application = self.get_object()
        reminder_action = request.data.get('reminder_action', 'continue')
        if reminder_action not in {'continue', 'pause'}:
            raise ValidationError({
                'reminder_action': 'Use continue or pause.',
            })

        with transaction.atomic():
            application = Application.objects.select_for_update().get(
                pk=owned_application.pk,
                owner=request.user,
            )
            if application.archived_at is not None:
                return Response(self.get_serializer(application).data)

            if reminder_action == 'pause':
                application.reminders.filter(enabled=True).update(
                    enabled=False,
                    updated_at=timezone.now(),
                )
            application.archived_at = timezone.now()
            application.save(update_fields=['archived_at', 'updated_at'])
            ApplicationActivity.objects.create(
                application=application,
                event_type=ApplicationActivity.EventType.ARCHIVED,
            )

        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        owned_application = self.get_object()
        reminder_action = request.data.get('reminder_action', 'enable')
        if reminder_action not in {'enable', 'disable'}:
            raise ValidationError({
                'reminder_action': 'Use enable or disable.',
            })

        with transaction.atomic():
            application = Application.objects.select_for_update().get(
                pk=owned_application.pk,
                owner=request.user,
            )
            if application.archived_at is None:
                return Response(self.get_serializer(application).data)

            application.reminders.update(
                enabled=reminder_action == 'enable',
                updated_at=timezone.now(),
            )
            application.archived_at = None
            application.save(update_fields=['archived_at', 'updated_at'])
            ApplicationActivity.objects.create(
                application=application,
                event_type=ApplicationActivity.EventType.RESTORED,
            )

        return Response(self.get_serializer(application).data)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        return Response({
            'status': 'healthy',
            'message': 'Django REST API is running!'
        }, status=status.HTTP_200_OK)


class DocumentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    http_method_names = ['get', 'post', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        if not self.request.user.is_authenticated:
            return Document.objects.none()
        queryset = Document.objects.filter(
            owner=self.request.user,
        ).prefetch_related('application_links__application')
        if getattr(self, 'action', None) != 'list':
            return queryset
        search = self.request.query_params.get('search', '').strip()
        category = self.request.query_params.get('category', '').strip()
        if search:
            queryset = queryset.filter(
                Q(display_name__icontains=search)
                | Q(original_filename__icontains=search)
            )
        if category:
            if category not in Document.Category.values:
                raise ValidationError({'category': 'Select a valid category.'})
            queryset = queryset.filter(category=category)
        return queryset

    def create(self, request, *args, **kwargs):
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Choose a document to upload.'})
        filename, content_type = validate_document_file(upload)
        category = request.data.get('category', Document.Category.OTHER)
        if category not in Document.Category.values:
            raise ValidationError({'category': 'Select a valid category.'})
        display_name = str(request.data.get('display_name', filename)).strip()
        if not display_name:
            raise ValidationError({'display_name': 'Display name cannot be blank.'})
        display_name = sanitize_filename(display_name)
        extension = os.path.splitext(filename)[1].lower()
        object_key = f'users/{request.user.pk}/{uuid.uuid4().hex}{extension}'
        try:
            upload_document(upload, object_key, content_type)
        except DocumentStorageError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            document = Document.objects.create(
                owner=request.user,
                original_filename=filename,
                display_name=display_name,
                category=category,
                s3_object_key=object_key,
                file_size=upload.size,
                content_type=content_type,
            )
        except Exception:
            # Compensate for the S3 write when metadata persistence fails.
            try:
                delete_document(object_key)
            except DocumentStorageError:
                pass
            raise
        return Response(
            self.get_serializer(document).data,
            status=status.HTTP_201_CREATED,
        )

    def destroy(self, request, *args, **kwargs):
        document = self.get_object()
        try:
            delete_document(document.s3_object_key)
        except DocumentStorageError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def access(self, request, pk=None):
        document = self.get_object()
        requested_disposition = request.data.get('disposition', 'attachment')
        if requested_disposition not in {'inline', 'attachment'}:
            raise ValidationError({'disposition': 'Use inline or attachment.'})
        disposition = (
            'inline'
            if requested_disposition == 'inline'
            and document.content_type == 'application/pdf'
            else 'attachment'
        )
        try:
            url = create_download_url(
                document.s3_object_key,
                sanitize_filename(document.original_filename),
                document.content_type,
                disposition,
            )
        except DocumentStorageError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            'url': url,
            'expires_in': 300,
            'disposition': disposition,
        })
