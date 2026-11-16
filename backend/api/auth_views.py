from django.conf import settings
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.exceptions import APIException, AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .auth_serializers import (
    CookieTokenObtainPairSerializer,
    RegisterSerializer,
    UserIdentitySerializer,
)
from .throttles import LoginRateThrottle, RegistrationRateThrottle


class AuthenticationRejected(APIException):
    status_code = status.HTTP_401_UNAUTHORIZED
    default_detail = 'Authentication failed.'
    default_code = 'authentication_failed'


def set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value=str(refresh_token),
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        httponly=True,
        secure=settings.AUTH_COOKIE_SECURE,
        samesite=settings.AUTH_REFRESH_COOKIE_SAMESITE,
        path=settings.AUTH_REFRESH_COOKIE_PATH,
    )


def delete_refresh_cookie(response):
    response.set_cookie(
        key=settings.AUTH_REFRESH_COOKIE_NAME,
        value='',
        max_age=0,
        expires='Thu, 01 Jan 1970 00:00:00 GMT',
        path=settings.AUTH_REFRESH_COOKIE_PATH,
        secure=settings.AUTH_COOKIE_SECURE,
        httponly=True,
        samesite=settings.AUTH_REFRESH_COOKIE_SAMESITE,
    )


@method_decorator(csrf_protect, name='dispatch')
class CsrfProtectedAPIView(APIView):
    """APIView whose dispatch enforces CSRF even for anonymous requests."""


@method_decorator(ensure_csrf_cookie, name='dispatch')
class CsrfCookieView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        get_token(request)
        return Response({'detail': 'CSRF cookie initialized.'})


class RegisterView(CsrfProtectedAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RegistrationRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserIdentitySerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(CsrfProtectedAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        serializer = CookieTokenObtainPairSerializer(
            data=request.data,
            context={'request': request},
        )
        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed as exc:
            raise AuthenticationRejected(
                'Invalid username or password.'
            ) from exc

        response = Response({
            'access': serializer.validated_data['access'],
            'user': UserIdentitySerializer(serializer.user).data,
        })
        set_refresh_cookie(response, serializer.validated_data['refresh'])
        return response


class RefreshView(CsrfProtectedAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        if not refresh_token:
            raise AuthenticationRejected(
                'Refresh token is missing or invalid.'
            )

        serializer = TokenRefreshSerializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except (InvalidToken, TokenError) as exc:
            raise AuthenticationRejected(
                'Refresh token is invalid or expired.'
            ) from exc

        response = Response({'access': serializer.validated_data['access']})
        set_refresh_cookie(response, serializer.validated_data['refresh'])
        return response


class LogoutView(CsrfProtectedAPIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        refresh_token = request.COOKIES.get(settings.AUTH_REFRESH_COOKIE_NAME)
        if refresh_token:
            try:
                RefreshToken(refresh_token).blacklist()
            except TokenError:
                pass

        response = Response(status=status.HTTP_204_NO_CONTENT)
        delete_refresh_cookie(response)
        return response


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserIdentitySerializer(request.user).data)
