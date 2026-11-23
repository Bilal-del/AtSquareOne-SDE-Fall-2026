from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdminJobViewSet,
    ApplicationViewSet,
    DocumentViewSet,
    HealthCheckView,
    JobViewSet,
)

router = DefaultRouter()
router.register(r'jobs', JobViewSet, basename='job')
router.register(r'applications', ApplicationViewSet, basename='application')
router.register(r'documents', DocumentViewSet, basename='document')

admin_router = DefaultRouter()
admin_router.register(r'jobs', AdminJobViewSet, basename='admin-job')

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('auth/', include('api.auth_urls')),
    path('admin/', include(admin_router.urls)),
    path('', include(router.urls)),
]
