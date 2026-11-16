from django.urls import path

from .auth_views import (
    CsrfCookieView,
    CurrentUserView,
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView,
)


urlpatterns = [
    path('csrf/', CsrfCookieView.as_view(), name='auth-csrf'),
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', CurrentUserView.as_view(), name='auth-me'),
]
