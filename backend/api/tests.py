
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from .models import Job, Application

class JobAPITests(APITestCase):

    def setUp(self):
        # Create a test user and authenticate requests.
        self.user = User.objects.create_user(
            username="testuser",
            password="testpassword123"
        )
        self.client.force_authenticate(user=self.user)

    def test_job_crud(self):
        # CREATE
        job_data = {
            "title": "Software Engineer",
            "company": "Example Company",
            "location": "Chicago, IL",
            "description": "Develop and maintain software."
        }

        response = self.client.post(
            "/api/jobs/", job_data, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        job_id = response.data["id"]
        self.assertEqual(Job.objects.count(), 1)

        # READ
        response = self.client.get(f"/api/jobs/{job_id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Software Engineer")

        # UPDATE
        response = self.client.patch(
            f"/api/jobs/{job_id}/",
            {"title": "Senior Software Engineer"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Verify the updated record was saved.
        job = Job.objects.get(id=job_id)
        self.assertEqual(job.title, "Senior Software Engineer")

        # DELETE
        response = self.client.delete(f"/api/jobs/{job_id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Job.objects.count(), 0)

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)

        response = self.client.get("/api/jobs/")
        self.assertEqual(
            response.status_code,
            status.HTTP_401_UNAUTHORIZED
        )



class ApplicationAPITests(APITestCase):

    def setUp(self):
        self.user = User.objects.create_user(
            username="application_testuser",
            password="testpassword123"
        )
        self.client.force_authenticate(user=self.user)

        self.job = Job.objects.create(
            title="Software Engineer",
            company="Example Company",
            location="Chicago, IL",
            description="Develop software applications."
        )

    def test_application_crud(self):
        # CREATE
        response = self.client.post(
            "/api/applications/",
            {
                "job": self.job.id,
                "status": "applied",
                "notes": "Submitted application online."
            },
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        application_id = response.data["id"]

        # Verify job details were preserved.
        self.assertEqual(response.data["job_title"], "Software Engineer")
        self.assertEqual(response.data["company"], "Example Company")

        # READ
        response = self.client.get(
            f"/api/applications/{application_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # UPDATE
        response = self.client.patch(
            f"/api/applications/{application_id}/",
            {"status": "interviewing"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # DELETE
        response = self.client.delete(
            f"/api/applications/{application_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Application.objects.count(), 0)

    def test_application_survives_job_deletion(self):
        application = Application.objects.create(
            job=self.job,
            job_title=self.job.title,
            company=self.job.company,
            status="applied"
        )

        self.job.delete()
        application.refresh_from_db()

        self.assertIsNone(application.job)
        self.assertEqual(application.job_title, "Software Engineer")
        self.assertEqual(application.company, "Example Company")

    def test_invalid_application_status(self):
        response = self.client.post(
            "/api/applications/",
            {
                "job": self.job.id,
                "status": "unknown_status"
            },
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_application_requires_job(self):
        response = self.client.post(
            "/api/applications/",
            {"status": "applied"},
            format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/applications/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reassign_application_job(self):
        application = Application.objects.create(
            job=self.job,
            job_title=self.job.title,
            company=self.job.company,
            status="applied"
        )

        other_job = Job.objects.create(
            title="Cloud Engineer",
            company="Another Company",
            location="Remote",
            description="Maintain cloud infrastructure."
        )

        response = self.client.patch(
            f"/api/applications/{application.id}/",
            {"job": other_job.id},
            format="json"
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        application.refresh_from_db()
        self.assertEqual(application.job, other_job)
        self.assertEqual(application.job_title, "Cloud Engineer")
        self.assertEqual(application.company, "Another Company")
