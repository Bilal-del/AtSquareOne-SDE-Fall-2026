from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi

# Add this simple view
def home(request):
    return JsonResponse({
        'message': 'Welcome to Job Tracker API',
        'endpoints': {
            'api': '/api/',
            'admin': '/admin/',
            'swagger': '/swagger/',
            'redoc': '/redoc/',
        }
    })

schema_view = get_schema_view(
    openapi.Info(
        title="Job Tracker API",
        default_version='v1',
        description="API for Job Search Application",
    ),
    public=True,
    permission_classes=[permissions.AllowAny],
)

urlpatterns = [
    path('', home, name='home'),  # ← Add this line
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
]
