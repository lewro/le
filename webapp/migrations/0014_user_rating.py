# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-24 15:22
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webapp', '0013_auto_20180921_1344'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='rating',
            field=models.FloatField(blank=True, max_length=255, null=True),
        ),
    ]
