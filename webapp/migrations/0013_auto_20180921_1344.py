# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-21 13:44
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webapp', '0012_auto_20180921_1342'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='expertise',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
        migrations.AlterField(
            model_name='user',
            name='bio',
            field=models.TextField(blank=True, max_length=255, null=True),
        ),
    ]
