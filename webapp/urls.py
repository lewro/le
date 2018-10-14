# -*- coding: utf-8 -*-

from django.conf.urls import url
from . import views
from django.contrib.auth.views import login
from webapp.views import terms, privacy, about, logout_user, search, messages, news, create_message, create_rating, register, register_expert, register_client

from django.conf.urls.static import static
from django.conf import settings

urlpatterns = [
    url(r'^$', views.index, name = 'index'),
    url(r'^experts_details/$', views.experts_details, name = 'experts_details'),
    url(r'^clients_details/$', views.clients_details, name = 'clients_details'),
    url(r'^login/', login, {'template_name': 'registration/login.html' }),
    url(r'^logout/', logout_user),
    url(r'^register_expert/$', views.register_expert, name = 'register_expert'),
    url(r'^register_client/$', views.register_client, name = 'register_client'),
    url(r'^register/$', views.register, name = 'register'),
    url(r'^search/$', views.search, name = 'search'),
    url(r'^expert/$', views.expert, name = 'expert'),
    url(r'^messages/$', views.messages, name = 'messages'),
    url(r'^news/$', views.news, name = 'news'),
    url(r'^update_profile/$', views.update_profile, name = 'update_profile'),
    url(r'^create_message/$', views.create_message, name = 'create_message'),
    url(r'^create_rating/$', views.create_rating, name = 'create_rating'),
    url(r'^terms/$', views.terms, name = 'terms'),
    url(r'^privacy/$', views.privacy, name = 'privacy'),
    url(r'^about/$', views.about, name = 'about'),


]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
