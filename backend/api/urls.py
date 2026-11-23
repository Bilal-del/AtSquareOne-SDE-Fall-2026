from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ApplicationViewSet, DocumentViewSet, HealthCheckView, JobViewSet

router = DefaultRouter()
router.register(r'jobs', JobViewSet, basename='job')
router.register(r'applications', ApplicationViewSet, basename='application')
router.register(r'documents', DocumentViewSet, basename='document')

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('auth/', include('api.auth_urls')),
    path('', include(router.urls)),
]
