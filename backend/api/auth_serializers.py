from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer


class UserIdentitySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'is_staff']
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    username = serializers.CharField(
        max_length=User._meta.get_field('username').max_length,
        validators=[
            UnicodeUsernameValidator(),
            UniqueValidator(
                queryset=User.objects.all(),
                message='A user with that username already exists.',
            ),
        ],
    )
    password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={'input_type': 'password'},
    )
    password_confirm = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        style={'input_type': 'password'},
    )

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': 'Passwords do not match.'
            })

        candidate = User(username=attrs['username'])
        try:
            validate_password(attrs['password'], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({
                'password': list(exc.messages)
            }) from exc

        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        try:
            with transaction.atomic():
                return User.objects.create_user(**validated_data)
        except IntegrityError as exc:
            raise serializers.ValidationError({
                'username': 'A user with that username already exists.'
            }) from exc


class CookieTokenObtainPairSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        'no_active_account': 'Invalid username or password.',
    }
