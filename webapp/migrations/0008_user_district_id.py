# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-13 13:34
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webapp', '0007_user_username'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='district_id',
            field=models.IntegerField(blank=True, null=True),
        ),
    ]
