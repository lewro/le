from django.conf.urls import url, include
from django.contrib import admin
from django.views.generic import RedirectView


urlpatterns = [
    url(r'^admin/', admin.site.urls),
    url(r'^i18n/', include('django.conf.urls.i18n')),

    url(r'^', include('webapp.urls')),
    url(r'^login/',  RedirectView.as_view(url='/webapp/login')),
    url(r'^logout/',  RedirectView.as_view(url='/webapp/logout')),
    url(r'^register/',  RedirectView.as_view(url='/webapp/register')),
    url(r'^register_expert/',  RedirectView.as_view(url='/webapp/register_expert')),
    url(r'^register_client/',  RedirectView.as_view(url='/webapp/register_client')),
    url(r'^experts_details/',  RedirectView.as_view(url='/webapp/experts_details')),
    url(r'^clients_details/',  RedirectView.as_view(url='/webapp/clients_details')),

    url(r'^webapp/', include('webapp.urls')),
    url(r'^accounts/', include('django.contrib.auth.urls'))
]
