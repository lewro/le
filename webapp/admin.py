# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.contrib import admin
from django.contrib.auth import get_user_model

# Register your custom models here.
from .models import Expertise
from .models import Message
from .models import Rating
from .models import News
from .models import Interviews

User = get_user_model()

admin.site.register(User)
admin.site.register(Expertise)
admin.site.register(Message)
admin.site.register(Rating)
admin.site.register(News)
admin.site.register(Interviews)
