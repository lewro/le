# -*- coding: utf-8 -*-
# Generated by Django 1.11.15 on 2018-09-12 20:25
from __future__ import unicode_literals

from django.db import migrations
import django_countries.fields


class Migration(migrations.Migration):

    dependencies = [
        ('webapp', '0002_auto_20180912_1942'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='country',
            field=django_countries.fields.CountryField(default='CZ', max_length=2),
        ),
    ]
