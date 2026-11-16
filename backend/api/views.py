from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from rest_framework import status
from rest_framework import viewsets
from .models import Job, Application
from .serializers import JobSerializer, ApplicationSerializer

class JobViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    queryset = Job.objects.all().order_by('-created_at')
    serializer_class = JobSerializer


class ApplicationViewSet(viewsets.ModelViewSet):
    permission_classes = [AllowAny]
    queryset = Application.objects.all().order_by('-created_at')
    serializer_class = ApplicationSerializer


class HealthCheckView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        return Response({
            'status': 'healthy',
            'message': 'Django REST API is running!'
        }, status=status.HTTP_200_OK)
