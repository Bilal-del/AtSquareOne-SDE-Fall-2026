from django.conf import settings
from django.db import models


class Job(models.Model):
    title = models.CharField(max_length=200)
    company = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

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
