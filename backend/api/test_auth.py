from datetime import timedelta

from django.conf import settings
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIClient, APITestCase
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken


class AuthenticationAPITests(APITestCase):
    csrf_url = '/api/auth/csrf/'
    register_url = '/api/auth/register/'
    login_url = '/api/auth/login/'
    refresh_url = '/api/auth/refresh/'
    logout_url = '/api/auth/logout/'
    me_url = '/api/auth/me/'
    localhost_origin = 'http://localhost:5173'

    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.user = User.objects.create_user(
            username='auth_user',
            password='StrongPassword!2468',
        )
        self.initialize_csrf()

    def initialize_csrf(self, client=None):
        client = client or self.client
        response = client.get(self.csrf_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(settings.CSRF_COOKIE_NAME, response.cookies)
        self.assertFalse(bool(response.cookies[settings.CSRF_COOKIE_NAME]['httponly']))
        return response.cookies[settings.CSRF_COOKIE_NAME].value

    def csrf_headers(self, client=None, origin=None):
        client = client or self.client
        return {
            'HTTP_X_CSRFTOKEN': client.cookies[settings.CSRF_COOKIE_NAME].value,
            'HTTP_ORIGIN': origin or self.localhost_origin,
        }

    def login(self, username='auth_user', password='StrongPassword!2468'):
        return self.client.post(
            self.login_url,
            {'username': username, 'password': password},
            format='json',
            **self.csrf_headers(),
        )

    def test_successful_registration_uses_django_password_hashing(self):
        response = self.client.post(
            self.register_url,
            {
                'username': 'new_user',
                'password': 'AnotherStrongPassword!3579',
                'password_confirm': 'AnotherStrongPassword!3579',
                'is_staff': True,
            },
            format='json',
            **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(set(response.data), {'id', 'username', 'is_staff'})
        self.assertEqual(response.data['username'], 'new_user')
        self.assertFalse(response.data['is_staff'])
        self.assertNotIn(settings.AUTH_REFRESH_COOKIE_NAME, response.cookies)
        user = User.objects.get(username='new_user')
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password('AnotherStrongPassword!3579'))
        self.assertNotEqual(user.password, 'AnotherStrongPassword!3579')

    def test_duplicate_username_is_rejected(self):
        response = self.client.post(
            self.register_url,
            {
                'username': self.user.username,
                'password': 'AnotherStrongPassword!3579',
                'password_confirm': 'AnotherStrongPassword!3579',
            },
            format='json',
            **self.csrf_headers(),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertEqual(User.objects.filter(username=self.user.username).count(), 1)

    def test_password_confirmation_and_django_validation_are_enforced(self):
        mismatch_response = self.client.post(
            self.register_url,
            {
                'username': 'mismatch_user',
                'password': 'AnotherStrongPassword!3579',
                'password_confirm': 'DifferentStrongPassword!3579',
            },
            format='json',
            **self.csrf_headers(),
        )
        weak_response = self.client.post(
            self.register_url,
            {
                'username': 'weak_user',
                'password': 'password',
                'password_confirm': 'password',
            },
            format='json',
            **self.csrf_headers(),
        )

        self.assertEqual(mismatch_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password_confirm', mismatch_response.data)
        self.assertEqual(weak_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', weak_response.data)
        self.assertFalse(User.objects.filter(username='mismatch_user').exists())
        self.assertFalse(User.objects.filter(username='weak_user').exists())

    def test_successful_login_returns_access_and_secure_refresh_cookie(self):
        response = self.login()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(response.data), {'access', 'user'})
        self.assertEqual(response.data['user'], {
            'id': self.user.id,
            'username': self.user.username,
            'is_staff': False,
        })
        access = AccessToken(response.data['access'])
        self.assertEqual(access['user_id'], self.user.id)
        self.assertEqual(access['exp'] - access['iat'], 10 * 60)

        self.assertNotIn('refresh', response.data)
        cookie = response.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Lax')
        self.assertEqual(cookie['path'], '/api/auth/')
        self.assertEqual(bool(cookie['secure']), settings.AUTH_COOKIE_SECURE)
        self.assertEqual(int(cookie['max-age']), 7 * 24 * 60 * 60)

    def test_invalid_and_inactive_logins_use_same_generic_failure(self):
        invalid_response = self.login(password='WrongPassword!1234')
        inactive_user = User.objects.create_user(
            username='inactive_user',
            password='StrongPassword!2468',
            is_active=False,
        )
        inactive_response = self.login(
            username=inactive_user.username,
            password='StrongPassword!2468',
        )

        self.assertEqual(invalid_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(inactive_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(invalid_response.data['detail'], 'Invalid username or password.')
        self.assertEqual(inactive_response.data['detail'], 'Invalid username or password.')
        self.assertNotIn(settings.AUTH_REFRESH_COOKIE_NAME, invalid_response.cookies)
        self.assertNotIn(settings.AUTH_REFRESH_COOKIE_NAME, inactive_response.cookies)

    def test_refresh_rotates_cookie_and_blacklists_previous_token(self):
        login_response = self.login()
        old_refresh = login_response.cookies[
            settings.AUTH_REFRESH_COOKIE_NAME
        ].value
        old_jti = RefreshToken(old_refresh)['jti']

        refresh_response = self.client.post(
            self.refresh_url,
            {},
            format='json',
            **self.csrf_headers(),
        )

        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertEqual(set(refresh_response.data), {'access'})
        AccessToken(refresh_response.data['access'])
        new_refresh = refresh_response.cookies[
            settings.AUTH_REFRESH_COOKIE_NAME
        ].value
        self.assertNotEqual(new_refresh, old_refresh)
        self.assertTrue(
            BlacklistedToken.objects.filter(token__jti=old_jti).exists()
        )

        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = old_refresh
        rejected_response = self.client.post(
            self.refresh_url,
            {},
            format='json',
            **self.csrf_headers(),
        )
        self.assertEqual(rejected_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_rejects_malformed_and_expired_cookie_tokens(self):
        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = 'malformed-token'
        malformed_response = self.client.post(
            self.refresh_url,
            {},
            format='json',
            **self.csrf_headers(),
        )

        expired_token = RefreshToken.for_user(self.user)
        expired_token.set_exp(lifetime=timedelta(seconds=-1))
        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = str(expired_token)
        expired_response = self.client.post(
            self.refresh_url,
            {},
            format='json',
            **self.csrf_headers(),
        )

        self.assertEqual(malformed_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(expired_response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('refresh', malformed_response.data)
        self.assertNotIn('refresh', expired_response.data)

    def test_logout_revokes_refresh_and_is_repeatable(self):
        login_response = self.login()
        refresh_token = login_response.cookies[
            settings.AUTH_REFRESH_COOKIE_NAME
        ].value

        logout_response = self.client.post(
            self.logout_url,
            {},
            format='json',
            **self.csrf_headers(),
        )
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)
        deleted_cookie = logout_response.cookies[settings.AUTH_REFRESH_COOKIE_NAME]
        self.assertEqual(int(deleted_cookie['max-age']), 0)

        repeated_response = self.client.post(
            self.logout_url,
            {},
            format='json',
            **self.csrf_headers(),
        )
        self.assertEqual(repeated_response.status_code, status.HTTP_204_NO_CONTENT)

        self.client.cookies[settings.AUTH_REFRESH_COOKIE_NAME] = refresh_token
        rejected_response = self.client.post(
            self.refresh_url,
            {},
            format='json',
            **self.csrf_headers(),
        )
        self.assertEqual(rejected_response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_requires_bearer_access_token_and_returns_basic_identity(self):
        unauthenticated_response = self.client.get(self.me_url)
        self.assertEqual(
            unauthenticated_response.status_code,
            status.HTTP_401_UNAUTHORIZED,
        )

        login_response = self.login()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {login_response.data['access']}"
        )
        authenticated_response = self.client.get(self.me_url)

        self.assertEqual(authenticated_response.status_code, status.HTTP_200_OK)
        self.assertEqual(authenticated_response.data, {
            'id': self.user.id,
            'username': self.user.username,
            'is_staff': False,
        })

    def test_all_cookie_authentication_posts_reject_missing_csrf(self):
        unprotected_client = APIClient(enforce_csrf_checks=True)
        self.initialize_csrf(unprotected_client)

        requests = [
            (
                self.register_url,
                {
                    'username': 'csrf_user',
                    'password': 'AnotherStrongPassword!3579',
                    'password_confirm': 'AnotherStrongPassword!3579',
                },
            ),
            (
                self.login_url,
                {
                    'username': self.user.username,
                    'password': 'StrongPassword!2468',
                },
            ),
            (self.refresh_url, {}),
            (self.logout_url, {}),
        ]

        for url, data in requests:
            with self.subTest(url=url):
                response = unprotected_client.post(url, data, format='json')
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_both_local_vite_origins_are_csrf_trusted_and_cors_allowed(self):
        origins = [
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ]

        for index, origin in enumerate(origins):
            with self.subTest(origin=origin):
                client = APIClient(enforce_csrf_checks=True)
                self.initialize_csrf(client)
                response = client.post(
                    self.register_url,
                    {
                        'username': f'origin_user_{index}',
                        'password': 'AnotherStrongPassword!3579',
                        'password_confirm': 'AnotherStrongPassword!3579',
                    },
                    format='json',
                    **self.csrf_headers(client, origin),
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
                self.assertEqual(
                    response.headers['Access-Control-Allow-Origin'],
                    origin,
                )

    def test_legacy_body_token_routes_are_not_available(self):
        token_response = self.client.post(
            '/api/token/',
            {'username': self.user.username, 'password': 'StrongPassword!2468'},
            format='json',
        )
        refresh_response = self.client.post(
            '/api/token/refresh/',
            {'refresh': 'not-accepted'},
            format='json',
        )

        self.assertEqual(token_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(refresh_response.status_code, status.HTTP_404_NOT_FOUND)
