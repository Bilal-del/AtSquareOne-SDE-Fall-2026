from django.conf import settings
from django.db import models


class Job(models.Model):
    title = models.CharField(max_length=200)
    company = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(
                fields=['deleted_at', '-created_at'],
                name='api_job_archive_created_idx',
            ),
        ]

    def __str__(self):
        return f"{self.title} at {self.company}"




class Application(models.Model):
    class Source(models.TextChoices):
        SQUAREONE = 'squareone', 'SquareOne'
        MANUAL = 'manual', 'Manual'

    class Status(models.TextChoices):
        SAVED = 'saved', 'Saved'
        APPLIED = 'applied', 'Applied'
        INTERVIEWING = 'interviewing', 'Interviewing'
        OFFERED = 'offered', 'Offered'
        ACCEPTED = 'accepted', 'Accepted'
        REJECTED = 'rejected', 'Rejected'
        WITHDRAWN = 'withdrawn', 'Withdrawn'
        CLOSED = 'closed', 'Closed'

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='applications',
    )

    job = models.ForeignKey(
        Job,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='applications',
    )

    # Preserve job details even if the posting is deleted.
    job_title = models.CharField(max_length=200)
    company = models.CharField(max_length=200)
    source = models.CharField(
        max_length=20,
        choices=Source.choices,
        default=Source.SQUAREONE,
        editable=False,
    )
    location = models.CharField(max_length=200, blank=True)
    external_job_url = models.URLField(blank=True)

    class WorkArrangement(models.TextChoices):
        REMOTE = 'remote', 'Remote'
        HYBRID = 'hybrid', 'Hybrid'
        ON_SITE = 'on_site', 'On-site'

    work_arrangement = models.CharField(
        max_length=20,
        choices=WorkArrangement.choices,
        blank=True,
    )

    class EmploymentType(models.TextChoices):
        FULL_TIME = 'full_time', 'Full-time'
        PART_TIME = 'part_time', 'Part-time'
        INTERNSHIP = 'internship', 'Internship'
        CONTRACT = 'contract', 'Contract'

    employment_type = models.CharField(
        max_length=20,
        choices=EmploymentType.choices,
        blank=True,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.SAVED,
    )

    applied_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(status__in=[
                    'saved',
                    'applied',
                    'interviewing',
                    'offered',
                    'accepted',
                    'rejected',
                    'withdrawn',
                    'closed',
                ]),
                name='api_application_status_valid',
            ),
        ]
        indexes = [
            models.Index(
                fields=['owner', 'archived_at'],
                name='api_app_owner_archive_idx',
            ),
        ]

    def __str__(self):
        return f"{self.job_title} at {self.company} - {self.status}"


class ApplicationActivity(models.Model):
    class EventType(models.TextChoices):
        CREATED = 'created', 'Application created'
        STATUS_CHANGED = 'status_changed', 'Status changed'
        ARCHIVED = 'archived', 'Application archived'
        RESTORED = 'restored', 'Application restored'

    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='activities',
    )
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    previous_status = models.CharField(
        max_length=20,
        choices=Application.Status.choices,
        null=True,
        blank=True,
    )
    new_status = models.CharField(
        max_length=20,
        choices=Application.Status.choices,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
        indexes = [
            models.Index(
                fields=['application', 'created_at'],
                name='api_activity_app_created_idx',
            ),
        ]

    def __str__(self):
        return f"{self.application_id}: {self.get_event_type_display()}"


class ApplicationReminder(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='reminders',
    )
    title = models.CharField(max_length=200)
    due_date = models.DateField()
    due_time = models.TimeField(null=True, blank=True)
    note = models.TextField(blank=True)
    enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date', 'due_time', 'id']
        indexes = [
            models.Index(
                fields=['application', 'enabled', 'due_date'],
                name='api_reminder_app_enabled_idx',
            ),
        ]

    def __str__(self):
        return f"{self.title} for application {self.application_id}"


class Document(models.Model):
    class Category(models.TextChoices):
        RESUME = 'resume', 'Resume'
        COVER_LETTER = 'cover_letter', 'Cover Letter'
        CERTIFICATE = 'certificate', 'Certificate'
        TRANSCRIPT = 'transcript', 'Transcript'
        OTHER = 'other', 'Other'

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='documents',
    )
    original_filename = models.CharField(max_length=255)
    display_name = models.CharField(max_length=255)
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.OTHER,
    )
    s3_object_key = models.CharField(max_length=512, unique=True)
    file_size = models.PositiveBigIntegerField()
    content_type = models.CharField(max_length=100)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    applications = models.ManyToManyField(
        Application,
        through='ApplicationDocument',
        related_name='documents',
    )

    class Meta:
        ordering = ['-uploaded_at', '-id']
        indexes = [
            models.Index(
                fields=['owner', 'category', 'uploaded_at'],
                name='api_doc_owner_cat_time_idx',
            ),
        ]

    def __str__(self):
        return self.display_name


class ApplicationDocument(models.Model):
    application = models.ForeignKey(
        Application,
        on_delete=models.CASCADE,
        related_name='document_links',
    )
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='application_links',
    )
    attached_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['application', 'document'],
                name='api_unique_application_document',
            ),
        ]
        indexes = [
            models.Index(
                fields=['application', 'attached_at'],
                name='api_app_doc_app_time_idx',
            ),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError

        if (
            self.application_id
            and self.document_id
            and self.application.owner_id != self.document.owner_id
        ):
            raise ValidationError(
                'The document and application must have the same owner.'
            )
