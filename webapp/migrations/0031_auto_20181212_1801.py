# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-12-12 18:01
from __future__ import unicode_literals

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('webapp', '0030_interviews'),
    ]

    operations = [
        migrations.AlterField(
            model_name='interviews',
            name='user_id',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='user', to=settings.AUTH_USER_MODEL),
        ),
    ]
