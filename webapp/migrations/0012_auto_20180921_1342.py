# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-21 13:42
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('webapp', '0011_expertise_category_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='bio',
            field=models.CharField(blank=True, max_length=255, null=True),
        ),
    ]
